"""Guard personnel registry and leave management (zone isolated)."""
from datetime import date, datetime

from flask import Blueprint, jsonify, request

from database import db
from models import GuardProfile, LeaveRequest, Post, User
from security import (
    assert_zone_access,
    can_access_guard,
    current_user,
    jwt_required,
    password_policy_error,
    record_audit,
    scoped_zone_ids,
)
from services import leave_map, on_duty_guard_ids, scoped_guards

personnel_bp = Blueprint("personnel", __name__)

STAFF_ROLES = ("CEO", "OPS_MANAGER", "SUPERVISOR")
FULL_CNIC_ROLES = ("CEO", "OPS_MANAGER")


def _date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _duty_window(data: dict):
    """Validate a guard's mandatory duty start/end times (local HH:MM)."""
    raw_start = str(data.get("duty_start") or "").strip()
    raw_end = str(data.get("duty_end") or "").strip()
    if not raw_start or not raw_end:
        return None, None, "Duty start time and duty end time are required."
    try:
        start = datetime.strptime(raw_start, "%H:%M")
        end = datetime.strptime(raw_end, "%H:%M")
    except ValueError:
        return None, None, "Duty times must use the 24-hour HH:MM format."
    if start.time() == end.time():
        return None, None, "Duty start and duty end time cannot be the same."
    return start.strftime("%H:%M"), end.strftime("%H:%M"), None


def _apply_guard_fields(guard: User, data: dict):
    profile = guard.profile
    if profile is None:
        profile = GuardProfile(user_id=guard.id)
        db.session.add(profile)
        guard.profile = profile
    profile_fields = (
        "father_name",
        "permanent_address",
        "emergency_contact",
        "previous_service",
        "rank",
        "qualification",
        "training_record",
        "medical_fitness",
    )
    for field in profile_fields:
        if field in data:
            setattr(profile, field, data.get(field))
    for field in ("cnic_expiry_date", "training_expiry_date", "medical_expiry_date"):
        if field in data:
            setattr(profile, field, _date(data.get(field)))
    if "date_of_joining" in data:
        profile.date_of_joining = _date(data.get("date_of_joining"))
    if "assigned_post_id" in data:
        profile.assigned_post_id = data.get("assigned_post_id") or None
        guard.assigned_post_id = data.get("assigned_post_id") or None
    if "employment_status" in data:
        profile.employment_status = data.get("employment_status")
        guard.employment_status = data.get("employment_status")


def _zone_guard_or_404(guard_id):
    guard = db.session.get(User, guard_id)
    if not guard or guard.role != "GUARD":
        return None
    return guard


