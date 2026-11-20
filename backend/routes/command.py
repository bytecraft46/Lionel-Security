"""Central command broadcasts, incidents, inspections, documents and audit."""
import os
import uuid
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename

from database import db
from models import (
    AuditLog,
    BroadcastAck,
    CommandBroadcast,
    Document,
    Incident,
    Post,
    SiteInspection,
    User,
    dumps,
)
from security import (
    assert_zone_access,
    can_access_guard,
    current_user,
    jwt_required,
    record_audit,
    scoped_zone_ids,
)
from services import day_start, scoped_post_query, todays_logs
from utils.realtime import emit_operational, emit_to_room

command_bp = Blueprint("command", __name__)

STAFF_ROLES = ("CEO", "OPS_MANAGER", "SUPERVISOR")
COMMAND_ROLES = ("CEO", "OPS_MANAGER")


def _recipients(scope: str, zone_ids, post_ids):
    users = {}
    zone_q = Post.query
    if scope == "ZONES" and zone_ids:
        zone_q = zone_q.filter(Post.zone_id.in_(zone_ids))
    elif scope == "POSTS" and post_ids:
        zone_q = zone_q.filter(Post.id.in_(post_ids))
    posts = zone_q.all() if scope != "ALL" else []
    if scope != "ALL":
        target_zones = {p.zone_id for p in posts}
        for supervisor in User.query.filter(User.role == "SUPERVISOR").all():
            if {z.id for z in supervisor.zones} & target_zones:
                users[supervisor.id] = supervisor
        for post in posts:
            if post.supervisor_id and post.supervisor_id not in users:
                supervisor = db.session.get(User, post.supervisor_id)
                if supervisor:
                    users[supervisor.id] = supervisor
        guard_ids = [g.id for g in User.query.filter(User.role == "GUARD").all()]
        for guard in User.query.filter(
            User.role == "GUARD", User.assigned_post_id.in_([p.id for p in posts] or ["__none__"])
        ).all():
            users[guard.id] = guard
        if not users:
            for guard in User.query.filter(User.id.in_(guard_ids or ["__none__"])).all():
                pass
    else:
        for user in User.query.filter(User.is_active.is_(True)).all():
            users[user.id] = user
    return list(users.values())


@command_bp.route("/broadcasts", methods=["GET"])
@jwt_required()
def list_broadcasts():
    user = current_user()
    query = CommandBroadcast.query.order_by(CommandBroadcast.created_at.desc())
    if user.role == "GUARD":
        rows = [
            b
            for b in query.limit(100).all()
            if any(a.user_id == user.id for a in b.acks)
        ]
        return (
            jsonify(
                {
                    "broadcasts": [
                        {
                            **b.to_dict(),
                            "my_ack": next(
                                (a.to_dict() for a in b.acks if a.user_id == user.id),
                                None,
                            ),
                        }
                        for b in rows
                    ]
                }
            ),
            200,
        )
    if user.role == "SUPERVISOR":
        zone_ids = scoped_zone_ids(user) or set()
        rows = [
            b
            for b in query.limit(100).all()
            if b.target_scope == "ALL"
            or set(b.zone_ids) & zone_ids
            or any(a.user_id == user.id for a in b.acks)
        ]
        return (
            jsonify(
                {
                    "broadcasts": [
                        {
                            **b.to_dict(),
                            "my_ack": next(
                                (a.to_dict() for a in b.acks if a.user_id == user.id),
                                None,
                            ),
                        }
                        for b in rows
                    ]
                }
            ),
            200,
        )
    return jsonify({"broadcasts": [b.to_dict() for b in query.limit(100).all()]}), 200


