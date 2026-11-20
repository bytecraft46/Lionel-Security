"""Shared operational calculations (strength, availability, RAG status)."""
import math
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_

from database import db
from models import (
    AttendanceLog,
    CommandBroadcast,
    Incident,
    LeaveRequest,
    Post,
    Roster,
    SiteInspection,
    User,
    Weapon,
)
from security import scoped_zone_ids


def day_start(day: date) -> datetime:
    return datetime.combine(day, time.min)


def day_end(day: date) -> datetime:
    return datetime.combine(day, time.max)


def scoped_posts(user: User):
    query = Post.query
    ids = scoped_zone_ids(user)
    if ids is not None:
        query = query.filter(Post.zone_id.in_(list(ids) or ["__none__"]))
    return query.order_by(Post.name).all()


def scoped_post_query(user: User):
    query = Post.query
    ids = scoped_zone_ids(user)
    if ids is not None:
        query = query.filter(Post.zone_id.in_(list(ids) or ["__none__"]))
    return query


def scoped_guards(user: User):
    """Guards visible to the caller (zone isolation enforced here)."""
    query = User.query.filter(User.role == "GUARD")
    ids = scoped_zone_ids(user)
    if ids is not None:
        zone_ids = list(ids) or ["__none__"]
        post_ids = [p.id for p in Post.query.filter(Post.zone_id.in_(zone_ids)).all()]
        query = query.filter(
            or_(
                User.zone_id.in_(zone_ids),
                User.assigned_post_id.in_(post_ids or ["__none__"]),
                User.id.in_(
                    db.session.query(Roster.guard_id).filter(Roster.post_id.in_(post_ids or ["__none__"]))
                ),
                User.id.in_(
                    db.session.query(Roster.replacement_guard_id).filter(
                        Roster.post_id.in_(post_ids or ["__none__"])
                    )
                ),
            )
        )
    return query.order_by(User.full_name).all()


def todays_logs(day: date):
    return (
        AttendanceLog.query.filter(
            AttendanceLog.punch_timestamp >= day_start(day),
            AttendanceLog.punch_timestamp <= day_end(day),
        )
        .order_by(AttendanceLog.punch_timestamp.desc())
        .all()
    )


def on_duty_guard_ids(day: date, logs=None):
    """Guards whose latest punch of the day is a verified IN."""
    logs = logs if logs is not None else todays_logs(day)
    latest = {}
    for log in logs:
        current = latest.get(log.guard_id)
        if not current or log.punch_timestamp > current.punch_timestamp:
            latest[log.guard_id] = log
    return {
        guard_id
        for guard_id, log in latest.items()
        if log.punch_type == "IN" and log.status != "FLAGGED_ANOMALY"
    }


CHECKIN_GRACE_MINUTES = 5


def parse_duty_clock(value):
    """Parse a stored local HH:MM duty time into a time object."""
    try:
        hour, minute = str(value or "").split(":")
        return time(int(hour), int(minute))
    except (TypeError, ValueError):
        return None


def duty_window(duty_start, duty_end, moment):
    """Return the (start, end) datetimes of the duty covering `moment`."""
    start_clock = parse_duty_clock(duty_start)
    end_clock = parse_duty_clock(duty_end)
    if not start_clock or not end_clock:
        return None, None
    start = datetime.combine(moment.date(), start_clock)
    end = datetime.combine(moment.date(), end_clock)
    if end <= start:
        # Overnight duty, e.g. 20:00 -> 08:00.
        end += timedelta(days=1)
        if moment < end and moment.time() < end_clock:
            start -= timedelta(days=1)
            end -= timedelta(days=1)
    return start, end


