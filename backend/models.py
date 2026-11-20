"""Lionel Security operational data model.

Strictly operational: no salary, payroll, billing, invoicing or profitability
columns exist anywhere in this schema.
"""
import json
import uuid
from datetime import date, datetime, timedelta, timezone

from database import db


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Naive UTC, matching the format stored by SQLite DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def mask_cnic(value):
    """Mask a CNIC for non-administrative listings."""
    if not value:
        return None
    digits = str(value).replace("-", "")
    if len(digits) < 6:
        return "*****"
    return f"{digits[:5]}-*******-{digits[-1]}"


def dumps(value):
    return json.dumps(value or [])


def loads(value, fallback=None):
    fallback = [] if fallback is None else fallback
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
        return parsed if parsed is not None else fallback
    except (TypeError, ValueError):
        return fallback


ROLES = ("CEO", "OPS_MANAGER", "SUPERVISOR", "GUARD")

ZONE_STATUSES = ("GREEN", "YELLOW", "RED")
EMPLOYMENT_STATUSES = ("ACTIVE", "SUSPENDED", "TERMINATED")
ATTENDANCE_STATUSES = (
    "PRESENT",
    "ABSENT",
    "LATE",
    "EARLY_DEPARTURE",
    "ON_LEAVE",
    "ON_REST",
    "FLAGGED_ANOMALY",
)
VERIFICATION_SOURCES = ("APP_GPS_QR", "SUPERVISOR_VERIFIED", "MANUAL_ENTRY")
WEAPON_TYPES = ("RIFLE", "SHOTGUN", "PISTOL")
WEAPON_CONDITIONS = ("SERVICEABLE", "UNSERVICEABLE")
ARMOURY_STATUSES = ("ISSUED", "AVAILABLE", "MAINTENANCE")
LEAVE_TYPES = ("ANNUAL", "CASUAL", "MEDICAL", "EMERGENCY", "WEEKLY_REST")
LEAVE_STATUSES = ("PENDING", "APPROVED", "REJECTED")
BROADCAST_PRIORITIES = ("NORMAL", "IMPORTANT", "CRITICAL")
BROADCAST_CATEGORIES = (
    "EMERGENCY",
    "THREAT_WARNING",
    "WEATHER",
    "POSTURE_CHANGE",
    "VIP_MOVEMENT",
    "REINFORCEMENT",
)
INCIDENT_TYPES = (
    "THEFT",
    "BURGLARY",
    "ATTEMPTED_INTRUSION",
    "FIRE",
    "MEDICAL_EMERGENCY",
    "SUSPICIOUS_ACTIVITY",
    "GUARD_MISCONDUCT",
    "CLIENT_COMPLAINT",
    "WEAPON_INCIDENT",
)
INSPECTION_TYPES = ("DAILY", "SURPRISE")
PREVIOUS_SERVICES = ("ARMY", "POLICE", "CIVILIAN")


