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
from services import (
    CHECKIN_GRACE_MINUTES,
    day_end,
    day_start,
    overdue_checkins,
    scoped_guards,
    scoped_post_query,
    todays_logs,
)
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


@operations_bp.route("/attendance/overdue", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def overdue_attendance():
    """Guards who have not checked in within the duty-start grace period.

    CEO and Operations Manager see every guard; a supervisor sees only guards
    attached to sites inside their own zone(s).
    """
    user = current_user()
    alerts = overdue_checkins(user)
    return (
        jsonify(
            {
                "alerts": alerts,
                "count": len(alerts),
                "grace_minutes": CHECKIN_GRACE_MINUTES,
                "generated_at": datetime.utcnow().isoformat(),
            }
        ),
        200,
    )


@operations_bp.route("/attendance/trend", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def attendance_trend():
    """Daily check-in counts for one guard over the whole current calendar month.

    The CEO and Operations Manager can read any guard; a supervisor only
    guards attached to sites inside their own zone(s).
    """
    user = current_user()

    guard = db.session.get(User, request.args.get("guard_id") or "")
    if not guard or guard.role != "GUARD":
        return jsonify({"error": "guard_id is required."}), 400
    if not can_access_guard(user, guard):
        return jsonify({"error": "Forbidden: outside your assigned zone(s)."}), 403

    today = date.today()
    start = today.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    end = next_month - timedelta(days=1)
    days = (end - start).days + 1
    logs = AttendanceLog.query.filter(
        AttendanceLog.guard_id == guard.id,
        AttendanceLog.punch_type == "IN",
        AttendanceLog.punch_timestamp >= day_start(start),
        AttendanceLog.punch_timestamp <= day_end(end),
    ).all()

    counts = {}
    for log in logs:
        key = log.punch_timestamp.date()
        counts[key] = counts.get(key, 0) + 1

    series = [
        {
            "date": (start + timedelta(days=offset)).isoformat(),
            "count": counts.get(start + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]
    return (
        jsonify(
            {
                "guard_id": guard.id,
                "guard_name": guard.full_name,
                "month": start.strftime("%Y-%m"),
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "days": days,
                "series": series,
                "total": sum(item["count"] for item in series),
            }
        ),
        200,
    )


@operations_bp.route("/attendance/register", methods=["GET"])
@jwt_required(roles=STAFF_ROLES)
def attendance_register():
    """Per-guard check-in / check-out register for one day.

    The CEO and Operations Manager see every zone; a supervisor only sees the
    guards attached to sites inside their own zone(s).
    """
    user = current_user()
    day = _parse_date(request.args.get("date")) or date.today()
    zone_filter = (request.args.get("zone_id") or "").strip()
    post_filter = (request.args.get("post_id") or "").strip()

    posts = {post.id: post for post in scoped_post_query(user).all()}
    scoped = []
    for guard in scoped_guards(user):
        if guard.employment_status == "TERMINATED":
            continue
        post_id = guard.assigned_post_id or (
            guard.profile.assigned_post_id if guard.profile else None
        )
        post = posts.get(post_id) if post_id else None
        zone_id = post.zone_id if post else guard.zone_id
        if zone_filter and zone_id != zone_filter:
            continue
        if post_filter and (post.id if post else None) != post_filter:
            continue
        scoped.append((guard, post))

    guard_ids = [guard.id for guard, _ in scoped]
    logs = []
    if guard_ids:
        logs = (
            AttendanceLog.query.filter(
                AttendanceLog.guard_id.in_(guard_ids),
                AttendanceLog.punch_timestamp >= day_start(day),
                AttendanceLog.punch_timestamp <= day_end(day),
            )
            .order_by(AttendanceLog.punch_timestamp.asc())
            .all()
        )

    grouped = {}
    for log in logs:
        grouped.setdefault(log.guard_id, []).append(log)

    def punch_payload(log):
        log_post = posts.get(log.post_id)
        return {
            "id": log.id,
            "time": log.punch_timestamp.isoformat() if log.punch_timestamp else None,
            "status": log.status,
            "source": log.verification_source,
            "distance_meters": round(log.distance_meters, 1)
            if log.distance_meters is not None
            else None,
            "is_geofence_valid": bool(log.is_geofence_valid),
            "is_mock_location": bool(log.is_mock_location),
            "notes": log.notes,
            "supervisor_name": log.supervisor.full_name if log.supervisor else None,
            "post_name": log_post.name if log_post else None,
        }

    rows = []
    for guard, post in scoped:
        guard_logs = grouped.get(guard.id, [])
        ins = [log for log in guard_logs if log.punch_type == "IN"]
        outs = [log for log in guard_logs if log.punch_type == "OUT"]
        check_in = ins[0] if ins else None
        check_out = outs[-1] if outs else None
        last = guard_logs[-1] if guard_logs else None

        if last is None:
            status = "NOT_CHECKED_IN"
        elif last.punch_type == "IN":
            status = "ON_DUTY"
        else:
            status = "CHECKED_OUT"

        hours = None
        if check_in and check_out and check_out.punch_timestamp > check_in.punch_timestamp:
            hours = round(
                (
                    check_out.punch_timestamp - check_in.punch_timestamp
                ).total_seconds()
                / 3600.0,
                2,
            )

        zone = post.zone if post else guard.zone
        rows.append(
            {
                "guard_id": guard.id,
                "guard_name": guard.full_name,
                "employee_id": guard.employee_id,
                "phone_number": guard.phone_number,
                "rank": guard.profile.rank if guard.profile else None,
                "zone_id": zone.id if zone else None,
                "zone_name": zone.name if zone else None,
                "post_id": post.id if post else None,
                "post_name": post.name if post else None,
                "area": post.area if post else None,
                "client_name": post.client_name if post else None,
                "check_in": punch_payload(check_in) if check_in else None,
                "check_out": punch_payload(check_out) if check_out else None,
                "punch_count": len(guard_logs),
                "last_event": last.punch_timestamp.isoformat() if last else None,
                "status": status,
                "hours": hours,
                "flagged": any(
                    log.status == "FLAGGED_ANOMALY" for log in guard_logs
                ),
            }
        )

    rows.sort(
        key=lambda row: (
            (row["zone_name"] or "").lower(),
            (row["post_name"] or "").lower(),
            (row["guard_name"] or "").lower(),
        )
    )
    summary = {
        "total": len(rows),
        "on_duty": len([row for row in rows if row["status"] == "ON_DUTY"]),
        "checked_out": len(
            [row for row in rows if row["status"] == "CHECKED_OUT"]
        ),
        "not_checked_in": len(
            [row for row in rows if row["status"] == "NOT_CHECKED_IN"]
        ),
        "flagged": len([row for row in rows if row["flagged"]]),
    }
    return jsonify({"date": day.isoformat(), "summary": summary, "rows": rows}), 200


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
    fields = {
        "Arm name": data.get("weapon_type"),
        "Make and model": data.get("make_model"),
        "Registration number": data.get("serial_number"),
        "Licence number": data.get("licence_number"),
    }
    missing = [label for label, value in fields.items() if not str(value or "").strip()]
    if missing:
        subject = ", ".join(missing)
        return jsonify({"error": f"{subject} {'is' if len(missing) == 1 else 'are'} required."}), 400
    serial = data["serial_number"].strip()
    if Weapon.query.filter_by(serial_number=serial).first():
        return jsonify({"error": "Registration number already registered."}), 409
    weapon = Weapon(
        weapon_type=data["weapon_type"].strip().upper(),
        make_model=data["make_model"].strip(),
        serial_number=serial,
        licence_number=data["licence_number"].strip(),
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
    location_name = str(data.get("location") or "").strip() or None
    if not guard_id and not post_id and not location_name:
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

    alloc = {
        "alloc_location": None,
        "alloc_area": None,
        "alloc_lat": None,
        "alloc_lng": None,
        "alloc_client": None,
    }
    if not guard and not post:
        area = str(data.get("area") or "").strip() or location_name
        client_name = str(data.get("client_name") or "").strip()
        try:
            lat = float(data.get("lat")) if data.get("lat") not in (None, "") else None
            lng = float(data.get("lng")) if data.get("lng") not in (None, "") else None
        except (TypeError, ValueError):
            return jsonify({"error": "Latitude and longitude must be numbers."}), 400
        if lat is None or lng is None:
            return jsonify({"error": "Latitude and longitude are required for a location allocation."}), 400
        if not client_name:
            return jsonify({"error": "Client is required for a location allocation."}), 400
        alloc = {
            "alloc_location": location_name,
            "alloc_area": area,
            "alloc_lat": lat,
            "alloc_lng": lng,
            "alloc_client": client_name,
        }

    weapon.issued_to_guard_id = guard.id if guard else None
    weapon.assigned_post_id = post.id if post else None
    for key, value in alloc.items():
        setattr(weapon, key, value)
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
        {
            "guard_id": guard.id if guard else None,
            "post_id": post.id if post else None,
            "location": alloc.get("alloc_location"),
            "area": alloc.get("alloc_area"),
            "client": alloc.get("alloc_client"),
        },
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
    weapon.alloc_location = None
    weapon.alloc_area = None
    weapon.alloc_lat = None
    weapon.alloc_lng = None
    weapon.alloc_client = None
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