@command_bp.route("/broadcasts", methods=["POST"])
@jwt_required(roles=COMMAND_ROLES)
def create_broadcast():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    if not title or not message:
        return jsonify({"error": "title and message are required."}), 400
    priority = (data.get("priority") or "NORMAL").upper()
    category = (data.get("category") or "POSTURE_CHANGE").upper()
    if priority not in ("NORMAL", "IMPORTANT", "CRITICAL"):
        return jsonify({"error": "Invalid priority."}), 400
    if category not in (
        "EMERGENCY",
        "THREAT_WARNING",
        "WEATHER",
        "POSTURE_CHANGE",
        "VIP_MOVEMENT",
        "REINFORCEMENT",
    ):
        return jsonify({"error": "Invalid category."}), 400
    scope = (data.get("target_scope") or "ALL").upper()
    if scope not in ("ALL", "ZONES", "POSTS"):
        return jsonify({"error": "Invalid target_scope."}), 400
    zone_ids = [str(z) for z in (data.get("target_zone_ids") or [])]
    post_ids = [str(p) for p in (data.get("target_post_ids") or [])]
    if scope == "ZONES" and not zone_ids:
        return jsonify({"error": "target_zone_ids is required for ZONES scope."}), 400
    if scope == "POSTS" and not post_ids:
        return jsonify({"error": "target_post_ids is required for POSTS scope."}), 400

    recipients = _recipients(scope, zone_ids, post_ids)
    broadcast = CommandBroadcast(
        title=title,
        message=message,
        priority=priority,
        category=category,
        issued_by=actor.id,
        target_scope=scope,
        target_zone_ids=dumps(zone_ids),
        target_post_ids=dumps(post_ids),
    )
    db.session.add(broadcast)
    db.session.flush()
    for recipient in recipients:
        db.session.add(
            BroadcastAck(
                broadcast_id=broadcast.id,
                user_id=recipient.id,
                ack_status="NOT_RECEIVED",
                compliance_status="PENDING",
            )
        )
    record_audit(
        "BROADCAST_ISSUED",
        "broadcast",
        broadcast.id,
        {"priority": priority, "category": category, "recipients": len(recipients)},
        user=actor,
    )
    db.session.commit()

    zones_to_notify = zone_ids if scope == "ZONES" else []
    if scope == "ALL":
        zones_to_notify = [z.id for z in Post.query.with_entities(Post.zone_id).distinct()]
    for post_id in post_ids:
        post = db.session.get(Post, post_id)
        if post:
            zones_to_notify.append(post.zone_id)
    payload = broadcast.to_dict()
    # Zone rooms receive their own copy; command desks get a single event.
    for zone_id in set(zones_to_notify):
        emit_to_room(f"zone_{zone_id}", "BROADCAST_ALERT", payload)
    emit_operational("BROADCAST_ALERT", payload)
    return jsonify({"broadcast": broadcast.to_dict(include_acks=True)}), 201


@command_bp.route("/broadcasts/<broadcast_id>", methods=["GET"])
@jwt_required()
def get_broadcast(broadcast_id):
    user = current_user()
    broadcast = db.session.get(CommandBroadcast, broadcast_id)
    if not broadcast:
        return jsonify({"error": "Broadcast not found."}), 404
    if user.role == "SUPERVISOR":
        zone_ids = scoped_zone_ids(user) or set()
        if (
            broadcast.target_scope != "ALL"
            and not (set(broadcast.zone_ids) & zone_ids)
            and not any(a.user_id == user.id for a in broadcast.acks)
        ):
            return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    include_acks = user.role != "GUARD"
    payload = broadcast.to_dict(include_acks=include_acks)
    if user.role == "GUARD":
        payload["my_ack"] = next(
            (a.to_dict() for a in broadcast.acks if a.user_id == user.id), None
        )
    return jsonify({"broadcast": payload}), 200


@command_bp.route("/broadcasts/<broadcast_id>/ack", methods=["POST"])
@jwt_required()
def acknowledge_broadcast(broadcast_id):
    user = current_user()
    broadcast = db.session.get(CommandBroadcast, broadcast_id)
    if not broadcast:
        return jsonify({"error": "Broadcast not found."}), 404
    ack = BroadcastAck.query.filter_by(
        broadcast_id=broadcast.id, user_id=user.id
    ).first()
    if not ack:
        return jsonify({"error": "You are not a recipient of this broadcast."}), 403

    data = request.get_json(silent=True) or {}
    if data.get("ack_status", "RECEIVED").upper() == "RECEIVED":
        ack.ack_status = "RECEIVED"
        ack.acknowledged_at = datetime.utcnow()
    compliance = (data.get("compliance_status") or "").upper()
    if compliance in ("ACTION_TAKEN", "PENDING"):
        ack.compliance_status = compliance
    if data.get("action_notes"):
        ack.action_notes = data["action_notes"]
    record_audit(
        "BROADCAST_ACK", "broadcast", broadcast.id, {"compliance": ack.compliance_status}, user=user
    )
    db.session.commit()
    emit_operational("BROADCAST_ACK_UPDATED", broadcast.to_dict())
    return jsonify({"ack": ack.to_dict(), "broadcast": broadcast.to_dict()}), 200


@command_bp.route("/incidents", methods=["GET"])
@jwt_required()
def list_incidents():
    user = current_user()
    query = Incident.query.order_by(Incident.occurred_at.desc())
    if user.role == "GUARD":
        query = query.filter(Incident.reported_by_id == user.id)
    else:
        zone_ids = scoped_zone_ids(user)
        if zone_ids is not None:
            query = query.filter(
                Incident.zone_id.in_(list(zone_ids) or ["__none__"])
            )
    status = request.args.get("status")
    if status:
        query = query.filter(Incident.status == status.upper())
    rows = query.limit(200).all()
    return jsonify({"incidents": [row.to_dict() for row in rows]}), 200


