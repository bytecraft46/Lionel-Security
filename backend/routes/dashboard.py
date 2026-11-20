"""Command dashboards, location rosters and daily SITREP."""
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import delete as sql_delete

from database import db
from models import (
    AttendanceLog,
    Post,
    Roster,
    SiteInspection,
    User,
    Weapon,
    Zone,
    dumps,
)
from security import assert_zone_access, current_user, jwt_required, record_audit
from services import (
    command_overview,
    day_end,
    day_start,
    location_snapshot,
    sitrep,
    zone_snapshot,
)
from utils.geo import daily_qr_token

dashboard_bp = Blueprint("dashboard", __name__)

COMMAND_ROLES = ("CEO", "OPS_MANAGER", "SUPERVISOR")
ZONE_ADMIN_ROLES = ("CEO", "OPS_MANAGER")


def _parse_date(raw, fallback=None):
    if not raw:
        return fallback or date.today()
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return fallback or date.today()


@dashboard_bp.route("/dashboard/overview", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def overview():
    user = current_user()
    day = _parse_date(request.args.get("date"))
    return jsonify(command_overview(user, day)), 200


@dashboard_bp.route("/locations", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def list_locations():
    user = current_user()
    day = _parse_date(request.args.get("date"))
    return jsonify({"locations": location_snapshot(user, day)}), 200


@dashboard_bp.route("/zones", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def list_zones():
    user = current_user()
    day = _parse_date(request.args.get("date"))
    return jsonify({"zones": zone_snapshot(user, day)}), 200


def _zone_supervisor(supervisor_id):
    """Resolve a supervisor account, returning (user, error)."""
    if not supervisor_id:
        return None, None
    supervisor = db.session.get(User, supervisor_id)
    if not supervisor or supervisor.role != "SUPERVISOR":
        return None, "Select a valid zone supervisor account."
    return supervisor, None


def _apply_zone_supervisor(zone, supervisor):
    """Point the zone at a supervisor and keep the zone scoping links in sync."""
    previous = zone.supervisor
    if previous and (not supervisor or previous.id != supervisor.id):
        if zone in previous.zones:
            previous.zones.remove(zone)
    zone.supervisor_id = supervisor.id if supervisor else None
    for post in zone.posts:
        post.supervisor_id = zone.supervisor_id
    if supervisor:
        if zone not in supervisor.zones:
            supervisor.zones.append(zone)
        if not supervisor.zone_id:
            supervisor.zone_id = zone.id


def _normalise_areas(raw):
    """Accept a list of area names (or a comma separated string), de-duplicated."""
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, (list, tuple)):
        return []
    areas = []
    seen = set()
    for item in raw:
        name = str(item or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            areas.append(name)
    return areas


def _delete_site_rows(post_ids):
    """Remove sites with their attendance, rosters and inspections.

    Child rows are deleted explicitly: guard, weapon and incident references
    fall back to NULL by foreign key, but rosters refuse to lose their site.
    """
    if not post_ids:
        return
    for model in (AttendanceLog, Roster, SiteInspection):
        db.session.execute(
            sql_delete(model).where(model.post_id.in_(post_ids)),
            execution_options={"synchronize_session": "fetch"},
        )
    db.session.execute(
        sql_delete(Post).where(Post.id.in_(post_ids)),
        execution_options={"synchronize_session": "fetch"},
    )


def _validate_zone_name(raw, zone_id=None):
    name = (raw or "").strip()
    if not name:
        return None, "Zone name is required."
    query = Zone.query.filter(Zone.name == name)
    if zone_id:
        query = query.filter(Zone.id != zone_id)
    if query.first():
        return None, "A zone with this name already exists."
    return name, None


@dashboard_bp.route("/zones", methods=["POST"])
@jwt_required(roles=ZONE_ADMIN_ROLES)
def create_zone():
    data = request.get_json(silent=True) or {}
    name, error = _validate_zone_name(data.get("name"))
    if error:
        return jsonify({"error": error}), 400 if "required" in error else 409
    supervisor, error = _zone_supervisor(data.get("supervisor_id"))
    if error:
        return jsonify({"error": error}), 400

    areas = _normalise_areas(data.get("areas") if "areas" in data else data.get("description"))
    zone = Zone(
        name=name,
        code=(data.get("code") or "").strip() or None,
        areas=dumps(areas) if areas else None,
        description=", ".join(areas) or None,
    )
    db.session.add(zone)
    db.session.flush()
    _apply_zone_supervisor(zone, supervisor)
    record_audit(
        "ZONE_CREATED",
        "zone",
        zone.id,
        {
            "name": name,
            "areas": areas,
            "supervisor_id": zone.supervisor_id,
        },
    )
    db.session.commit()
    return (
        jsonify(
            {
                "message": f"Zone created with {len(areas)} area(s).",
                "zone": zone.to_dict(),
            }
        ),
        201,
    )


@dashboard_bp.route("/zones/<zone_id>", methods=["PATCH"])
@jwt_required(roles=ZONE_ADMIN_ROLES)
def update_zone(zone_id):
    zone = db.session.get(Zone, zone_id)
    if not zone:
        return jsonify({"error": "Zone not found."}), 404
    data = request.get_json(silent=True) or {}

    name = zone.name
    if "name" in data:
        name, error = _validate_zone_name(data.get("name"), zone_id=zone.id)
        if error:
            return jsonify({"error": error}), 400 if "required" in error else 409

    supervisor = None
    if "supervisor_id" in data:
        supervisor, error = _zone_supervisor(data.get("supervisor_id"))
        if error:
            return jsonify({"error": error}), 400

    zone.name = name
    if "code" in data:
        zone.code = (data.get("code") or "").strip() or None
    areas_changed = "areas" in data or "description" in data
    if areas_changed:
        areas = _normalise_areas(data.get("areas") if "areas" in data else data.get("description"))
        zone.areas = dumps(areas) if areas else None
        zone.description = ", ".join(areas) or None
    if "supervisor_id" in data:
        _apply_zone_supervisor(zone, supervisor)

    record_audit(
        "ZONE_UPDATED",
        "zone",
        zone.id,
        {
            "name": zone.name,
            "areas": zone.area_list,
            "supervisor_id": zone.supervisor_id,
        },
    )
    db.session.commit()
    return jsonify({"message": "Zone updated.", "zone": zone.to_dict()}), 200


@dashboard_bp.route("/zones/<zone_id>", methods=["DELETE"])
@jwt_required(roles=ZONE_ADMIN_ROLES)
def delete_zone(zone_id):
    zone = db.session.get(Zone, zone_id)
    if not zone:
        return jsonify({"error": "Zone not found."}), 404

    name = zone.name
    post_ids = [post.id for post in zone.posts]
    site_count = len(post_ids)
    # A zone cannot exist without its sites, so they are removed with it.
    _delete_site_rows(post_ids)
    db.session.execute(
        sql_delete(Zone).where(Zone.id == zone.id),
        execution_options={"synchronize_session": "fetch"},
    )
    db.session.expire_all()
    record_audit(
        "ZONE_DELETED",
        "zone",
        zone_id,
        {"name": name, "sites_deleted": site_count},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "message": f'Zone "{name}" and its {site_count} site(s) deleted.',
                "id": zone_id,
                "sites_deleted": site_count,
            }
        ),
        200,
    )


@dashboard_bp.route("/locations", methods=["POST"])
@jwt_required(roles=ZONE_ADMIN_ROLES)
def create_location():
    data = request.get_json(silent=True) or {}
    zone = db.session.get(Zone, (data.get("zone_id") or "").strip())
    if not zone:
        return jsonify({"error": "Select the zone this site belongs to."}), 400

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Site name is required."}), 400
    if any(post.name.strip().lower() == name.lower() for post in zone.posts):
        return jsonify({"error": "This zone already has a site with that name."}), 409

    area = (data.get("area") or "").strip()
    if area:
        # Store the zone's own spelling of the area when it matches one.
        area = next(
            (row for row in zone.area_list if row.lower() == area.lower()), area
        )

    try:
        strength = int(data.get("required_strength") or 1)
    except (TypeError, ValueError):
        return jsonify({"error": "Required strength must be a whole number."}), 400
    if strength < 0:
        return jsonify({"error": "Required strength cannot be negative."}), 400

    def coordinate(key):
        raw = data.get(key)
        if raw in (None, ""):
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return "invalid"

    lat, lng = coordinate("lat"), coordinate("lng")
    if "invalid" in (lat, lng):
        return jsonify({"error": "Latitude and longitude must be numbers."}), 400
    if lat is not None and not -90 <= lat <= 90:
        return jsonify({"error": "Latitude must be between -90 and 90."}), 400
    if lng is not None and not -180 <= lng <= 180:
        return jsonify({"error": "Longitude must be between -180 and 180."}), 400
    # Sites without coordinates sit at the zone centre, or at Karachi's centre.
    peers = zone.posts
    if peers:
        lat_default = sum(post.lat for post in peers) / len(peers)
        lng_default = sum(post.lng for post in peers) / len(peers)
    else:
        lat_default, lng_default = 24.8607, 67.0011

    post = Post(
        zone_id=zone.id,
        name=name,
        client_name=(data.get("client_name") or "").strip() or None,
        area=area or None,
        address=(data.get("address") or "").strip() or None,
        required_strength=strength,
        lat=lat if lat is not None else lat_default,
        lng=lng if lng is not None else lng_default,
        supervisor_id=zone.supervisor_id,
    )
    db.session.add(post)
    db.session.flush()
    record_audit(
        "SITE_CREATED",
        "site",
        post.id,
        {"name": post.name, "zone_id": zone.id, "area": post.area, "required_strength": strength},
    )
    db.session.commit()
    return jsonify({"message": f'Site "{name}" added to {zone.name}.', "location": post.to_dict()}), 201


@dashboard_bp.route("/locations/<location_id>", methods=["DELETE"])
@jwt_required(roles=ZONE_ADMIN_ROLES)
def delete_location(location_id):
    post = db.session.get(Post, location_id)
    if not post:
        return jsonify({"error": "Location not found."}), 404
    name, zone_id = post.name, post.zone_id
    _delete_site_rows([post.id])
    db.session.expire_all()
    record_audit("SITE_DELETED", "site", location_id, {"name": name, "zone_id": zone_id})
    db.session.commit()
    return jsonify({"message": f'Site "{name}" deleted.', "id": location_id}), 200


@dashboard_bp.route("/locations/<location_id>", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def get_location(location_id):
    user = current_user()
    post = db.session.get(Post, location_id)
    if not post:
        return jsonify({"error": "Location not found."}), 404
    assert_zone_access(user, post.zone_id)
    snapshot = next(
        (loc for loc in location_snapshot(user) if loc["id"] == post.id), post.to_dict()
    )
    return jsonify({"location": snapshot}), 200


@dashboard_bp.route("/locations/<location_id>/roster", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def location_roster(location_id):
    user = current_user()
    post = db.session.get(Post, location_id)
    if not post:
        return jsonify({"error": "Location not found."}), 404
    assert_zone_access(user, post.zone_id)

    day = _parse_date(request.args.get("date"))
    rosters = (
        Roster.query.filter_by(post_id=post.id, duty_date=day)
        .order_by(Roster.duty_shift)
        .all()
    )
    logs = (
        AttendanceLog.query.filter(
            AttendanceLog.post_id == post.id,
            AttendanceLog.punch_timestamp >= day_start(day),
            AttendanceLog.punch_timestamp <= day_end(day),
        )
        .order_by(AttendanceLog.punch_timestamp.desc())
        .all()
    )
    latest = {}
    for log in logs:
        latest.setdefault(log.guard_id, log)

    rows = []
    for roster in rosters:
        guard = roster.guard
        if not guard:
            continue
        log = latest.get(guard.id)
        weapon = Weapon.query.filter_by(issued_to_guard_id=guard.id).first()
        if log is None:
            attendance = "ABSENT"
            verification = None
        elif log.punch_type == "IN":
            attendance = log.status
            verification = log.verification_source
        else:
            attendance = log.status if log.status != "ABSENT" else "PRESENT"
            verification = log.verification_source
        rows.append(
            {
                **roster.to_dict(),
                "attendance_id": log.id if log else None,
                "cnic_masked": guard.to_dict().get("cnic"),
                "phone_number": guard.phone_number,
                "attendance_status": attendance,
                "attendance_time": log.punch_timestamp.isoformat() if log else None,
                "verification_source": verification,
                "weapon_serial": weapon.serial_number if weapon else None,
                "weapon_type": weapon.weapon_type if weapon else None,
            }
        )

    if not rows:
        # fall back to the standing assignment if no roster was published
        assigned = User.query.filter(
            User.role == "GUARD", User.assigned_post_id == post.id
        ).all()
        for guard in assigned:
            log = latest.get(guard.id)
            rows.append(
                {
                    "guard_id": guard.id,
                    "guard_name": guard.full_name,
                    "employee_id": guard.employee_id,
                    "guard_rank": guard.profile.rank if guard.profile else None,
                    "duty_shift": "—",
                    "duty_timing": "—",
                    "replacement_guard_name": None,
                    "attendance_id": log.id if log else None,
                    "attendance_status": log.status if log else "ABSENT",
                    "attendance_time": log.punch_timestamp.isoformat() if log else None,
                    "verification_source": log.verification_source if log else None,
                    "weapon_serial": (
                        Weapon.query.filter_by(issued_to_guard_id=guard.id)
                        .first()
                        .serial_number
                        if Weapon.query.filter_by(issued_to_guard_id=guard.id).first()
                        else None
                    ),
                }
            )

    location = next(
        (loc for loc in location_snapshot(user, day) if loc["id"] == post.id),
        post.to_dict(),
    )
    return (
        jsonify(
            {
                "date": day.isoformat(),
                "location": location,
                "roster": rows,
                "present_count": location.get("present_count", 0),
                "required_strength": location.get("required_strength", post.required_strength),
            }
        ),
        200,
    )


@dashboard_bp.route("/locations/<location_id>/qr-token", methods=["GET"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def location_qr_token(location_id):
    user = current_user()
    post = db.session.get(Post, location_id)
    if not post:
        return jsonify({"error": "Location not found."}), 404
    assert_zone_access(user, post.zone_id)
    day = _parse_date(request.args.get("date"))
    token = daily_qr_token(post.qr_code_secret, datetime.combine(day, datetime.min.time()))
    return jsonify({"location_id": post.id, "date": day.isoformat(), "qr_token": token}), 200


@dashboard_bp.route("/reports/sitrep", methods=["GET"])
@jwt_required(roles=COMMAND_ROLES)
def daily_sitrep():
    user = current_user()
    day = _parse_date(request.args.get("date"))
    report = sitrep(user, day)
    if request.args.get("format") == "text":
        return "\n".join(report["narrative"]), 200, {"Content-Type": "text/plain"}
    return jsonify(report), 200
