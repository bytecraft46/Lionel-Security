"""Authentication: signed JWT login, refresh, revocation, device lock."""
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_limiter.util import get_remote_address
from sqlalchemy import or_

from config import Config
from database import db
from extensions import limiter
from models import Device, TokenRevocation, User, utcnow
from security import (
    AuthError,
    assert_zone_access,
    current_user,
    decode_token,
    issue_tokens,
    jwt_required,
    password_policy_error,
    record_audit,
    revoke_jti,
)

auth_bp = Blueprint("auth", __name__)

# Command hierarchy: each desk may only provision the desk directly below it.
CREATABLE_ROLES = {
    "CEO": ("OPS_MANAGER", "SUPERVISOR"),
    "OPS_MANAGER": ("SUPERVISOR",),
    "SUPERVISOR": ("GUARD",),
}


def _login_key():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip().lower()
    return f"{get_remote_address()}:{identifier}"


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(Config.LOGIN_RATE_LIMIT, key_func=_login_key)
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip()
    password = data.get("password") or ""
    device_uuid = (data.get("device_uuid") or "").strip()

    if not identifier or not password:
        return jsonify({"error": "Identifier and password are required."}), 400

    user = User.query.filter(
        or_(
            User.email == identifier.lower(),
            User.phone_number == identifier,
            User.cnic == identifier,
            User.employee_id == identifier,
        )
    ).first()

    # Uniform failure response prevents account enumeration.
    if not user or not user.check_password(password):
        record_audit("LOGIN_FAILED", "user", user.id if user else None)
        db.session.commit()
        return jsonify({"error": "Invalid credentials."}), 401

    if not user.is_active:
        return jsonify({"error": "Account is inactive. Contact Operations."}), 403
    if user.employment_status == "TERMINATED":
        return jsonify({"error": "Account is terminated."}), 403

    device_info = None
    if user.role == "GUARD" and device_uuid:
        existing = Device.query.filter_by(user_id=user.id).first()
        if existing and existing.device_uuid != device_uuid:
            return (
                jsonify(
                    {
                        "error": "Hardware lock: account bound to another handset.",
                        "locked": True,
                    }
                ),
                403,
            )
        if existing:
            device_info = existing.to_dict()

    access_token, refresh_token, expires_in = issue_tokens(user)
    record_audit("LOGIN_SUCCESS", "user", user.id)
    db.session.commit()

    return (
        jsonify(
            {
                "message": f"Welcome back, {user.full_name}",
                "token": access_token,  # legacy mobile alias
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": expires_in,
                "user": user.to_dict(include_sensitive=True),
                "device": device_info,
            }
        ),
        200,
    )


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    data = request.get_json(silent=True) or {}
    token = data.get("refresh_token")
    header = request.headers.get("Authorization", "")
    if not token and header.startswith("Bearer "):
        token = header.removeprefix("Bearer ").strip()

    try:
        payload = decode_token(token, "refresh")
    except AuthError as exc:
        return jsonify({"error": exc.message}), exc.status

    user = db.session.get(User, payload["sub"])
    if not user or not user.is_active:
        return jsonify({"error": "Account is not active."}), 403

    # Rotate: the used refresh token cannot be replayed.
    revoke_jti(
        payload["jti"],
        user.id,
        datetime.fromtimestamp(payload["exp"], tz=timezone.utc).replace(tzinfo=None),
    )
    access_token, refresh_token, expires_in = issue_tokens(user)
    db.session.commit()
    return (
        jsonify(
            {
                "access_token": access_token,
                "token": access_token,
                "refresh_token": refresh_token,
                "expires_in": expires_in,
                "user": user.to_dict(include_sensitive=True),
            }
        ),
        200,
    )


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    user = current_user()
    data = request.get_json(silent=True) or {}
    tokens = [request.headers.get("Authorization", "").removeprefix("Bearer ").strip()]
    if data.get("refresh_token"):
        tokens.append(data["refresh_token"])

    for token in tokens:
        if not token:
            continue
        try:
            payload = decode_token(token, payload_type_override(token))
        except AuthError:
            continue
        revoke_jti(
            payload["jti"],
            user.id,
            datetime.fromtimestamp(payload["exp"], tz=timezone.utc).replace(tzinfo=None),
        )

    record_audit("LOGOUT", "user", user.id)
    db.session.commit()
    return jsonify({"message": "Signed out."}), 200