supervisor_zones = db.Table(
    "supervisor_zones",
    db.Column(
        "supervisor_id",
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "zone_id",
        db.String(36),
        db.ForeignKey("zones.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    employee_id = db.Column(db.String(24), unique=True, nullable=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(190), unique=True, nullable=True)
    phone_number = db.Column(db.String(30), unique=True, nullable=False)
    cnic = db.Column(db.String(30), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(20), nullable=False, default="GUARD")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    photo_url = db.Column(db.String(255), nullable=True)
    zone_id = db.Column(db.String(36), db.ForeignKey("zones.id", ondelete="SET NULL"))
    assigned_post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="SET NULL")
    )
    employment_status = db.Column(db.String(20), nullable=False, default="ACTIVE")
    token_version = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    profile = db.relationship(
        "GuardProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="GuardProfile.user_id",
    )
    zones = db.relationship(
        "Zone", secondary=supervisor_zones, back_populates="supervisors"
    )
    zone = db.relationship("Zone", foreign_keys=[zone_id])
    assigned_post = db.relationship("Post", foreign_keys=[assigned_post_id])

    # -- password handling -------------------------------------------------
    def set_password(self, password: str) -> None:
        import bcrypt

        raw = password.encode("utf-8")[:72]
        self.password_hash = bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")
        self.token_version = (self.token_version or 0) + 1

    def check_password(self, password: str) -> bool:
        """A user with no password hash can never authenticate."""
        if not self.password_hash:
            return False
        if not isinstance(password, str) or not password:
            return False
        import bcrypt

        try:
            return bcrypt.checkpw(
                password.encode("utf-8")[:72], self.password_hash.encode("utf-8")
            )
        except (ValueError, TypeError):
            return False

    @property
    def is_staff(self) -> bool:
        return self.role in ("CEO", "OPS_MANAGER", "SUPERVISOR")

    def to_dict(self, include_sensitive: bool = False):
        profile = self.profile
        payload = {
            "id": self.id,
            "employee_id": self.employee_id,
            "full_name": self.full_name,
            "email": self.email,
            "phone_number": self.phone_number,
            "role": self.role,
            "is_active": bool(self.is_active),
            "photo_url": self.photo_url,
            "zone_id": self.zone_id,
            "zone_name": self.zone.name if self.zone else None,
            "assigned_post_id": self.assigned_post_id,
            "employment_status": self.employment_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "zone_ids": [z.id for z in self.zones] if self.role == "SUPERVISOR" else [],
            "zone_names": [z.name for z in self.zones] if self.role == "SUPERVISOR" else [],
            "profile": profile.to_dict() if profile else None,
        }
        payload["cnic"] = self.cnic if include_sensitive else mask_cnic(self.cnic)
        return payload


class GuardProfile(db.Model):
    __tablename__ = "guard_profiles"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    father_name = db.Column(db.String(120), nullable=True)
    cnic_expiry_date = db.Column(db.Date, nullable=True)
    permanent_address = db.Column(db.Text, nullable=True)
    emergency_contact = db.Column(db.String(60), nullable=True)
    date_of_joining = db.Column(db.Date, nullable=True)
    previous_service = db.Column(db.String(20), nullable=True)
    rank = db.Column(db.String(40), nullable=True)
    qualification = db.Column(db.String(120), nullable=True)
    training_record = db.Column(db.String(255), nullable=True)
    training_expiry_date = db.Column(db.Date, nullable=True)
    medical_fitness = db.Column(db.String(20), nullable=True, default="FIT")
    medical_expiry_date = db.Column(db.Date, nullable=True)
    assigned_post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    employment_status = db.Column(db.String(20), nullable=False, default="ACTIVE")

    user = db.relationship(
        "User", back_populates="profile", foreign_keys=[user_id]
    )
    assigned_post = db.relationship("Post", foreign_keys=[assigned_post_id])

    @staticmethod
    def _expiring(value, days: int = 30):
        if not value:
            return False
        today = date.today()
        return today <= value <= today + timedelta(days=days)

    def to_dict(self):
        return {
            "father_name": self.father_name,
            "cnic_expiry_date": self.cnic_expiry_date.isoformat()
            if self.cnic_expiry_date
            else None,
            "cnic_expiring_soon": self._expiring(self.cnic_expiry_date),
            "permanent_address": self.permanent_address,
            "emergency_contact": self.emergency_contact,
            "date_of_joining": self.date_of_joining.isoformat()
            if self.date_of_joining
            else None,
            "previous_service": self.previous_service,
            "rank": self.rank,
            "qualification": self.qualification,
            "training_record": self.training_record,
            "training_expiry_date": self.training_expiry_date.isoformat()
            if self.training_expiry_date
            else None,
            "training_expiring_soon": self._expiring(self.training_expiry_date),
            "medical_fitness": self.medical_fitness,
            "medical_expiry_date": self.medical_expiry_date.isoformat()
            if self.medical_expiry_date
            else None,
            "medical_expiring_soon": self._expiring(self.medical_expiry_date),
            "assigned_post_id": self.assigned_post_id,
            "assigned_post_name": self.assigned_post.name
            if self.assigned_post
            else None,
            "employment_status": self.employment_status,
        }


class Zone(db.Model):
    __tablename__ = "zones"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False, unique=True)
    code = db.Column(db.String(20), nullable=True)
    description = db.Column(db.String(255), nullable=True)
    areas = db.Column(db.Text, nullable=True)  # JSON list of covered areas
    supervisor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status = db.Column(db.String(10), nullable=False, default="GREEN")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    supervisor = db.relationship("User", foreign_keys=[supervisor_id])
    supervisors = db.relationship(
        "User", secondary=supervisor_zones, back_populates="zones"
    )
    posts = db.relationship(
        "Post",
        backref="zone",
        lazy="selectin",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="Post.zone_id",
    )

    @property
    def area_list(self):
        """Areas covered by the zone; older rows only carry the description."""
        stored = loads(self.areas, None)
        if isinstance(stored, list):
            areas = [str(item).strip() for item in stored if str(item).strip()]
            if areas:
                return areas
        # legacy rows stored one combined area string, e.g. "Central / Korangi"
        legacy = (self.description or "").replace("/", ",")
        return [part.strip() for part in legacy.split(",") if part.strip()]

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "areas": self.area_list,
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor.full_name if self.supervisor else None,
            "supervisor_phone": self.supervisor.phone_number
            if self.supervisor
            else None,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Post(db.Model):
    __tablename__ = "posts"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    zone_id = db.Column(
        db.String(36), db.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False
    )
    supervisor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name = db.Column(db.String(120), nullable=False)
    client_name = db.Column(db.String(120), nullable=True)
    required_strength = db.Column(db.Integer, nullable=False, default=1)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    geofence_type = db.Column(db.String(20), nullable=False, default="CIRCLE")
    radius_meters = db.Column(db.Float, nullable=False, default=100.0)
    geofence_data = db.Column(db.Text, nullable=True)  # JSON polygon points
    qr_code_secret = db.Column(db.String(120), nullable=False, default=lambda: uuid.uuid4().hex)
    status = db.Column(db.String(10), nullable=False, default="GREEN")
    address = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    supervisor = db.relationship("User", foreign_keys=[supervisor_id])
    rosters = db.relationship(
        "Roster", backref="post", lazy="selectin", passive_deletes=True
    )

    @property
    def geofence_points(self):
        return loads(self.geofence_data, [])

    def to_dict(self):
        return {
            "id": self.id,
            "zone_id": self.zone_id,
            "zone_name": self.zone.name if self.zone else None,
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor.full_name
            if self.supervisor
            else None,
            "name": self.name,
            "client_name": self.client_name,
            "required_strength": self.required_strength,
            "lat": self.lat,
            "lng": self.lng,
            "geofence_type": self.geofence_type,
            "radius_meters": self.radius_meters,
            "geofence_data": self.geofence_points,
            "status": self.status,
            "address": self.address,
        }


