"""Central configuration for the Lionel Security operations platform.

All secrets are loaded from the environment (``backend/.env`` during local
development).  Nothing security-relevant is hardcoded in this file.
"""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def load_env_file(path: Path) -> None:
    """Minimal .env loader so the project does not need an extra dependency."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file(BASE_DIR / ".env")


def _origins() -> list[str]:
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3015,http://127.0.0.1:3015,http://localhost:5173",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Config:
    ENV = os.getenv("FLASK_ENV", "development")

    # Signed-JWT secret. Never ship a default: a random 48-byte value is
    # generated per process when the environment does not provide one.
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_urlsafe(48)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(48)
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_MINUTES = int(os.getenv("JWT_ACCESS_MINUTES", "45"))
    JWT_REFRESH_DAYS = int(os.getenv("JWT_REFRESH_DAYS", "7"))

    DATABASE_PATH = os.getenv("LIONEL_DB_PATH", str(BASE_DIR / "lionel.db"))
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{DATABASE_PATH}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 15, "check_same_thread": False}
    }

    ALLOWED_ORIGINS = _origins()

    UPLOAD_FOLDER = str(BASE_DIR / "uploads")
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB upload ceiling
    ALLOWED_UPLOAD_EXTENSIONS = {"pdf", "jpg", "jpeg", "png"}
    ALLOWED_UPLOAD_MIMES = {
        "application/pdf",
        "image/jpeg",
        "image/png",
    }

    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "true").lower() != "false"
    LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5 per minute")

    SECURITY_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(self), camera=(self), microphone=()",
    }

    SOCKETIO_MESSAGE_QUEUE = os.getenv("SOCKETIO_MESSAGE_QUEUE") or None
    SOCKETIO_CORS_ALLOWED_ORIGINS = ALLOWED_ORIGINS
