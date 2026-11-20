"""Attendance verification, GPS/QR anti-spoofing and armoury operations."""
from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request

from database import db
from models import (
    AttendanceLog,
    Device,
    GuardLocationBreadcrumb,
    Post,
    Roster,
    User,
    Weapon,
    WeaponLog,
)
from security import (
    assert_zone_access,
    can_access_guard,
    current_user,
    jwt_required,
    record_audit,
    scoped_zone_ids,
)
from services import day_end, day_start, todays_logs
from utils.geo import geofence_check, qr_token_valid
from utils.realtime import emit_operational

operations_bp = Blueprint("operations", __name__)

STAFF_ROLES = ("CEO", "OPS_MANAGER", "SUPERVISOR")
ARMOURY_ROLES = ("CEO", "OPS_MANAGER")


def _scheduled_window(roster, day):
    """Return (start, end) datetimes from a 0700-1900 style duty timing."""
    if not roster or not roster.duty_timing or "-" not in roster.duty_timing:
        return None, None
    try:
        start_raw, end_raw = roster.duty_timing.split("-", 1)
        start = datetime.combine(
            day, time(int(start_raw[:2]), int(start_raw[2:4]))
        )
        end = datetime.combine(day, time(int(end_raw[:2]), int(end_raw[2:4])))
        if end <= start:
            end += timedelta(days=1)
        return start, end
    except (ValueError, IndexError):
        return None, None


def _latest_punch(guard_id, day):
    return (
        AttendanceLog.query.filter(
            AttendanceLog.guard_id == guard_id,
            AttendanceLog.punch_timestamp >= day_start(day),
            AttendanceLog.punch_timestamp <= day_end(day),
        )
        .order_by(AttendanceLog.punch_timestamp.desc())
        .first()
    )


