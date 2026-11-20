"""Authentication, authorisation, scoping and audit helpers."""
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from database import db
from models import AuditLog, TokenRevocation, User, utcnow


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status


def password_policy_error(password: str):
    """Return a human readable reason, or None when the password is strong."""
    if not password or len(password) < 10:
        return "Password must be at least 10 characters long."
    checks = (
        (any(c.islower() for c in password), "a lowercase letter"),
        (any(c.isupper() for c in password), "an uppercase letter"),
        (any(c.isdigit() for c in password), "a number"),
        (any(not c.isalnum() for c in password), "a symbol"),
    )
    missing = [label for ok, label in checks if not ok]
    if missing:
        return "Password must contain " + ", ".join(missing) + "."
    return None


def _now():
    return datetime.now(timezone.utc)


def _encode(payload: dict) -> str:
    return jwt.encode(
        payload,
        current_app.config["JWT_SECRET_KEY"],
        algorithm=current_app.config.get("JWT_ALGORITHM", "HS256"),
    )


def issue_tokens(user: User):
    """Return (access_token, refresh_token, expires_in_seconds)."""
    now = _now()
    access_minutes = int(current_app.config.get("JWT_ACCESS_MINUTES", 45))
    refresh_days = int(current_app.config.get("JWT_REFRESH_DAYS", 7))
    access_payload = {
        "sub": user.id,
        "role": user.role,
        "type": "access",
        "tv": user.token_version or 1,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(minutes=access_minutes),
    }
    refresh_payload = {
        "sub": user.id,
        "role": user.role,
        "type": "refresh",
        "tv": user.token_version or 1,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(days=refresh_days),
    }
    return (
        _encode(access_payload),
        _encode(refresh_payload),
        access_minutes * 60,
    )


def decode_token(token: str, expected_type: str = "access") -> dict:
    if not token or not isinstance(token, str):
        raise AuthError("Authentication token is required.")
    try:
        payload = jwt.decode(
            token,
            current_app.config["JWT_SECRET_KEY"],
            algorithms=[current_app.config.get("JWT_ALGORITHM", "HS256")],
            options={"require": ["exp", "iat", "sub", "jti", "type"]},
        )
    except jwt.ExpiredSignatureError:
        raise AuthError("Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid authentication token.")

    if payload.get("type") != expected_type:
        raise AuthError("Invalid token type.")

    revoked = db.session.get(TokenRevocation, payload["jti"])
    if revoked:
        raise AuthError("Token has been revoked.")

    user = db.session.get(User, payload["sub"])
    if not user or not user.is_active:
        raise AuthError("Account is not active.", 403)
    if int(payload.get("tv") or 0) != int(user.token_version or 0):
        raise AuthError("Session is no longer valid. Please sign in again.")
    return payload


def bearer_token() -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError("Authentication token is required.")
    return header.removeprefix("Bearer ").strip()


def current_token_payload():
    return decode_token(bearer_token(), "access")


def authenticate() -> User:
    payload = decode_token(bearer_token(), "access")
    user = db.session.get(User, payload["sub"])
    if not user or not user.is_active:
        raise AuthError("Account is not active.", 403)
    return user


def jwt_required(roles=None):
    """Require a valid access token; optionally restrict to specific roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                user = authenticate()
            except AuthError as exc:
                return jsonify({"error": exc.message}), exc.status
            if roles and user.role not in roles:
                return jsonify({"error": "Forbidden: insufficient role"}), 403
            g.current_user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def role_required(*roles):
    return jwt_required(roles=roles)


def current_user() -> User:
    user = getattr(g, "current_user", None)
    if not user:
        raise AuthError("Authentication required.")
    return user


# ---------------------------------------------------------------------------
# Zone scoping (IDOR protection)
# ---------------------------------------------------------------------------
def scoped_zone_ids(user: User):
    """None means unrestricted; otherwise the exact set a user may touch."""
    if user.role in ("CEO", "OPS_MANAGER"):
        return None
    ids = {z.id for z in user.zones}
    if user.zone_id:
        ids.add(user.zone_id)
    return ids


def can_access_zone(user: User, zone_id) -> bool:
    scoped = scoped_zone_ids(user)
    if scoped is None:
        return True
    return zone_id in scoped


def assert_zone_access(user: User, zone_id) -> None:
    if not can_access_zone(user, zone_id):
        raise AuthError("Forbidden: outside your assigned zone(s).", 403)


def can_access_guard(user: User, guard: User) -> bool:
    scoped = scoped_zone_ids(user)
    if scoped is None:
        return True
    if guard.id == user.id:
        return True
    guard_zones = {z.id for z in guard.zones}
    if guard.zone_id:
        guard_zones.add(guard.zone_id)
    if guard.profile and guard.profile.assigned_post_id:
        from models import Post

        post = db.session.get(Post, guard.profile.assigned_post_id)
        if post:
            guard_zones.add(post.zone_id)
    if guard.assigned_post_id:
        from models import Post

        post = db.session.get(Post, guard.assigned_post_id)
        if post:
            guard_zones.add(post.zone_id)
    return bool(guard_zones & scoped)


# ---------------------------------------------------------------------------
# Audit trail & revocation
# ---------------------------------------------------------------------------
def record_audit(
    action: str,
    entity_type: str = None,
    entity_id: str = None,
    details: dict = None,
    user: User = None,
):
    actor = user or getattr(g, "current_user", None)
    entry = AuditLog(
        user_id=actor.id if actor else None,
        role=actor.role if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip_address=request.remote_addr if request else None,
        details=repr(details) if details else None,
    )
    db.session.add(entry)
    return entry


def revoke_jti(jti: str, user_id: str, expires_at: datetime):
    if not jti or db.session.get(TokenRevocation, jti):
        return
    db.session.add(
        TokenRevocation(jti=jti, user_id=user_id, expires_at=expires_at)
    )