@command_bp.route("/incidents", methods=["POST"])
@jwt_required()
def create_incident():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    post_id = data.get("post_id")
    post = db.session.get(Post, post_id) if post_id else None
    if not post:
        return jsonify({"error": "A valid post_id is required."}), 400
    if actor.role == "GUARD":
        if actor.assigned_post_id and actor.assigned_post_id != post.id:
            return jsonify({"error": "Guards may only report incidents at their post."}), 403
    else:
        assert_zone_access(actor, post.zone_id)

    incident_type = (data.get("incident_type") or "").upper()
    if incident_type not in (
        "THEFT",
        "BURGLARY",
        "ATTEMPTED_INTRUSION",
        "FIRE",
        "MEDICAL_EMERGENCY",
        "SUSPICIOUS_ACTIVITY",
        "GUARD_MISCONDUCT",
        "CLIENT_COMPLAINT",
        "WEAPON_INCIDENT",
    ):
        return jsonify({"error": "Invalid incident_type."}), 400

    incident = Incident(
        incident_type=incident_type,
        post_id=post.id,
        zone_id=post.zone_id,
        reported_by_id=actor.id,
        personnel_involved=data.get("personnel_involved"),
        occurred_at=datetime.utcnow(),
        immediate_action=data.get("immediate_action"),
        supervisor_report=data.get("supervisor_report"),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        status="OPEN",
    )
    db.session.add(incident)
    record_audit(
        "INCIDENT_REPORTED", "incident", incident.id, {"type": incident_type}, user=actor
    )
    db.session.commit()
    emit_operational("INCIDENT_BROADCAST", incident.to_dict(), zone_id=post.zone_id)
    return jsonify({"incident": incident.to_dict()}), 201


@command_bp.route("/incidents/<incident_id>", methods=["PUT"])
@jwt_required(roles=STAFF_ROLES)
def update_incident(incident_id):
    actor = current_user()
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({"error": "Incident not found."}), 404
    if incident.zone_id:
        assert_zone_access(actor, incident.zone_id)
    data = request.get_json(silent=True) or {}
    for field in ("immediate_action", "supervisor_report", "management_remarks"):
        if field in data:
            setattr(incident, field, data[field])
    status = (data.get("status") or "").upper()
    if status in ("OPEN", "ACKNOWLEDGED", "RESOLVED"):
        incident.status = status
        incident.resolved_at = datetime.utcnow() if status == "RESOLVED" else None
    record_audit("INCIDENT_UPDATED", "incident", incident.id, {"status": incident.status}, user=actor)
    db.session.commit()
    emit_operational("INCIDENT_UPDATED", incident.to_dict(), zone_id=incident.zone_id)
    return jsonify({"incident": incident.to_dict()}), 200