@operations_bp.route("/attendance/punch", methods=["POST"])
@jwt_required()
def punch():
    actor = current_user()
    data = request.get_json(silent=True) or {}

    if actor.role == "GUARD":
        guard = actor
    else:
        if actor.role not in STAFF_ROLES:
            return jsonify({"error": "Forbidden."}), 403
        guard = db.session.get(User, data.get("guard_id") or "")
        if not guard or guard.role != "GUARD":
            return jsonify({"error": "guard_id is required."}), 400
        if not can_access_guard(actor, guard):
            return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403

    post_id = data.get("post_id")
    if not post_id:
        return jsonify({"error": "post_id is required; no implicit location fallback."}), 400
    post = db.session.get(Post, post_id)
    if not post:
        return jsonify({"error": "Location not found."}), 404
    assert_zone_access(actor, post.zone_id)

    punch_type = (data.get("punch_type") or "IN").upper()
    if punch_type not in ("IN", "OUT"):
        return jsonify({"error": "punch_type must be IN or OUT."}), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    if latitude is None or longitude is None:
        return jsonify({"error": "GPS coordinates are required."}), 422

    is_mock = bool(data.get("is_mock_location", False))
    source = (data.get("verification_source") or "").upper()
    if actor.role == "GUARD":
        source = "APP_GPS_QR"
    elif source not in ("SUPERVISOR_VERIFIED", "MANUAL_ENTRY"):
        source = "SUPERVISOR_VERIFIED"

    # Device lock for self-service handset punches
    if actor.role == "GUARD" and source == "APP_GPS_QR":
        device_uuid = (data.get("device_uuid") or "").strip()
        if not device_uuid:
            return jsonify({"error": "Device UUID is required."}), 400
        registered = Device.query.filter_by(user_id=guard.id).first()
        if registered and registered.device_uuid != device_uuid:
            return jsonify({"error": "Device lock violation."}), 403

    inside, distance = geofence_check(post, latitude, longitude)
    qr_ok = True
    if source == "APP_GPS_QR":
        qr_ok = qr_token_valid(post.qr_code_secret, data.get("qr_token"))

    reasons = []
    if not inside:
        reasons.append(
            f"outside {post.geofence_type.lower()} geofence ({round(distance, 1)}m)"
        )
    if not qr_ok:
        reasons.append("invalid or expired QR code")
    if is_mock:
        reasons.append("mock GPS location reported")
    flagged = bool(reasons)

    now = datetime.utcnow()
    day = now.date()
    roster = Roster.query.filter_by(
        post_id=post.id, guard_id=guard.id, duty_date=day
    ).first()

    status = "FLAGGED_ANOMALY"
    if not flagged:
        status = "PRESENT"
        if punch_type == "IN":
            start, _ = _scheduled_window(roster, day)
            if start and datetime.now() > start + timedelta(minutes=15):
                status = "LATE"

    log = AttendanceLog(
        guard_id=guard.id,
        post_id=post.id,
        roster_id=roster.id if roster else None,
        punch_type=punch_type,
        punch_timestamp=now,
        latitude=float(latitude),
        longitude=float(longitude),
        distance_meters=distance,
        is_geofence_valid=inside,
        is_mock_location=is_mock,
        qr_valid=qr_ok,
        status=status,
        verification_source=source,
        supervisor_id=actor.id if actor.role != "GUARD" else None,
        device_uuid=data.get("device_uuid"),
        notes="; ".join(reasons) if reasons else None,
    )

    if punch_type == "OUT" and not flagged:
        first_in = (
            AttendanceLog.query.filter(
                AttendanceLog.guard_id == guard.id,
                AttendanceLog.post_id == post.id,
                AttendanceLog.punch_type == "IN",
                AttendanceLog.punch_timestamp >= day_start(day),
                AttendanceLog.punch_timestamp <= day_end(day),
            )
            .order_by(AttendanceLog.punch_timestamp.asc())
            .first()
        )
        if first_in:
            worked = (now - first_in.punch_timestamp).total_seconds() / 3600.0
            _, scheduled_end = _scheduled_window(roster, day)
            shift_hours = 12.0
            if roster and roster.duty_timing and "-" in roster.duty_timing:
                start_dt, end_dt = _scheduled_window(roster, day)
                if start_dt and end_dt:
                    shift_hours = (end_dt - start_dt).total_seconds() / 3600.0
            log.overtime_hours = round(max(0.0, worked - shift_hours), 2)

    db.session.add(log)
    db.session.add(
        GuardLocationBreadcrumb(
            guard_id=guard.id,
            post_id=post.id,
            latitude=float(latitude),
            longitude=float(longitude),
            distance_meters=distance,
            is_breached=not inside,
            timestamp=now,
        )
    )
    record_audit(
        "ATTENDANCE_PUNCH",
        "attendance",
        log.id,
        {"status": status, "reasons": reasons, "source": source},
        user=actor,
    )
    db.session.commit()

    payload = log.to_dict()
    emit_operational(
        "ATTENDANCE_PUNCHED", payload, zone_id=post.zone_id
    )
    if flagged:
        emit_operational(
            "ATTENDANCE_FLAGGED",
            {**payload, "reasons": reasons},
            zone_id=post.zone_id,
        )
        return (
            jsonify(
                {
                    "error": "Attendance flagged for supervisor review.",
                    "reasons": reasons,
                    "log": payload,
                    "geofence": {
                        "is_valid": inside,
                        "distance_meters": round(distance, 1),
                        "radius_meters": post.radius_meters,
                    },
                    "qr_valid": qr_ok,
                }
            ),
            422,
        )

    return (
        jsonify(
            {
                "message": f"Guard punched {punch_type}.",
                "log": payload,
                "geofence": {
                    "is_valid": inside,
                    "distance_meters": round(distance, 1),
                    "radius_meters": post.radius_meters,
                },
                "qr_valid": qr_ok,
            }
        ),
        201,
    )