class Roster(db.Model):
    __tablename__ = "rosters"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    duty_date = db.Column(db.Date, nullable=False, default=date.today)
    duty_shift = db.Column(db.String(10), nullable=False, default="DAY")
    duty_timing = db.Column(db.String(20), nullable=False, default="0700-1900")
    replacement_guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    supervisor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    guard = db.relationship("User", foreign_keys=[guard_id])
    replacement = db.relationship("User", foreign_keys=[replacement_guard_id])
    supervisor = db.relationship("User", foreign_keys=[supervisor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "post_id": self.post_id,
            "guard_id": self.guard_id,
            "guard_name": self.guard.full_name if self.guard else None,
            "employee_id": self.guard.employee_id if self.guard else None,
            "guard_rank": self.guard.profile.rank
            if self.guard and self.guard.profile
            else None,
            "duty_date": self.duty_date.isoformat() if self.duty_date else None,
            "duty_shift": self.duty_shift,
            "duty_timing": self.duty_timing,
            "replacement_guard_id": self.replacement_guard_id,
            "replacement_guard_name": self.replacement.full_name
            if self.replacement
            else None,
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor.full_name
            if self.supervisor
            else None,
        }


class AttendanceLog(db.Model):
    __tablename__ = "attendance_logs"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    roster_id = db.Column(
        db.String(36), db.ForeignKey("rosters.id", ondelete="SET NULL"), nullable=True
    )
    punch_type = db.Column(db.String(10), nullable=False, default="IN")
    punch_timestamp = db.Column(db.DateTime, default=utcnow, nullable=False)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    distance_meters = db.Column(db.Float, nullable=True)
    is_geofence_valid = db.Column(db.Boolean, nullable=False, default=True)
    is_mock_location = db.Column(db.Boolean, nullable=False, default=False)
    qr_valid = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(db.String(20), nullable=False, default="PRESENT")
    overtime_hours = db.Column(db.Float, nullable=False, default=0.0)
    verification_source = db.Column(
        db.String(30), nullable=False, default="APP_GPS_QR"
    )
    supervisor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    device_uuid = db.Column(db.String(128), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    guard = db.relationship("User", foreign_keys=[guard_id])
    supervisor = db.relationship("User", foreign_keys=[supervisor_id])
    post = db.relationship("Post", foreign_keys=[post_id])

    def to_dict(self):
        return {
            "id": self.id,
            "guard_id": self.guard_id,
            "guard_name": self.guard.full_name if self.guard else None,
            "employee_id": self.guard.employee_id if self.guard else None,
            "post_id": self.post_id,
            "post_name": self.post.name if self.post else None,
            "zone_id": self.post.zone_id if self.post else None,
            "punch_type": self.punch_type,
            "punch_timestamp": self.punch_timestamp.isoformat()
            if self.punch_timestamp
            else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "distance_meters": round(self.distance_meters, 1)
            if self.distance_meters is not None
            else None,
            "is_geofence_valid": bool(self.is_geofence_valid),
            "is_mock_location": bool(self.is_mock_location),
            "qr_valid": bool(self.qr_valid),
            "status": self.status,
            "overtime_hours": self.overtime_hours,
            "verification_source": self.verification_source,
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor.full_name
            if self.supervisor
            else None,
            "notes": self.notes,
        }


class Device(db.Model):
    __tablename__ = "devices"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    device_uuid = db.Column(db.String(128), unique=True, nullable=False)
    fcm_token = db.Column(db.String(255), nullable=True)
    platform = db.Column(db.String(20), default="ANDROID")
    registered_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_uuid": self.device_uuid,
            "platform": self.platform,
        }


class FaceProfile(db.Model):
    __tablename__ = "face_profiles"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    embedding_blob = db.Column(db.LargeBinary, nullable=True)
    photo_path = db.Column(db.String(255), nullable=True)
    enrolled_at = db.Column(db.DateTime, default=utcnow)
    is_active = db.Column(db.Boolean, default=True)


class GuardLocationBreadcrumb(db.Model):
    __tablename__ = "guard_location_breadcrumbs"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    post_id = db.Column(db.String(36), nullable=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    heading = db.Column(db.Float, default=0.0)
    speed = db.Column(db.Float, default=0.0)
    accuracy = db.Column(db.Float, default=5.0)
    distance_meters = db.Column(db.Float, default=0.0)
    is_breached = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=utcnow)


class Weapon(db.Model):
    __tablename__ = "weapons"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    weapon_type = db.Column(db.String(20), nullable=False)
    make_model = db.Column(db.String(120), nullable=True)
    serial_number = db.Column(db.String(80), unique=True, nullable=False)
    licence_number = db.Column(db.String(80), nullable=True)
    licence_expiry_date = db.Column(db.Date, nullable=True)
    ammunition_count = db.Column(db.Integer, nullable=False, default=0)
    assigned_post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    issued_to_guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    issued_at = db.Column(db.DateTime, nullable=True)
    condition = db.Column(db.String(20), nullable=False, default="SERVICEABLE")
    last_inspection_date = db.Column(db.Date, nullable=True)
    armoury_status = db.Column(db.String(20), nullable=False, default="AVAILABLE")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    assigned_post = db.relationship("Post", foreign_keys=[assigned_post_id])
    issued_to = db.relationship("User", foreign_keys=[issued_to_guard_id])

    def to_dict(self):
        profile_flag = False
        if self.licence_expiry_date:
            today = date.today()
            profile_flag = today <= self.licence_expiry_date <= today + timedelta(
                days=30
            )
        return {
            "id": self.id,
            "weapon_type": self.weapon_type,
            "make_model": self.make_model,
            "serial_number": self.serial_number,
            "licence_number": self.licence_number,
            "licence_expiry_date": self.licence_expiry_date.isoformat()
            if self.licence_expiry_date
            else None,
            "licence_expiring_soon": profile_flag,
            "ammunition_count": self.ammunition_count,
            "assigned_post_id": self.assigned_post_id,
            "assigned_post_name": self.assigned_post.name
            if self.assigned_post
            else None,
            "issued_to_guard_id": self.issued_to_guard_id,
            "issued_to_name": self.issued_to.full_name if self.issued_to else None,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
            "condition": self.condition,
            "last_inspection_date": self.last_inspection_date.isoformat()
            if self.last_inspection_date
            else None,
            "armoury_status": self.armoury_status,
        }


class WeaponLog(db.Model):
    __tablename__ = "weapon_logs"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    weapon_id = db.Column(
        db.String(36), db.ForeignKey("weapons.id", ondelete="CASCADE"), nullable=False
    )
    action = db.Column(db.String(30), nullable=False)
    guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    actor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "weapon_id": self.weapon_id,
            "action": self.action,
            "guard_id": self.guard_id,
            "post_id": self.post_id,
            "actor_id": self.actor_id,
            "actor_name": self.actor.full_name if self.actor else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class LeaveRequest(db.Model):
    __tablename__ = "leave_requests"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    guard_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    leave_type = db.Column(db.String(20), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    expected_return_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="PENDING")
    reason = db.Column(db.Text, nullable=True)
    approved_by = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    decided_at = db.Column(db.DateTime, nullable=True)

    guard = db.relationship("User", foreign_keys=[guard_id])
    approver = db.relationship("User", foreign_keys=[approved_by])

    def to_dict(self):
        return {
            "id": self.id,
            "guard_id": self.guard_id,
            "guard_name": self.guard.full_name if self.guard else None,
            "employee_id": self.guard.employee_id if self.guard else None,
            "leave_type": self.leave_type,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "expected_return_date": self.expected_return_date.isoformat()
            if self.expected_return_date
            else None,
            "status": self.status,
            "reason": self.reason,
            "approved_by": self.approved_by,
            "approved_by_name": self.approver.full_name if self.approver else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CommandBroadcast(db.Model):
    __tablename__ = "command_broadcasts"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String(20), nullable=False, default="NORMAL")
    category = db.Column(db.String(30), nullable=False, default="POSTURE_CHANGE")
    issued_by = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    target_scope = db.Column(db.String(20), nullable=False, default="ALL")
    target_zone_ids = db.Column(db.Text, nullable=True)
    target_post_ids = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    issuer = db.relationship("User", foreign_keys=[issued_by])
    acks = db.relationship(
        "BroadcastAck", backref="broadcast", lazy="selectin", passive_deletes=True
    )

    @property
    def zone_ids(self):
        return loads(self.target_zone_ids, [])

    @property
    def post_ids(self):
        return loads(self.target_post_ids, [])

    def to_dict(self, include_acks=False):
        acked = [a for a in self.acks if a.ack_status == "RECEIVED"]
        complied = [a for a in self.acks if a.compliance_status == "ACTION_TAKEN"]
        payload = {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "priority": self.priority,
            "category": self.category,
            "issued_by": self.issued_by,
            "issued_by_name": self.issuer.full_name if self.issuer else None,
            "target_scope": self.target_scope,
            "target_zone_ids": self.zone_ids,
            "target_post_ids": self.post_ids,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "recipient_count": len(self.acks),
            "received_count": len(acked),
            "not_received_count": len(self.acks) - len(acked),
            "action_taken_count": len(complied),
            "pending_count": len(self.acks) - len(complied),
        }
        if include_acks:
            payload["acks"] = [a.to_dict() for a in self.acks]
        return payload


class BroadcastAck(db.Model):
    __tablename__ = "broadcast_acks"
    __table_args__ = (
        db.UniqueConstraint("broadcast_id", "user_id", name="uq_broadcast_recipient"),
    )

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    broadcast_id = db.Column(
        db.String(36),
        db.ForeignKey("command_broadcasts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    ack_status = db.Column(db.String(20), nullable=False, default="NOT_RECEIVED")
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    compliance_status = db.Column(db.String(20), nullable=False, default="PENDING")
    action_notes = db.Column(db.Text, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "broadcast_id": self.broadcast_id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "role": self.user.role if self.user else None,
            "ack_status": self.ack_status,
            "acknowledged_at": self.acknowledged_at.isoformat()
            if self.acknowledged_at
            else None,
            "compliance_status": self.compliance_status,
            "action_notes": self.action_notes,
        }


class Incident(db.Model):
    __tablename__ = "incidents"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    incident_type = db.Column(db.String(40), nullable=False)
    post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    zone_id = db.Column(
        db.String(36), db.ForeignKey("zones.id", ondelete="SET NULL"), nullable=True
    )
    reported_by_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    personnel_involved = db.Column(db.String(255), nullable=True)
    occurred_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    immediate_action = db.Column(db.Text, nullable=True)
    supervisor_report = db.Column(db.Text, nullable=True)
    management_remarks = db.Column(db.Text, nullable=True)
    evidence_paths = db.Column(db.Text, nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="OPEN")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    resolved_at = db.Column(db.DateTime, nullable=True)

    post = db.relationship("Post", foreign_keys=[post_id])
    zone = db.relationship("Zone", foreign_keys=[zone_id])
    reporter = db.relationship("User", foreign_keys=[reported_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "incident_type": self.incident_type,
            "post_id": self.post_id,
            "post_name": self.post.name if self.post else None,
            "zone_id": self.zone_id,
            "zone_name": self.zone.name if self.zone else None,
            "reported_by_id": self.reported_by_id,
            "reported_by_name": self.reporter.full_name if self.reporter else None,
            "personnel_involved": self.personnel_involved,
            "occurred_at": self.occurred_at.isoformat()
            if self.occurred_at
            else None,
            "immediate_action": self.immediate_action,
            "supervisor_report": self.supervisor_report,
            "management_remarks": self.management_remarks,
            "evidence_paths": loads(self.evidence_paths, []),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class SiteInspection(db.Model):
    __tablename__ = "site_inspections"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    post_id = db.Column(
        db.String(36), db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    supervisor_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    inspection_type = db.Column(db.String(20), nullable=False, default="DAILY")
    inspected_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    turnout_uniform_ok = db.Column(db.Boolean, nullable=False, default=True)
    weapons_condition = db.Column(db.String(30), nullable=True)
    attendance_verified = db.Column(db.Boolean, nullable=False, default=True)
    security_preparedness = db.Column(db.String(30), nullable=True)
    client_feedback = db.Column(db.Text, nullable=True)
    deficiencies = db.Column(db.Text, nullable=True)
    corrective_action = db.Column(db.Text, nullable=True)
    score = db.Column(db.Integer, nullable=True)

    post = db.relationship("Post", foreign_keys=[post_id])
    supervisor = db.relationship("User", foreign_keys=[supervisor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "post_id": self.post_id,
            "post_name": self.post.name if self.post else None,
            "zone_id": self.post.zone_id if self.post else None,
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor.full_name
            if self.supervisor
            else None,
            "inspection_type": self.inspection_type,
            "inspected_at": self.inspected_at.isoformat()
            if self.inspected_at
            else None,
            "turnout_uniform_ok": bool(self.turnout_uniform_ok),
            "weapons_condition": self.weapons_condition,
            "attendance_verified": bool(self.attendance_verified),
            "security_preparedness": self.security_preparedness,
            "client_feedback": self.client_feedback,
            "deficiencies": self.deficiencies,
            "corrective_action": self.corrective_action,
            "score": self.score,
        }


class Document(db.Model):
    __tablename__ = "documents"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    title = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(40), nullable=False, default="GENERAL")
    filename = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    entity_type = db.Column(db.String(40), nullable=True)
    entity_id = db.Column(db.String(36), nullable=True)
    uploaded_by = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    uploader = db.relationship("User", foreign_keys=[uploaded_by])

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "filename": self.filename,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "uploaded_by": self.uploaded_by,
            "uploaded_by_name": self.uploader.full_name if self.uploader else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "download_url": f"/api/documents/{self.id}/download",
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), nullable=True)
    role = db.Column(db.String(20), nullable=True)
    action = db.Column(db.String(80), nullable=False)
    entity_type = db.Column(db.String(40), nullable=True)
    entity_id = db.Column(db.String(36), nullable=True)
    ip_address = db.Column(db.String(60), nullable=True)
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "role": self.role,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "ip_address": self.ip_address,
            "details": loads(self.details, {}),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TokenRevocation(db.Model):
    __tablename__ = "token_revocations"

    jti = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.String(36), nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime, default=utcnow, nullable=False)