@personnel_bp.route("/guards", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def list_guards():
    user = current_user()
    guards = scoped_guards(user)
    today = date.today()
    duty = on_duty_guard_ids(today)
    leaves = leave_map(today)

    payload = []
    for guard in guards:
        if request.args.get("post_id") and guard.assigned_post_id != request.args.get("post_id"):
            continue
        if request.args.get("status") and guard.employment_status != request.args.get("status"):
            continue
        if guard.id in duty:
            availability = "ON_DUTY"
        elif guard.id in leaves:
            availability = (
                "ON_REST"
                if leaves[guard.id].leave_type == "WEEKLY_REST"
                else "ON_LEAVE"
            )
        else:
            availability = "AVAILABLE"
        item = guard.to_dict(include_sensitive=user.role in FULL_CNIC_ROLES)
        item["availability"] = availability
        item["assigned_post_name"] = (
            guard.assigned_post.name if guard.assigned_post else None
        )
        payload.append(item)
    return jsonify({"guards": payload}), 200


@personnel_bp.route("/guards/<guard_id>", methods=["GET"])
@jwt_required(roles=STAFF_ROLES + ("GUARD",))
def get_guard(guard_id):
    user = current_user()
    guard = _zone_guard_or_404(guard_id)
    if not guard:
        return jsonify({"error": "Guard not found."}), 404
    if user.role == "GUARD" and user.id != guard.id:
        return jsonify({"error": "Forbidden."}), 403
    if user.role in STAFF_ROLES and not can_access_guard(user, guard):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    data = guard.to_dict(include_sensitive=user.role in FULL_CNIC_ROLES or user.id == guard.id)
    return jsonify({"guard": data}), 200


@personnel_bp.route("/guards", methods=["POST"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def create_guard():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    required = ("full_name", "phone_number", "password", "duty_start", "duty_end")
    missing = [field for field in required if not data.get(field)]
    if missing:
        labels = {
            "full_name": "full name",
            "phone_number": "phone number",
            "password": "password",
            "duty_start": "duty start time",
            "duty_end": "duty end time",
        }
        subject = ", ".join(labels.get(field, field) for field in missing)
        return jsonify({"error": f"{subject} {'is' if len(missing) == 1 else 'are'} required."}), 400
    duty_start, duty_end, duty_error = _duty_window(data)
    if duty_error:
        return jsonify({"error": duty_error}), 400
    policy_error = password_policy_error(data["password"])
    if policy_error:
        return jsonify({"error": policy_error}), 400
    if User.query.filter_by(phone_number=data["phone_number"]).first():
        return jsonify({"error": "Phone number already registered."}), 409

    zone_id = data.get("zone_id") or actor.zone_id
    if zone_id:
        assert_zone_access(actor, zone_id)
    elif actor.role == "SUPERVISOR":
        return jsonify({"error": "A zone is required for supervisor-created guards."}), 400

    post_id = data.get("assigned_post_id")
    if post_id:
        post = db.session.get(Post, post_id)
        if not post:
            return jsonify({"error": "Assigned post not found."}), 404
        assert_zone_access(actor, post.zone_id)

    guard = User(
        full_name=data["full_name"].strip(),
        phone_number=data["phone_number"].strip(),
        email=(data.get("email") or "").strip().lower() or None,
        cnic=(data.get("cnic") or "").strip() or None,
        employee_id=data.get("employee_id"),
        role="GUARD",
        zone_id=zone_id,
        assigned_post_id=post_id,
        employment_status=data.get("employment_status") or "ACTIVE",
    )
    guard.set_password(data["password"])
    db.session.add(guard)
    db.session.flush()
    _apply_guard_fields(guard, data)
    guard.profile.duty_start = duty_start
    guard.profile.duty_end = duty_end
    record_audit(
        "GUARD_CREATED",
        "user",
        guard.id,
        {"zone_id": zone_id, "created_by": actor.id},
        user=actor,
    )
    db.session.commit()
    return jsonify({"guard": guard.to_dict(include_sensitive=True)}), 201


@personnel_bp.route("/guards/<guard_id>", methods=["PUT"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def update_guard(guard_id):
    actor = current_user()
    guard = _zone_guard_or_404(guard_id)
    if not guard:
        return jsonify({"error": "Guard not found."}), 404
    if not can_access_guard(actor, guard):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403

    data = request.get_json(silent=True) or {}
    for field in ("full_name", "phone_number", "email", "cnic", "employee_id"):
        if field in data:
            setattr(guard, field, data.get(field) or None)
    if "zone_id" in data:
        assert_zone_access(actor, data["zone_id"])
        guard.zone_id = data.get("zone_id") or None
    duty_start = duty_end = None
    if "duty_start" in data or "duty_end" in data:
        existing = guard.profile
        duty_start, duty_end, duty_error = _duty_window(
            {
                "duty_start": data.get("duty_start")
                or (existing.duty_start if existing else None),
                "duty_end": data.get("duty_end")
                or (existing.duty_end if existing else None),
            }
        )
        if duty_error:
            return jsonify({"error": duty_error}), 400
    if data.get("password"):
        policy_error = password_policy_error(data["password"])
        if policy_error:
            return jsonify({"error": policy_error}), 400
        guard.set_password(data["password"])
    _apply_guard_fields(guard, data)
    if duty_start:
        guard.profile.duty_start = duty_start
        guard.profile.duty_end = duty_end
    record_audit("GUARD_UPDATED", "user", guard.id, {"fields": list(data)}, user=actor)
    db.session.commit()
    return jsonify({"guard": guard.to_dict(include_sensitive=actor.role in FULL_CNIC_ROLES)}), 200


@personnel_bp.route("/users", methods=["GET"])
@jwt_required(roles=("CEO", "OPS_MANAGER"))
def list_users():
    users = (
        User.query.filter(User.role.notin_(("GUARD", "ADMIN")))
        .order_by(User.full_name)
        .all()
    )
    return jsonify({"users": [u.to_dict(include_sensitive=True) for u in users]}), 200


@personnel_bp.route("/users", methods=["POST"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def create_privileged_user():
    """Provision staff accounts according to the command hierarchy."""
    from routes.auth import register_user

    return register_user()


@personnel_bp.route("/leave", methods=["GET"])
@jwt_required()
def list_leave():
    user = current_user()
    query = LeaveRequest.query
    if user.role == "GUARD":
        query = query.filter(LeaveRequest.guard_id == user.id)
    elif user.role == "SUPERVISOR":
        allowed = {g.id for g in scoped_guards(user)}
        query = query.filter(LeaveRequest.guard_id.in_(list(allowed) or ["__none__"]))
    status = request.args.get("status")
    if status:
        query = query.filter(LeaveRequest.status == status.upper())
    rows = query.order_by(LeaveRequest.created_at.desc()).limit(200).all()
    return jsonify({"leave_requests": [row.to_dict() for row in rows]}), 200


@personnel_bp.route("/leave", methods=["POST"])
@jwt_required()
def create_leave():
    user = current_user()
    data = request.get_json(silent=True) or {}
    if user.role == "GUARD":
        guard_id = user.id
    else:
        guard_id = data.get("guard_id")
        guard = _zone_guard_or_404(guard_id) if guard_id else None
        if not guard:
            return jsonify({"error": "guard_id is required."}), 400
        if not can_access_guard(user, guard):
            return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403

    leave_type = (data.get("leave_type") or "").upper()
    if leave_type not in ("ANNUAL", "CASUAL", "MEDICAL", "EMERGENCY", "WEEKLY_REST"):
        return jsonify({"error": "Invalid leave_type."}), 400
    start = _date(data.get("start_date"))
    end = _date(data.get("end_date")) or start
    if not start:
        return jsonify({"error": "start_date is required."}), 400
    if end < start:
        return jsonify({"error": "end_date cannot precede start_date."}), 400

    row = LeaveRequest(
        guard_id=guard_id,
        leave_type=leave_type,
        start_date=start,
        end_date=end,
        expected_return_date=_date(data.get("expected_return_date")),
        reason=data.get("reason"),
        status="PENDING",
    )
    db.session.add(row)
    record_audit("LEAVE_REQUESTED", "leave", row.id, {"type": leave_type}, user=user)
    db.session.commit()
    return jsonify({"leave_request": row.to_dict()}), 201


@personnel_bp.route("/leave/<leave_id>/decision", methods=["POST"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def decide_leave(leave_id):
    actor = current_user()
    row = db.session.get(LeaveRequest, leave_id)
    if not row:
        return jsonify({"error": "Leave request not found."}), 404
    guard = row.guard
    if guard and not can_access_guard(actor, guard):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403
    decision = (request.get_json(silent=True) or {}).get("status", "").upper()
    if decision not in ("APPROVED", "REJECTED"):
        return jsonify({"error": "status must be APPROVED or REJECTED."}), 400
    row.status = decision
    row.approved_by = actor.id
    row.decided_at = datetime.utcnow()
    record_audit(f"LEAVE_{decision}", "leave", row.id, None, user=actor)
    db.session.commit()
    return jsonify({"leave_request": row.to_dict()}), 200