@command_bp.route("/inspections", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def list_inspections():
    user = current_user()
    query = SiteInspection.query.order_by(SiteInspection.inspected_at.desc())
    zone_ids = scoped_zone_ids(user)
    if zone_ids is not None:
        post_ids = [
            p.id
            for p in Post.query.filter(Post.zone_id.in_(list(zone_ids) or ["__none__"])).all()
        ]
        query = query.filter(SiteInspection.post_id.in_(post_ids or ["__none__"]))
    rows = query.limit(100).all()
    scores = [row.score for row in rows if row.score is not None]
    return (
        jsonify(
            {
                "inspections": [row.to_dict() for row in rows],
                "average_score": round(sum(scores) / len(scores), 2) if scores else None,
            }
        ),
        200,
    )


@command_bp.route("/inspections", methods=["POST"])
@jwt_required(roles=("SUPERVISOR", "OPS_MANAGER", "CEO"))
def create_inspection():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    post = db.session.get(Post, data.get("post_id") or "")
    if not post:
        return jsonify({"error": "A valid post_id is required."}), 400
    assert_zone_access(actor, post.zone_id)
    inspection_type = (data.get("inspection_type") or "DAILY").upper()
    if inspection_type not in ("DAILY", "SURPRISE"):
        return jsonify({"error": "Invalid inspection_type."}), 400
    score = data.get("score")
    if score is not None:
        try:
            score = int(score)
        except (TypeError, ValueError):
            return jsonify({"error": "score must be an integer 1-5."}), 400
        if not 1 <= score <= 5:
            return jsonify({"error": "score must be 1-5."}), 400

    inspection = SiteInspection(
        post_id=post.id,
        supervisor_id=actor.id,
        inspection_type=inspection_type,
        turnout_uniform_ok=bool(data.get("turnout_uniform_ok", True)),
        weapons_condition=data.get("weapons_condition"),
        attendance_verified=bool(data.get("attendance_verified", True)),
        security_preparedness=data.get("security_preparedness"),
        client_feedback=data.get("client_feedback"),
        deficiencies=data.get("deficiencies"),
        corrective_action=data.get("corrective_action"),
        score=score,
    )
    db.session.add(inspection)
    record_audit(
        "INSPECTION_RECORDED", "inspection", inspection.id, {"score": score}, user=actor
    )
    db.session.commit()
    emit_operational("INSPECTION_RECORDED", inspection.to_dict(), zone_id=post.zone_id)
    return jsonify({"inspection": inspection.to_dict()}), 201


# ---------------------------------------------------------------------------
# Document repository (private storage, authenticated download)
# ---------------------------------------------------------------------------
def _document_visible(user, doc: Document) -> bool:
    zone_ids = scoped_zone_ids(user)
    if zone_ids is None:
        return True
    if doc.uploaded_by == user.id:
        return True
    if doc.entity_type == "post" and doc.entity_id:
        post = db.session.get(Post, doc.entity_id)
        return bool(post and post.zone_id in zone_ids)
    if doc.entity_type == "guard" and doc.entity_id:
        guard = db.session.get(User, doc.entity_id)
        return bool(guard and can_access_guard(user, guard))
    return False


@command_bp.route("/documents", methods=["GET"])
@jwt_required()
def list_documents():
    user = current_user()
    docs = Document.query.order_by(Document.created_at.desc()).limit(200).all()
    visible = [doc.to_dict() for doc in docs if _document_visible(user, doc)]
    return jsonify({"documents": visible}), 200


@command_bp.route("/documents", methods=["POST"])
@jwt_required(roles=STAFF_ROLES)
def upload_document():
    actor = current_user()
    if "file" not in request.files:
        return jsonify({"error": "file is required."}), 400
    upload = request.files["file"]
    filename = secure_filename(upload.filename or "")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in current_app.config["ALLOWED_UPLOAD_EXTENSIONS"]:
        return jsonify({"error": "Only PDF, JPG and PNG files are allowed."}), 415
    if upload.mimetype not in current_app.config["ALLOWED_UPLOAD_MIMES"]:
        return jsonify({"error": "Unsupported file content type."}), 415

    entity_type = request.form.get("entity_type")
    entity_id = request.form.get("entity_id")
    if entity_type == "post" and entity_id:
        post = db.session.get(Post, entity_id)
        if not post:
            return jsonify({"error": "Related location not found."}), 404
        assert_zone_access(actor, post.zone_id)

    document_id = str(uuid.uuid4())
    stored_name = f"{document_id}.{extension}"
    destination = os.path.join(
        current_app.config["UPLOAD_FOLDER"], "documents", stored_name
    )
    upload.save(destination)
    size = os.path.getsize(destination)

    document = Document(
        id=document_id,
        title=request.form.get("title") or filename,
        category=request.form.get("category") or "GENERAL",
        filename=filename,
        stored_name=stored_name,
        mime_type=upload.mimetype,
        size_bytes=size,
        entity_type=entity_type,
        entity_id=entity_id,
        uploaded_by=actor.id,
    )
    db.session.add(document)
    record_audit("DOCUMENT_UPLOADED", "document", document.id, {"filename": filename}, user=actor)
    db.session.commit()
    return jsonify({"document": document.to_dict()}), 201


@command_bp.route("/documents/<document_id>/download", methods=["GET"])
@jwt_required()
def download_document(document_id):
    user = current_user()
    document = db.session.get(Document, document_id)
    if not document:
        return jsonify({"error": "Document not found."}), 404
    if not _document_visible(user, document):
        return jsonify({"error": "Forbidden."}), 403
    path = os.path.join(
        current_app.config["UPLOAD_FOLDER"], "documents", document.stored_name
    )
    if not os.path.exists(path):
        return jsonify({"error": "Stored file is missing."}), 404
    record_audit("DOCUMENT_DOWNLOADED", "document", document.id, None, user=user)
    db.session.commit()
    return send_file(
        path,
        mimetype=document.mime_type,
        as_attachment=True,
        download_name=document.filename,
    )


@command_bp.route("/audit-logs", methods=["GET"])
@jwt_required(roles=("CEO",))
def audit_logs():
    limit = min(int(request.args.get("limit", 100)), 500)
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return jsonify({"audit_logs": [row.to_dict() for row in rows]}), 200