def payload_type_override(token):
    """Logout accepts both access and refresh tokens."""
    import jwt as pyjwt

    unverified = pyjwt.decode(token, options={"verify_signature": False})
    return unverified.get("type", "access")


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = current_user()
    return jsonify({"user": user.to_dict(include_sensitive=True)}), 200


@auth_bp.route("/register", methods=["POST"])
@jwt_required(roles=("CEO", "OPS_MANAGER", "SUPERVISOR"))
def register_user():
    """Hierarchical account provisioning (no public self-registration)."""
    from models import GuardProfile

    actor = current_user()
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "GUARD").upper()
    phone_number = (data.get("phone_number") or "").strip()
    email = (data.get("email") or "").strip().lower() or None
    cnic = (data.get("cnic") or "").strip() or None

    if not full_name or not phone_number:
        return jsonify({"error": "full_name and phone_number are required."}), 400
    if role not in CREATABLE_ROLES.get(actor.role, ()):
        return jsonify({
            "error": f"A {actor.role.replace('_', ' ').title()} cannot create a {role.replace('_', ' ').title()} account."
        }), 403
    policy_error = password_policy_error(password)
    if policy_error:
        return jsonify({"error": policy_error}), 400
    if User.query.filter_by(phone_number=phone_number).first():
        return jsonify({"error": "Phone number already registered."}), 409
    if email and User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered."}), 409

    zone_id = data.get("zone_id")
    if actor.role == "SUPERVISOR":
        zone_id = actor.zone_id
    if role == "SUPERVISOR" and not zone_id:
        return jsonify({"error": "A zone is required for supervisor accounts."}), 400
    if zone_id:
        assert_zone_access(actor, zone_id)

    user = User(
        full_name=full_name,
        email=email,
        phone_number=phone_number,
        cnic=cnic,
        role=role,
        employee_id=data.get("employee_id"),
        zone_id=zone_id,
        assigned_post_id=data.get("assigned_post_id"),
        is_active=True,
        employment_status="ACTIVE",
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    if role == "GUARD":
        db.session.add(
            GuardProfile(
                user_id=user.id,
                rank=data.get("rank"),
                assigned_post_id=data.get("assigned_post_id"),
                date_of_joining=utcnow().date(),
            )
        )

    record_audit(
        "USER_CREATED",
        "user",
        user.id,
        {"role": role, "created_by": actor.id},
        user=actor,
    )
    db.session.commit()
    return jsonify({"message": "Account created.", "user": user.to_dict()}), 201


@auth_bp.route("/device-register", methods=["POST"])
@jwt_required()
def register_device():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    device_uuid = (data.get("device_uuid") or "").strip()
    if not device_uuid:
        return jsonify({"error": "device_uuid is required."}), 400

    target_id = data.get("user_id")
    if actor.role == "GUARD" and target_id and target_id != actor.id:
        return jsonify({"error": "Guards may only bind their own device."}), 403
    user = db.session.get(User, target_id or actor.id)
    if not user:
        return jsonify({"error": "Account not found."}), 404

    existing = Device.query.filter_by(device_uuid=device_uuid).first()
    if existing and existing.user_id != user.id:
        return jsonify({"error": "Device already bound to another guard."}), 403

    user_device = Device.query.filter_by(user_id=user.id).first()
    if user_device and user_device.device_uuid != device_uuid:
        return jsonify({"error": "Account locked to another handset."}), 403
    if user_device:
        return jsonify({"message": "Device verified.", "device": user_device.to_dict()}), 200

    device = Device(
        user_id=user.id,
        device_uuid=device_uuid,
        platform=(data.get("platform") or "ANDROID").upper(),
        fcm_token=data.get("fcm_token"),
    )
    db.session.add(device)
    record_audit("DEVICE_REGISTERED", "device", device.id, {"uuid": device_uuid}, user=actor)
    db.session.commit()
    return jsonify({"message": "Device registered.", "device": device.to_dict()}), 201
