import hmac
import hashlib
import math

from datetime import datetime, timedelta, timezone


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points, in metres."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius * c


def point_in_polygon(lat: float, lng: float, points) -> bool:
    """Ray-casting test. ``points`` is a list of {lat, lng} dictionaries."""
    if not points or len(points) < 3:
        return False
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi = float(points[i].get("lng", points[i].get("lon", 0)))
        yi = float(points[i].get("lat", 0))
        xj = float(points[j].get("lng", points[j].get("lon", 0)))
        yj = float(points[j].get("lat", 0))
        intersects = (yi > lat) != (yj > lat) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def geofence_check(post, latitude, longitude):
    """Return (inside: bool, distance_m: float) for a Post-like object."""
    distance = haversine_distance_meters(
        float(latitude), float(longitude), float(post.lat), float(post.lng)
    )
    if post.geofence_type == "POLYGON" and len(post.geofence_points) >= 3:
        return point_in_polygon(float(latitude), float(longitude), post.geofence_points), distance
    return distance <= float(post.radius_meters), distance


def daily_qr_token(secret: str, day: datetime = None) -> str:
    """Rotating, date-bound QR token for printing on a location board."""
    day = day or datetime.now(timezone.utc)
    digest = hmac.new(
        secret.encode("utf-8"), day.date().isoformat().encode("utf-8"), hashlib.sha256
    ).hexdigest()[:16]
    return f"LS-{day.date().isoformat()}-{digest}"


def qr_token_valid(secret: str, supplied: str, day: datetime = None) -> bool:
    if not supplied:
        return False
    reference = day or datetime.now(timezone.utc)
    candidates = {
        daily_qr_token(secret, reference),
        # previous day is tolerated for night shifts crossing midnight
        daily_qr_token(secret, reference - timedelta(days=1)),
    }
    return any(hmac.compare_digest(str(supplied), candidate) for candidate in candidates)
