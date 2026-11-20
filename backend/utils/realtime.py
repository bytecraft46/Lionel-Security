"""Socket.IO helper for zone/role scoped emission."""
from flask import current_app


def emit_operational(event: str, payload: dict, zone_id=None, extra_rooms=None):
    """Emit only to command rooms and (optionally) the zone room.

    Never a global broadcast: sockets with no authorised room receive nothing.
    """
    socketio = current_app.extensions.get("socketio")
    if not socketio:
        return
    rooms = {"ceo_command", "ops_command"}
    if zone_id:
        rooms.add(f"zone_{zone_id}")
    for room in extra_rooms or []:
        if room:
            rooms.add(room)
    socketio.emit(event, payload, to=sorted(rooms))


def emit_to_room(room: str, event: str, payload: dict):
    socketio = current_app.extensions.get("socketio")
    if socketio and room:
        socketio.emit(event, payload, to=room)