@operations_bp.route("/attendance/manual", methods=["POST"])
@jwt_required(roles=("SUPERVISOR", "OPS_MANAGER", "CEO"))
def manual_attendance():
    """Supervisor-entered attendance for guards without a handset punch."""
    actor = current_user()
    data = request.get_json(silent=True) or {}
    guard = db.session.get(User, data.get("guard_id") or "")
    if not guard or guard.role != "GUARD":
        return jsonify({"error": "guard_id is required."}), 400
    if not can_access_guard(actor, guard):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    post = db.session.get(Post, data.get("post_id") or "")
    if not post:
        return jsonify({"error": "post_id is required."}), 400
    assert_zone_access(actor, post.zone_id)
    status = (data.get("status") or "PRESENT").upper()
    if status not in (
        "PRESENT",
        "LATE",
        "ABSENT",
        "EARLY_DEPARTURE",
        "ON_LEAVE",
        "ON_REST",
    ):
        return jsonify({"error": "Invalid status."}), 400

    log = AttendanceLog(
        guard_id=guard.id,
        post_id=post.id,
        punch_type=(data.get("punch_type") or "IN").upper(),
        punch_timestamp=datetime.utcnow(),
        status=status,
        overtime_hours=float(data.get("overtime_hours") or 0),
        verification_source="MANUAL_ENTRY",
        supervisor_id=actor.id,
        notes=data.get("notes"),
    )
    db.session.add(log)
    record_audit(
        "ATTENDANCE_MANUAL",
        "attendance",
        log.id,
        {"status": status, "guard_id": guard.id},
        user=actor,
    )
    db.session.commit()
    emit_operational("ATTENDANCE_PUNCHED", log.to_dict(), zone_id=post.zone_id)
    return jsonify({"attendance": log.to_dict()}), 201


