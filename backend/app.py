"""Lionel Security — Centralised Guard Deployment & Security Operations API."""
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from sqlalchemy import inspect, text

from config import Config
from database import db
from extensions import limiter
from models import User
from security import AuthError, decode_token, scoped_zone_ids


def _add_missing_zone_columns():
    """There is no migration tool: add columns that older databases predate."""
    inspector = inspect(db.engine)
    if "zones" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("zones")}
    if "areas" not in columns:
        db.session.execute(text("ALTER TABLE zones ADD COLUMN areas TEXT"))
        db.session.commit()


def create_app(test_config=None):
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    limiter.init_app(app)

    origins = app.config.get("ALLOWED_ORIGINS") or []
    CORS(
        app,
        resources={r"/api/*": {"origins": origins}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        expose_headers=["Content-Disposition"],
    )

    socketio = SocketIO(
        app,
        cors_allowed_origins=origins,
        async_mode="threading",
        logger=False,
        engineio_logger=False,
    )
    app.extensions["socketio"] = socketio

    from routes.auth import auth_bp
    from routes.command import command_bp
    from routes.dashboard import dashboard_bp
    from routes.operations import operations_bp
    from routes.personnel import personnel_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(dashboard_bp, url_prefix="/api")
    app.register_blueprint(personnel_bp, url_prefix="/api")
    app.register_blueprint(operations_bp, url_prefix="/api")
    app.register_blueprint(command_bp, url_prefix="/api")

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(os.path.join(app.config["UPLOAD_FOLDER"], "documents"), exist_ok=True)
    os.makedirs(os.path.join(app.config["UPLOAD_FOLDER"], "evidence"), exist_ok=True)

    @app.after_request
    def security_headers(response):
        for header, value in app.config.get("SECURITY_HEADERS", {}).items():
            response.headers.setdefault(header, value)
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify(
            {
                "status": "ONLINE",
                "service": "Lionel Security Operations API",
                "database": "SQLite WAL",
            }
        ), 200

    @app.route("/", methods=["GET"])
    def root():
        return jsonify(
            {
                "status": "ONLINE",
                "service": "Lionel Security Operations API",
                "dashboard": "http://localhost:3015",
            }
        ), 200

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"error": "Upload exceeds the 10 MB limit."}), 413

    @app.errorhandler(429)
    def rate_limited(_):
        return jsonify({"error": "Too many attempts. Try again shortly."}), 429

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(AuthError)
    def auth_error(exc):
        return jsonify({"error": exc.message}), exc.status

    # ------------------------------------------------------------------
    # Socket.IO: JWT handshake + role/zone room isolation
    # ------------------------------------------------------------------
    @socketio.on("connect")
    def handle_connect(auth=None):
        token = None
        if isinstance(auth, dict):
            token = auth.get("token")
        token = token or request.args.get("token")
        try:
            payload = decode_token(token, "access")
        except AuthError as exc:
            app.logger.warning("Rejected socket connection: %s", exc.message)
            return False

        user = db.session.get(User, payload["sub"])
        if not user or not user.is_active:
            return False

        join_room(f"user_{user.id}")
        zone_ids = scoped_zone_ids(user)
        for zone_id in zone_ids or []:
            join_room(f"zone_{zone_id}")
        if user.role == "CEO":
            join_room("ceo_command")
        if user.role == "OPS_MANAGER":
            join_room("ops_command")

        emit(
            "GATEWAY_READY",
            {
                "status": "CONNECTED",
                "role": user.role,
                "zones": list(zone_ids or []),
                "protocol": "Lionel Ops 3.0",
            },
        )

    @socketio.on("disconnect")
    def handle_disconnect():
        app.logger.info("Socket client disconnected")

    with app.app_context():
        db.create_all()
        _add_missing_zone_columns()

    return app, socketio


if __name__ == "__main__":
    application, socketio_server = create_app()
    print("=" * 68)
    print(" LIONEL SECURITY — CENTRAL OPERATIONS CONTROL API")
    print(" Listening on http://0.0.0.0:5015")
    print("=" * 68)
    socketio_server.run(
        application,
        host="0.0.0.0",
        port=5015,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