def overdue_checkins(user: User, now: datetime = None):
    """Guards past their duty start by the grace period with no check-in.

    Duty times are stored as local HH:MM while attendance timestamps are naive
    UTC, so the shift window is converted through the server's local offset.
    """
    local_now = now or datetime.now()
    utc_now = datetime.utcnow()
    offset = local_now - utc_now
    leaves = leave_map(local_now.date())
    alerts = []
    for guard in scoped_guards(user):
        profile = guard.profile
        if not profile or guard.employment_status == "TERMINATED":
            continue
        if guard.id in leaves:
            continue
        post_id = guard.assigned_post_id or profile.assigned_post_id
        if not post_id:
            continue  # relief guards have no fixed site to check in at
        start_local, end_local = duty_window(
            profile.duty_start, profile.duty_end, local_now
        )
        if not start_local:
            continue
        start_utc = start_local - offset
        end_utc = end_local - offset
        if utc_now < start_utc + timedelta(minutes=CHECKIN_GRACE_MINUTES):
            continue
        if utc_now > end_utc:
            continue
        checked_in = AttendanceLog.query.filter(
            AttendanceLog.guard_id == guard.id,
            AttendanceLog.punch_type == "IN",
            AttendanceLog.punch_timestamp >= start_utc - timedelta(hours=2),
            AttendanceLog.punch_timestamp <= utc_now,
        ).first()
        if checked_in:
            continue
        post = db.session.get(Post, post_id)
        zone = post.zone if post else guard.zone
        alerts.append(
            {
                "guard_id": guard.id,
                "guard_name": guard.full_name,
                "employee_id": guard.employee_id,
                "phone_number": guard.phone_number,
                "zone_id": zone.id if zone else None,
                "zone_name": zone.name if zone else None,
                "post_id": post.id if post else None,
                "post_name": post.name if post else None,
                "area": post.area if post else None,
                "client_name": post.client_name if post else None,
                "duty_start": profile.duty_start,
                "duty_end": profile.duty_end,
                "shift_start": start_utc.isoformat(),
                "shift_end": end_utc.isoformat(),
                "minutes_late": max(
                    0, int((utc_now - start_utc).total_seconds() // 60)
                ),
                "grace_minutes": CHECKIN_GRACE_MINUTES,
            }
        )
    alerts.sort(key=lambda row: row["minutes_late"], reverse=True)
    return alerts


def leave_map(day: date):
    rows = LeaveRequest.query.filter(
        LeaveRequest.status == "APPROVED",
        LeaveRequest.start_date <= day,
        LeaveRequest.end_date >= day,
    ).all()
    return {row.guard_id: row for row in rows}


def guard_post_map(day: date):
    """Guard -> post assignment for the day (roster wins, then profile)."""
    mapping = {}
    for roster in Roster.query.filter_by(duty_date=day).all():
        mapping[roster.guard_id] = roster.post_id
        if roster.replacement_guard_id:
            mapping.setdefault(roster.replacement_guard_id, roster.post_id)
    for guard in User.query.filter(User.role == "GUARD").all():
        post_id = guard.assigned_post_id
        if not post_id and guard.profile:
            post_id = guard.profile.assigned_post_id
        if post_id:
            mapping.setdefault(guard.id, post_id)
    return mapping


def active_shift(now: datetime = None) -> str:
    """Day duty 0700-1900, night duty 1900-0700."""
    hour = (now or datetime.now()).hour
    return "DAY" if 7 <= hour < 19 else "NIGHT"


def guard_shift_map(day: date):
    return {
        roster.guard_id: roster.duty_shift
        for roster in Roster.query.filter_by(duty_date=day).all()
        if roster.duty_shift
    }


def shift_required(post: Post, shift: str) -> int:
    """Per-shift strength: the location's strength is split across both shifts."""
    total = max(1, post.required_strength or 1)
    if total == 1:
        return 1
    day_strength = math.ceil(total / 2)
    return day_strength if shift == "DAY" else max(1, total - day_strength)


def post_present_count(post: Post, duty_ids, post_map):
    return len([gid for gid in duty_ids if post_map.get(gid) == post.id])


def post_status(post: Post, present: int, has_emergency: bool, required: int = None) -> str:
    if has_emergency:
        return "RED"
    required = max(1, required or post.required_strength or 1)
    if present >= required:
        return "GREEN"
    if present >= max(1, required // 2):
        return "YELLOW"
    return "RED"


def location_snapshot(user: User, day: date = None):
    day = day or date.today()
    logs = todays_logs(day)
    duty = on_duty_guard_ids(day, logs)
    post_map = guard_post_map(day)
    shift_map = guard_shift_map(day)
    shift = active_shift()
    leaves = leave_map(day)

    active_incidents = Incident.query.filter(
        Incident.status.in_(["OPEN", "ACKNOWLEDGED"])
    ).all()
    incident_posts = {inc.post_id for inc in active_incidents if inc.post_id}

    locations = []
    for post in scoped_posts(user):
        present = len(
            [
                gid
                for gid in duty
                if post_map.get(gid) == post.id and shift_map.get(gid, shift) == shift
            ]
        )
        required = shift_required(post, shift)
        status = post_status(post, present, post.id in incident_posts, required)
        locations.append(
            {
                **post.to_dict(),
                "present_count": present,
                "required_strength": required,
                "shift": shift,
                "vacant": max(0, required - present),
                "strength_ratio": round(present / required, 2),
                "on_leave_count": len(
                    [
                        gid
                        for gid in leaves
                        if post_map.get(gid) == post.id
                    ]
                ),
                "computed_status": status,
            }
        )
    return locations


def zone_snapshot(user: User, day: date = None):
    from models import Zone

    day = day or date.today()
    zone_ids = scoped_zone_ids(user)
    query = Zone.query
    if zone_ids is not None:
        query = query.filter(Zone.id.in_(list(zone_ids) or ["__none__"]))
    zones = []
    for zone in query.order_by(Zone.name).all():
        posts = [p for p in location_snapshot(user, day) if p["zone_id"] == zone.id]
        present = sum(p["present_count"] for p in posts)
        required = sum(p["required_strength"] for p in posts)
        if any(p["computed_status"] == "RED" for p in posts):
            status = "RED"
        elif any(p["computed_status"] == "YELLOW" for p in posts):
            status = "YELLOW"
        else:
            status = "GREEN"
        zones.append(
            {
                **zone.to_dict(),
                "status": status,
                "area_count": len(zone.area_list),
                "location_count": len(posts),
                "present_count": present,
                "required_strength": required,
                "vacant": max(0, required - present),
            }
        )
    return zones


def command_overview(user: User, day: date = None):
    day = day or date.today()
    guards = scoped_guards(user)
    guard_ids = {g.id for g in guards}
    logs = [log for log in todays_logs(day) if log.guard_id in guard_ids]
    duty = on_duty_guard_ids(day, logs)
    leaves = {gid: row for gid, row in leave_map(day).items() if gid in guard_ids}
    locations = location_snapshot(user, day)
    zones = zone_snapshot(user, day)

    active_guards = [
        g for g in guards if g.employment_status != "TERMINATED"
    ]
    shift = active_shift()
    rostered = Roster.query.filter(
        Roster.duty_date == day, Roster.duty_shift == shift
    ).all()
    rostered_ids = {r.guard_id for r in rostered if r.guard_id in guard_ids}

    weapons = [
        w
        for w in Weapon.query.all()
        if w.assigned_post_id in {loc["id"] for loc in locations}
        or w.issued_to_guard_id in guard_ids
        or w.assigned_post_id is None
    ]
    incidents = Incident.query.filter(
        Incident.status.in_(["OPEN", "ACKNOWLEDGED"])
    )
    if scoped_zone_ids(user) is not None:
        incidents = incidents.filter(
            Incident.zone_id.in_(list(scoped_zone_ids(user)) or ["__none__"])
        )
    incidents = incidents.order_by(Incident.occurred_at.desc()).all()

    broadcasts = CommandBroadcast.query.order_by(
        CommandBroadcast.created_at.desc()
    ).limit(8).all()
    unack_critical = 0
    for broadcast in broadcasts:
        if broadcast.priority == "CRITICAL":
            unack_critical += len(
                [a for a in broadcast.acks if a.ack_status == "NOT_RECEIVED"]
            )

    leave_rows = list(leaves.values())
    kpis = {
        "total_guards": len(active_guards),
        "total_locations": len(locations),
        "on_duty": len(duty),
        "absent": max(0, len(rostered_ids) - len(duty & rostered_ids)),
        "on_leave": len([r for r in leave_rows if r.leave_type != "WEEKLY_REST"]),
        "on_rest": len([r for r in leave_rows if r.leave_type == "WEEKLY_REST"]),
        "vacant_posts": sum(loc["vacant"] for loc in locations),
        "weapons_issued": len([w for w in weapons if w.armoury_status == "ISSUED"]),
        "weapons_in_armoury": len([w for w in weapons if w.armoury_status == "AVAILABLE"]),
        "active_emergencies": len(incidents),
        "unacknowledged_critical": unack_critical,
        "zones_in_red": len([z for z in zones if z["status"] == "RED"]),
    }

    expiring = expiring_watchlist(guards)
    attention = attention_items(user, locations, incidents)
    return {
        "date": day.isoformat(),
        "kpis": kpis,
        "zones": zones,
        "locations": locations,
        "incidents": [inc.to_dict() for inc in incidents[:12]],
        "broadcasts": [b.to_dict() for b in broadcasts],
        "expiring": expiring,
        "attention": attention,
        "leave": [row.to_dict() for row in leave_rows],
    }


def attention_items(user: User, locations, incidents):
    items = []
    for loc in locations:
        if loc["vacant"] > 0:
            items.append(
                {
                    "severity": "RED" if loc["computed_status"] == "RED" else "YELLOW",
                    "kind": "UNDERSTRENGTH",
                    "location_id": loc["id"],
                    "location_name": loc["name"],
                    "reason": f"{loc['vacant']} post(s) unmanned against {loc['required_strength']} required",
                }
            )
        if loc["computed_status"] == "RED" and loc["present_count"] == 0:
            items.append(
                {
                    "severity": "RED",
                    "kind": "VACANT_POST",
                    "location_id": loc["id"],
                    "location_name": loc["name"],
                    "reason": "No verified guard present on site",
                }
            )
    for incident in incidents:
        if incident.incident_type == "CLIENT_COMPLAINT":
            items.append(
                {
                    "severity": "YELLOW",
                    "kind": "CLIENT_COMPLAINT",
                    "location_id": incident.post_id,
                    "location_name": incident.post.name if incident.post else "—",
                    "reason": incident.immediate_action or "Client complaint logged",
                    "incident_id": incident.id,
                    "action_taken": incident.status != "OPEN",
                }
            )
    flagged = (
        AttendanceLog.query.filter(
            AttendanceLog.status == "FLAGGED_ANOMALY",
            AttendanceLog.punch_timestamp >= day_start(date.today()),
        )
        .order_by(AttendanceLog.punch_timestamp.desc())
        .limit(8)
        .all()
    )
    for log in flagged:
        items.append(
            {
                "severity": "RED",
                "kind": "FLAGGED_ATTENDANCE",
                "location_id": log.post_id,
                "location_name": log.post.name if log.post else "—",
                "reason": log.notes or "Out-of-geofence / mock GPS punch flagged",
                "attendance_id": log.id,
            }
        )
    inspections = (
        SiteInspection.query.order_by(SiteInspection.inspected_at.desc()).limit(20).all()
    )
    weak = [i for i in inspections if i.score is not None and i.score <= 2]
    for inspection in weak[:4]:
        items.append(
            {
                "severity": "YELLOW",
                "kind": "WEAK_INSPECTION",
                "location_id": inspection.post_id,
                "location_name": inspection.post.name if inspection.post else "—",
                "reason": f"Inspection score {inspection.score}/5 — {inspection.deficiencies or 'deficiencies recorded'}",
            }
        )
    return items[:24]


def expiring_watchlist(guards):
    cnic, training, medical = [], [], []
    for guard in guards:
        profile = guard.profile
        if not profile:
            continue
        entry = {"guard_id": guard.id, "guard_name": guard.full_name}
        if profile.to_dict()["cnic_expiring_soon"]:
            cnic.append({**entry, "expiry": profile.cnic_expiry_date.isoformat()})
        if profile.to_dict()["training_expiring_soon"]:
            training.append(
                {**entry, "expiry": profile.training_expiry_date.isoformat()}
            )
        if profile.to_dict()["medical_expiring_soon"]:
            medical.append(
                {**entry, "expiry": profile.medical_expiry_date.isoformat()}
            )
    licences = [
        {
            "weapon_id": w.id,
            "serial_number": w.serial_number,
            "make_model": w.make_model,
            "expiry": w.licence_expiry_date.isoformat(),
        }
        for w in Weapon.query.all()
        if w.licence_expiry_date
        and w.to_dict()["licence_expiring_soon"]
    ]
    return {
        "cnic": cnic,
        "training": training,
        "medical": medical,
        "weapon_licences": licences,
    }


def sitrep(user: User, day: date = None):
    day = day or date.today()
    data = command_overview(user, day)
    kpis = data["kpis"]
    red_locations = [
        loc for loc in data["locations"] if loc["computed_status"] == "RED"
    ]
    lines = [
        f"DAILY SITUATION REPORT — {day.strftime('%d %b %Y')}",
        f"Registered strength: {kpis['total_guards']} | Deployed sites: {kpis['total_locations']}",
        f"On duty: {kpis['on_duty']} | Absent: {kpis['absent']} | Leave: {kpis['on_leave']} | Rest: {kpis['on_rest']}",
        f"Vacant posts: {kpis['vacant_posts']} | Active emergencies: {kpis['active_emergencies']}",
        f"Weapons issued: {kpis['weapons_issued']} | In armoury: {kpis['weapons_in_armoury']}",
        "Locations in RED: "
        + (", ".join(loc["name"] for loc in red_locations) if red_locations else "None"),
        "Compliance: "
        + (
            f"{kpis['unacknowledged_critical']} unacknowledged critical broadcast(s)"
            if kpis["unacknowledged_critical"]
            else "all critical broadcasts acknowledged"
        ),
    ]
    return {
        "date": day.isoformat(),
        "kpis": kpis,
        "locations": data["locations"],
        "incidents": data["incidents"],
        "attention": data["attention"],
        "expiring": data["expiring"],
        "narrative": lines,
    }