@operations_bp.route("/attendance/stream", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def attendance_stream():
    user = current_user()
    limit = min(int(request.args.get("limit", 60)), 200)
    query = AttendanceLog.query
    zone_ids = scoped_zone_ids(user)
    if zone_ids is not None:
        post_ids = [
            p.id for p in Post.query.filter(Post.zone_id.in_(list(zone_ids) or ["__none__"])).all()
        ]
        query = query.filter(AttendanceLog.post_id.in_(post_ids or ["__none__"]))
    if request.args.get("flagged") == "true":
        query = query.filter(AttendanceLog.status == "FLAGGED_ANOMALY")
    rows = query.order_by(AttendanceLog.punch_timestamp.desc()).limit(limit).all()
    return jsonify({"attendance": [row.to_dict() for row in rows]}), 200


@operations_bp.route("/attendance/<attendance_id>/verify", methods=["POST"])
@jwt_required(roles=("OPS_MANAGER", "SUPERVISOR"))
def verify_attendance(attendance_id):
    actor = current_user()
    log = db.session.get(AttendanceLog, attendance_id)
    if not log:
        return jsonify({"error": "Attendance record not found."}), 404
    post = db.session.get(Post, log.post_id)
    if post:
        assert_zone_access(actor, post.zone_id)

    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").upper()
    if status and status not in (
        "PRESENT",
        "LATE",
        "ABSENT",
        "EARLY_DEPARTURE",
        "ON_LEAVE",
        "ON_REST",
        "FLAGGED_ANOMALY",
    ):
        return jsonify({"error": "Invalid status."}), 400
    if status:
        log.status = status
    if data.get("overtime_hours") is not None:
        log.overtime_hours = float(data["overtime_hours"])
    if "notes" in data:
        log.notes = data.get("notes")
    log.verification_source = "SUPERVISOR_VERIFIED"
    log.supervisor_id = actor.id

    replacement_id = data.get("replacement_guard_id")
    if replacement_id:
        replacement = db.session.get(User, replacement_id)
        if not replacement or replacement.role != "GUARD":
            return jsonify({"error": "Replacement guard not found."}), 404
        if not can_access_guard(actor, replacement):
            return jsonify({"error": "Forbidden: replacement outside your zone."}), 403
        roster = (
            db.session.get(Roster, log.roster_id)
            if log.roster_id
            else Roster.query.filter_by(
                post_id=log.post_id, guard_id=log.guard_id, duty_date=log.punch_timestamp.date()
            ).first()
        )
        if roster:
            roster.replacement_guard_id = replacement.id

    record_audit(
        "ATTENDANCE_VERIFIED",
        "attendance",
        log.id,
        {"status": log.status, "overtime_hours": log.overtime_hours},
        user=actor,
    )
    db.session.commit()
    emit_operational("ATTENDANCE_UPDATED", log.to_dict(), zone_id=post.zone_id if post else None)
    return jsonify({"attendance": log.to_dict()}), 200


# ---------------------------------------------------------------------------
# Weapons & ammunition
# ---------------------------------------------------------------------------
def _weapon_in_scope(user, weapon) -> bool:
    zone_ids = scoped_zone_ids(user)
    if zone_ids is None:
        return True
    if weapon.assigned_post_id:
        post = db.session.get(Post, weapon.assigned_post_id)
        return bool(post and post.zone_id in zone_ids)
    if weapon.issued_to_guard_id:
        guard = db.session.get(User, weapon.issued_to_guard_id)
        return bool(guard and can_access_guard(user, guard))
    # Unallotted armoury stock can be drawn by any zone supervisor.
    return True


@operations_bp.route("/weapons", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def list_weapons():
    user = current_user()
    weapons = [w for w in Weapon.query.order_by(Weapon.serial_number).all() if _weapon_in_scope(user, w)]
    summary = {
        "total": len(weapons),
        "issued": len([w for w in weapons if w.armoury_status == "ISSUED"]),
        "available": len([w for w in weapons if w.armoury_status == "AVAILABLE"]),
        "maintenance": len([w for w in weapons if w.armoury_status == "MAINTENANCE"]),
        "licences_expiring": len([w for w in weapons if w.to_dict()["licence_expiring_soon"]]),
        "ammunition_total": sum(w.ammunition_count or 0 for w in weapons),
    }
    return jsonify({"weapons": [w.to_dict() for w in weapons], "summary": summary}), 200


@operations_bp.route("/weapons", methods=["POST"])
@jwt_required(roles=ARMOURY_ROLES)
def create_weapon():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    if not data.get("serial_number") or not data.get("weapon_type"):
        return jsonify({"error": "serial_number and weapon_type are required."}), 400
    if Weapon.query.filter_by(serial_number=data["serial_number"]).first():
        return jsonify({"error": "Serial number already registered."}), 409
    weapon = Weapon(
        weapon_type=data["weapon_type"].upper(),
        make_model=data.get("make_model"),
        serial_number=data["serial_number"].strip(),
        licence_number=data.get("licence_number"),
        licence_expiry_date=_parse_date(data.get("licence_expiry_date")),
        ammunition_count=int(data.get("ammunition_count") or 0),
        condition=(data.get("condition") or "SERVICEABLE").upper(),
        armoury_status="AVAILABLE",
    )
    db.session.add(weapon)
    record_audit("WEAPON_REGISTERED", "weapon", weapon.id, {"serial": weapon.serial_number}, user=actor)
    db.session.commit()
    return jsonify({"weapon": weapon.to_dict()}), 201


@operations_bp.route("/weapons/<weapon_id>/issue", methods=["POST"])
@jwt_required(roles=("OPS_MANAGER",))
def issue_weapon(weapon_id):
    actor = current_user()
    weapon = db.session.get(Weapon, weapon_id)
    if not weapon:
        return jsonify({"error": "Weapon not found."}), 404
    if not _weapon_in_scope(actor, weapon):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    data = request.get_json(silent=True) or {}
    guard_id = data.get("guard_id") or None
    post_id = data.get("post_id") or None
    if not guard_id and not post_id:
        return jsonify({"error": "Select a guard or a location to allot this weapon."}), 400

    guard = None
    if guard_id:
        guard = db.session.get(User, guard_id)
        if not guard or guard.role != "GUARD":
            return jsonify({"error": "guard_id is not a valid guard."}), 400
        if not can_access_guard(actor, guard):
            return jsonify({"error": "Forbidden: guard outside your zone(s)."}), 403
        post_id = post_id or guard.assigned_post_id

    post = db.session.get(Post, post_id) if post_id else None
    if post_id and not post:
        return jsonify({"error": "Location not found."}), 404
    if post:
        assert_zone_access(actor, post.zone_id)
    if weapon.armoury_status == "ISSUED":
        return jsonify({"error": "Weapon is already issued."}), 409

    weapon.issued_to_guard_id = guard.id if guard else None
    weapon.assigned_post_id = post.id if post else None
    weapon.issued_at = datetime.utcnow()
    weapon.armoury_status = "ISSUED"
    db.session.add(
        WeaponLog(
            weapon_id=weapon.id,
            action="ISSUE",
            guard_id=guard.id if guard else None,
            post_id=post.id if post else None,
            actor_id=actor.id,
            notes=data.get("notes"),
        )
    )
    record_audit(
        "WEAPON_ISSUED",
        "weapon",
        weapon.id,
        {"guard_id": guard.id if guard else None, "post_id": post.id if post else None},
        user=actor,
    )
    db.session.commit()
    emit_operational("WEAPON_ISSUED", weapon.to_dict(), zone_id=post.zone_id if post else None)
    return jsonify({"weapon": weapon.to_dict()}), 200


@operations_bp.route("/weapons/<weapon_id>/return", methods=["POST"])
@jwt_required(roles=("OPS_MANAGER", "SUPERVISOR"))
def return_weapon(weapon_id):
    actor = current_user()
    weapon = db.session.get(Weapon, weapon_id)
    if not weapon:
        return jsonify({"error": "Weapon not found."}), 404
    if not _weapon_in_scope(actor, weapon):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    data = request.get_json(silent=True) or {}
    if data.get("condition"):
        weapon.condition = data["condition"].upper()
    if data.get("ammunition_count") is not None:
        weapon.ammunition_count = int(data["ammunition_count"])
    if data.get("armoury_status") in ("AVAILABLE", "MAINTENANCE"):
        weapon.armoury_status = data["armoury_status"]
    else:
        weapon.armoury_status = "AVAILABLE"
    db.session.add(
        WeaponLog(
            weapon_id=weapon.id,
            action="RETURN",
            guard_id=weapon.issued_to_guard_id,
            post_id=weapon.assigned_post_id,
            actor_id=actor.id,
            notes=data.get("notes"),
        )
    )
    assigned_post = weapon.assigned_post_id
    weapon.issued_to_guard_id = None
    weapon.assigned_post_id = None
    weapon.issued_at = None
    record_audit("WEAPON_RETURNED", "weapon", weapon.id, {"condition": weapon.condition}, user=actor)
    db.session.commit()
    post = db.session.get(Post, assigned_post) if assigned_post else None
    emit_operational("WEAPON_RETURNED", weapon.to_dict(), zone_id=post.zone_id if post else None)
    return jsonify({"weapon": weapon.to_dict()}), 200


@operations_bp.route("/weapons/<weapon_id>/verify", methods=["POST"])
@jwt_required(roles=("OPS_MANAGER", "SUPERVISOR"))
def verify_weapon(weapon_id):
    actor = current_user()
    weapon = db.session.get(Weapon, weapon_id)
    if not weapon:
        return jsonify({"error": "Weapon not found."}), 404
    if not _weapon_in_scope(actor, weapon):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    data = request.get_json(silent=True) or {}
    weapon.last_inspection_date = date.today()
    if data.get("condition"):
        weapon.condition = data["condition"].upper()
    if data.get("ammunition_count") is not None:
        weapon.ammunition_count = int(data["ammunition_count"])
    discrepancy = bool(data.get("discrepancy", False))
    db.session.add(
        WeaponLog(
            weapon_id=weapon.id,
            action="DISCREPANCY" if discrepancy else "VERIFICATION",
            guard_id=weapon.issued_to_guard_id,
            post_id=weapon.assigned_post_id,
            actor_id=actor.id,
            notes=data.get("notes"),
        )
    )
    record_audit(
        "WEAPON_VERIFIED",
        "weapon",
        weapon.id,
        {"discrepancy": discrepancy, "ammunition": weapon.ammunition_count},
        user=actor,
    )
    db.session.commit()
    return jsonify({"weapon": weapon.to_dict()}), 200


@operations_bp.route("/weapons/<weapon_id>/logs", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def weapon_logs(weapon_id):
    actor = current_user()
    weapon = db.session.get(Weapon, weapon_id)
    if not weapon:
        return jsonify({"error": "Weapon not found."}), 404
    if not _weapon_in_scope(actor, weapon):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    logs = (
        WeaponLog.query.filter_by(weapon_id=weapon.id)
        .order_by(WeaponLog.created_at.desc())
        .all()
    )
    return jsonify({"weapon": weapon.to_dict(), "logs": [log.to_dict() for log in logs]}), 200


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
