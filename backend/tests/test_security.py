"""Security regression suite for the Lionel Security operations platform."""
import glob
import json
import os
import tempfile
import unittest
from datetime import date, datetime

from app import create_app
from database import db
from models import (
    AttendanceLog,
    GuardProfile,
    Post,
    Roster,
    User,
    Weapon,
    Zone,
)
from utils.geo import daily_qr_token

PASSWORD = "Lionel@Test2026"

PROTECTED_ENDPOINTS = [
    ("get", "/api/dashboard/overview"),
    ("get", "/api/locations"),
    ("get", "/api/zones"),
    ("get", "/api/zones"),
    ("get", "/api/locations/any/roster"),
    ("get", "/api/reports/sitrep"),
    ("get", "/api/guards"),
    ("get", "/api/guards/any"),
    ("get", "/api/weapons"),
    ("get", "/api/broadcasts"),
    ("get", "/api/incidents"),
    ("get", "/api/inspections"),
    ("get", "/api/documents"),
    ("get", "/api/leave"),
    ("get", "/api/audit-logs"),
    ("get", "/api/auth/me"),
    ("post", "/api/attendance/punch"),
    ("post", "/api/broadcasts"),
    ("post", "/api/incidents"),
    ("post", "/api/inspections"),
    ("post", "/api/weapons"),
    ("post", "/api/leave"),
    ("post", "/api/documents"),
    ("post", "/api/guards"),
]


class BaseCase(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "test.db")
        self.app, self.socketio = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{self.db_path}",
                "JWT_SECRET_KEY": "unit-test-jwt-secret-key-unit-test-jwt-secret-key",
                "SECRET_KEY": "unit-test-flask-secret-key-unit-test-flask-secret",
                "RATELIMIT_ENABLED": False,
                "ALLOWED_ORIGINS": ["http://localhost:3015"],
            }
        )
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        self.client = self.app.test_client()
        self._fixtures()

    def tearDown(self):
        db.session.remove()
        db.engine.dispose()
        self.ctx.pop()
        try:
            self.tmpdir.cleanup()
        except PermissionError:
            pass

    # -- fixtures -------------------------------------------------------
    def _fixtures(self):
        z1 = Zone(name="Zone Test 1", code="T1")
        z2 = Zone(name="Zone Test 2", code="T2")
        db.session.add_all([z1, z2])
        db.session.flush()

        def staff(full_name, role, phone, zone=None):
            user = User(full_name=full_name, phone_number=phone, role=role)
            user.set_password(PASSWORD)
            db.session.add(user)
            db.session.flush()
            if zone:
                user.zone_id = zone.id
                user.zones.append(zone)
            return user

        self.ceo = staff("Test CEO", "CEO", "+920000000001")
        self.ops = staff("Test Ops", "OPS_MANAGER", "+920000000002")
        self.admin = staff("Test Admin", "ADMIN", "+920000000003")
        self.supervisor = staff("Zone One Supervisor", "SUPERVISOR", "+920000000004", z1)
        db.session.add(z1)
        db.session.flush()

        self.p1 = Post(
            zone_id=z1.id,
            supervisor_id=self.supervisor.id,
            name="Post One",
            client_name="Client One",
            required_strength=2,
            lat=24.8600,
            lng=67.0000,
            geofence_type="CIRCLE",
            radius_meters=100.0,
            qr_code_secret="post-one-secret",
        )
        self.p2 = Post(
            zone_id=z2.id,
            name="Post Two",
            client_name="Client Two",
            required_strength=1,
            lat=24.9000,
            lng=67.1000,
            qr_code_secret="post-two-secret",
        )
        db.session.add_all([self.p1, self.p2])
        db.session.flush()

        def guard(full_name, phone, post, zone, with_password=True):
            user = User(
                full_name=full_name,
                phone_number=phone,
                cnic=f"42101-{phone[-7:]}-1",
                role="GUARD",
                zone_id=zone.id,
                assigned_post_id=post.id,
            )
            if with_password:
                user.set_password(PASSWORD)
            db.session.add(user)
            db.session.flush()
            db.session.add(
                GuardProfile(user_id=user.id, assigned_post_id=post.id, rank="SEP")
            )
            db.session.add(
                Roster(
                    post_id=post.id,
                    guard_id=user.id,
                    duty_date=date.today(),
                    duty_shift="DAY",
                    duty_timing="0700-1900",
                    supervisor_id=post.supervisor_id,
                )
            )
            return user

        self.g1 = guard("Guard One", "+920000000011", self.p1, z1)
        self.g2 = guard("Guard Two", "+920000000012", self.p2, z2)
        self.g_null = guard("No Password Guard", "+920000000013", self.p2, z2, False)

        self.w1 = Weapon(
            weapon_type="RIFLE",
            make_model="G3",
            serial_number="TEST-WPN-0001",
            ammunition_count=40,
            armoury_status="AVAILABLE",
            assigned_post_id=self.p1.id,
        )
        self.w2 = Weapon(
            weapon_type="PISTOL",
            make_model="Beretta",
            serial_number="TEST-WPN-0002",
            ammunition_count=15,
            armoury_status="AVAILABLE",
            assigned_post_id=self.p2.id,
        )
        db.session.add_all([self.w1, self.w2])
        db.session.commit()

    # -- helpers --------------------------------------------------------
    def login(self, identifier, password=PASSWORD):
        response = self.client.post(
            "/api/auth/login", json={"identifier": identifier, "password": password}
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def auth(self, identifier, password=PASSWORD):
        return {"Authorization": f"Bearer {self.login(identifier, password)['access_token']}"}


class AuthenticationTests(BaseCase):
    def test_protected_endpoints_reject_unauthenticated(self):
        for method, path in PROTECTED_ENDPOINTS:
            response = getattr(self.client, method)(path)
            self.assertEqual(
                response.status_code,
                401,
                f"{method.upper()} {path} returned {response.status_code}",
            )

    def test_socket_requires_valid_jwt(self):
        anonymous = self.socketio.test_client(self.app)
        self.assertFalse(anonymous.is_connected())

        forged = self.socketio.test_client(self.app, auth={"token": "not-a-jwt"})
        self.assertFalse(forged.is_connected())

        valid = self.socketio.test_client(
            self.app,
            auth={"token": self.login("+920000000001")["access_token"]},
        )
        self.assertTrue(valid.is_connected())

    def test_login_success_and_me(self):
        payload = self.login("+920000000001")
        self.assertEqual(payload["user"]["role"], "CEO")
        me = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {payload['access_token']}"},
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.get_json()["user"]["role"], "CEO")

    def test_null_password_hash_never_authenticates(self):
        response = self.client.post(
            "/api/auth/login",
            json={"identifier": "+920000000013", "password": ""},
        )
        self.assertIn(response.status_code, (400, 401))
        response = self.client.post(
            "/api/auth/login",
            json={"identifier": "+920000000013", "password": "anything"},
        )
        self.assertEqual(response.status_code, 401)

        user = db.session.get(User, self.g_null.id)
        self.assertIsNone(user.password_hash)
        self.assertFalse(user.check_password("anything"))
        self.assertFalse(user.check_password(""))

    def test_invalid_token_rejected(self):
        response = self.client.get(
            "/api/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}
        )
        self.assertEqual(response.status_code, 401)

    def test_logout_revokes_token(self):
        payload = self.login("+920000000004")
        headers = {"Authorization": f"Bearer {payload['access_token']}"}
        self.assertEqual(self.client.post("/api/auth/logout", headers=headers).status_code, 200)
        reused = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(reused.status_code, 401)


class RateLimitTests(unittest.TestCase):
    def test_brute_force_logins_are_rate_limited(self):
        tmpdir = tempfile.TemporaryDirectory()
        app, _ = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{os.path.join(tmpdir.name, 'rl.db')}",
                "JWT_SECRET_KEY": "rate-limit-secret-rate-limit-secret-12345678",
                "RATELIMIT_ENABLED": True,
                "RATELIMIT_STORAGE_URI": "memory://",
                "ALLOWED_ORIGINS": ["http://localhost:3015"],
            }
        )
        with app.app_context():
            db.create_all()
            user = User(full_name="Rate Target", phone_number="+920000009999", role="CEO")
            user.set_password(PASSWORD)
            db.session.add(user)
            db.session.commit()

            client = app.test_client()
            codes = []
            for _ in range(8):
                codes.append(
                    client.post(
                        "/api/auth/login",
                        json={"identifier": "+920000009999", "password": "wrong-pass-1"},
                    ).status_code
                )
            self.assertIn(429, codes, codes)
            db.session.remove()
            db.engine.dispose()
        try:
            tmpdir.cleanup()
        except PermissionError:
            pass


class ZoneIsolationTests(BaseCase):
    def test_supervisor_cannot_touch_other_zone(self):
        headers = self.auth("+920000000004")

        self.assertEqual(
            self.client.get(f"/api/locations/{self.p2.id}", headers=headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                f"/api/locations/{self.p2.id}/roster", headers=headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(f"/api/guards/{self.g2.id}", headers=headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.put(
                f"/api/guards/{self.g2.id}", json={"rank": "HC"}, headers=headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/weapons/{self.w2.id}/issue",
                json={"guard_id": self.g2.id},
                headers=headers,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/guards",
                json={
                    "full_name": "Intruder Guard",
                    "phone_number": "+920000000099",
                    "password": "Lionel@Test2026",
                    "zone_id": self.p2.zone_id,
                },
                headers=headers,
            ).status_code,
            403,
        )

        weapons = self.client.get("/api/weapons", headers=headers).get_json()["weapons"]
        self.assertEqual([w["serial_number"] for w in weapons], ["TEST-WPN-0001"])

    def test_supervisor_scope_limits_lists(self):
        headers = self.auth("+920000000004")
        locations = self.client.get("/api/locations", headers=headers).get_json()["locations"]
        self.assertEqual([loc["id"] for loc in locations], [self.p1.id])
        guards = self.client.get("/api/guards", headers=headers).get_json()["guards"]
        self.assertEqual([g["id"] for g in guards], [self.g1.id])
        overview = self.client.get("/api/dashboard/overview", headers=headers)
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.get_json()["kpis"]["total_locations"], 1)

    def test_guard_cannot_reach_command_surfaces(self):
        headers = self.auth("+920000000011")
        self.assertEqual(
            self.client.get("/api/dashboard/overview", headers=headers).status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/audit-logs", headers=headers).status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/guards", headers=headers).status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/dashboard/overview", headers=self.auth("+920000000004")).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/audit-logs", headers=self.auth("+920000000003")).status_code,
            200,
        )

    def test_cnic_masked_for_supervisor_full_for_admin(self):
        supervisor_view = self.client.get(
            f"/api/guards/{self.g1.id}", headers=self.auth("+920000000004")
        ).get_json()["guard"]
        admin_view = self.client.get(
            f"/api/guards/{self.g1.id}", headers=self.auth("+920000000003")
        ).get_json()["guard"]
        self.assertIn("*", supervisor_view["cnic"])
        self.assertNotIn("*", admin_view["cnic"] or "")


class AntiSpoofingTests(BaseCase):
    def _punch(self, headers, **overrides):
        payload = {
            "post_id": self.p1.id,
            "punch_type": "IN",
            "latitude": 24.8600,
            "longitude": 67.0000,
            "device_uuid": "TEST-DEVICE-001",
            "qr_token": daily_qr_token(self.p1.qr_code_secret),
            "verification_source": "APP_GPS_QR",
        }
        payload.update(overrides)
        return self.client.post("/api/attendance/punch", json=payload, headers=headers)

    def test_out_of_geofence_punch_is_flagged_not_accepted(self):
        headers = self.auth("+920000000011")
        response = self._punch(headers, latitude=24.9500, longitude=67.1200)
        self.assertEqual(response.status_code, 422, response.get_json())
        body = response.get_json()
        self.assertEqual(body["log"]["status"], "FLAGGED_ANOMALY")
        self.assertFalse(body["geofence"]["is_valid"])
        stored = db.session.get(AttendanceLog, body["log"]["id"])
        self.assertEqual(stored.status, "FLAGGED_ANOMALY")
        self.assertEqual(stored.verification_source, "APP_GPS_QR")

    def test_invalid_qr_is_rejected(self):
        headers = self.auth("+920000000011")
        response = self._punch(headers, qr_token="LS-FORGED-TOKEN")
        self.assertEqual(response.status_code, 422, response.get_json())
        self.assertIn("QR", " ".join(response.get_json()["reasons"]))

    def test_mock_gps_is_rejected(self):
        headers = self.auth("+920000000011")
        response = self._punch(headers, is_mock_location=True)
        self.assertEqual(response.status_code, 422)
        self.assertTrue(response.get_json()["log"]["is_mock_location"])

    def test_valid_gps_and_qr_is_accepted(self):
        headers = self.auth("+920000000011")
        response = self._punch(headers)
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertIn(response.get_json()["log"]["status"], ("PRESENT", "LATE"))
        self.assertTrue(response.get_json()["qr_valid"])

    def test_post_id_is_mandatory(self):
        headers = self.auth("+920000000011")
        payload = {
            "punch_type": "IN",
            "latitude": 24.86,
            "longitude": 67.0,
            "device_uuid": "TEST-DEVICE-001",
        }
        response = self.client.post(
            "/api/attendance/punch", json=payload, headers=headers
        )
        self.assertEqual(response.status_code, 400)


class IncidentAlertFanoutTests(BaseCase):
    """Field alerts fan out to command, the zone supervisor and guards within 10 km."""

    def setUp(self):
        super().setUp()
        self.z3 = Zone(name="Zone Test 3", code="T3")
        db.session.add(self.z3)
        db.session.flush()
        self.p3 = Post(
            zone_id=self.z3.id,
            name="Post Three",
            client_name="Client Three",
            required_strength=2,
            lat=30.0000,
            lng=70.0000,
            geofence_type="CIRCLE",
            radius_meters=100.0,
            qr_code_secret="post-three-secret",
        )
        self.p4 = Post(
            zone_id=self.z3.id,
            name="Post Three Distant",
            client_name="Client Three",
            required_strength=1,
            lat=30.5000,
            lng=70.5000,
            geofence_type="CIRCLE",
            radius_meters=100.0,
            qr_code_secret="post-four-secret",
        )
        db.session.add_all([self.p3, self.p4])
        db.session.flush()

        def zone_three_guard(full_name, phone, post=None):
            post = post or self.p3
            user = User(
                full_name=full_name,
                phone_number=phone,
                cnic=f"42101-{phone[-7:]}-1",
                role="GUARD",
                zone_id=self.z3.id,
                assigned_post_id=post.id,
            )
            user.set_password(PASSWORD)
            db.session.add(user)
            db.session.flush()
            db.session.add(
                GuardProfile(user_id=user.id, assigned_post_id=post.id, rank="SEP")
            )
            return user

        self.reporter3 = zone_three_guard("Zone Three Reporter", "+920000000021")
        self.near3 = zone_three_guard("Zone Three Neighbour", "+920000000022")
        self.far3 = zone_three_guard(
            "Zone Three Distant", "+920000000024", post=self.p4
        )
        self.supervisor3 = User(
            full_name="Zone Three Supervisor",
            phone_number="+920000000023",
            role="SUPERVISOR",
            zone_id=self.z3.id,
        )
        self.supervisor3.set_password(PASSWORD)
        db.session.add(self.supervisor3)
        db.session.flush()
        self.supervisor3.zones.append(self.z3)
        db.session.commit()

    def _socket(self, identifier):
        client = self.socketio.test_client(
            self.app, auth={"token": self.login(identifier)["access_token"]}
        )
        self.assertTrue(client.is_connected())
        client.get_received()  # drain GATEWAY_READY
        return client

    def _events(self, socket):
        return [message["name"] for message in socket.get_received()]

    def _raise_alert(self):
        return self.client.post(
            "/api/incidents",
            json={
                "post_id": self.p3.id,
                "incident_type": "PANIC",
                "latitude": 30.0,
                "longitude": 70.0,
            },
            headers=self.auth("+920000000021"),
        )

    def test_alert_reaches_command_zone_supervisor_and_nearby_guards_only(self):
        ceo_socket = self._socket("+920000000001")
        ops_socket = self._socket("+920000000002")
        zone_supervisor_socket = self._socket("+920000000023")
        other_supervisor_socket = self._socket("+920000000004")
        nearby_socket = self._socket("+920000000022")
        same_zone_distant_socket = self._socket("+920000000024")
        other_zone_socket = self._socket("+920000000011")

        response = self._raise_alert()
        self.assertEqual(response.status_code, 201, response.get_json())
        body = response.get_json()
        self.assertEqual(body["alert"]["radius_km"], 10.0)
        self.assertEqual(body["alert"]["command_recipients"], 2)
        self.assertEqual(body["alert"]["supervisor_recipients"], 1)
        self.assertEqual(body["alert"]["nearby_guard_count"], 1)

        for socket in (ceo_socket, ops_socket, zone_supervisor_socket, nearby_socket):
            self.assertIn("INCIDENT_BROADCAST", self._events(socket))
        for socket in (other_supervisor_socket, same_zone_distant_socket, other_zone_socket):
            self.assertNotIn("INCIDENT_BROADCAST", self._events(socket))

    def test_reporter_not_re_notified_and_guard_inbox_is_proximity_scoped(self):
        reporter_socket = self._socket("+920000000021")
        response = self._raise_alert()
        self.assertEqual(response.status_code, 201, response.get_json())
        incident_id = response.get_json()["incident"]["id"]
        self.assertNotIn("INCIDENT_BROADCAST", self._events(reporter_socket))

        near_ids = {
            row["id"]
            for row in self.client.get(
                "/api/incidents", headers=self.auth("+920000000022")
            ).get_json()["incidents"]
        }
        self.assertIn(incident_id, near_ids)

        for identifier in ("+920000000024", "+920000000011"):
            far_ids = {
                row["id"]
                for row in self.client.get(
                    "/api/incidents", headers=self.auth(identifier)
                ).get_json()["incidents"]
            }
            self.assertNotIn(incident_id, far_ids)

        zone_supervisor_ids = {
            row["id"]
            for row in self.client.get(
                "/api/incidents", headers=self.auth("+920000000023")
            ).get_json()["incidents"]
        }
        self.assertIn(incident_id, zone_supervisor_ids)

        other_supervisor_ids = {
            row["id"]
            for row in self.client.get(
                "/api/incidents", headers=self.auth("+920000000004")
            ).get_json()["incidents"]
        }
        self.assertNotIn(incident_id, other_supervisor_ids)

        inbox = self.client.get(
            f"/api/alerts/user/{self.near3.id}", headers=self.auth("+920000000022")
        )
        self.assertEqual(inbox.status_code, 200)
        self.assertIn(incident_id, [row["id"] for row in inbox.get_json()["incidents"]])
        self.assertEqual(
            self.client.get(
                f"/api/alerts/user/{self.near3.id}", headers=self.auth("+920000000011")
            ).status_code,
            403,
        )

    def test_mobile_sos_alias_uses_same_fanout(self):
        nearby_socket = self._socket("+920000000022")
        response = self.client.post(
            "/api/alerts/trigger",
            json={
                "incident_type": "MEDICAL",
                "notes": "Guard collapsed at gate",
                "latitude": 30.0,
                "longitude": 70.0,
            },
            headers=self.auth("+920000000021"),
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        incident = response.get_json()["incident"]
        self.assertEqual(incident["incident_type"], "MEDICAL_EMERGENCY")
        self.assertEqual(incident["reported_by_id"], self.reporter3.id)
        self.assertEqual(response.get_json()["alert"]["nearby_guard_count"], 1)
        self.assertIn("INCIDENT_BROADCAST", self._events(nearby_socket))

        invalid = self.client.post(
            "/api/alerts/trigger",
            json={"incident_type": "NOT_A_TYPE"},
            headers=self.auth("+920000000021"),
        )
        self.assertEqual(invalid.status_code, 400)

        complaint = self.client.post(
            "/api/alerts/trigger",
            json={"incident_type": "CLIENT_COMPLAINT"},
            headers=self.auth("+920000000021"),
        )
        self.assertEqual(complaint.status_code, 403)


class NoFinancialScopeTests(BaseCase):
    FORBIDDEN = (
        "salary",
        "payroll",
        "wage",
        "billing",
        "invoice",
        "deduction",
        "profit",
        "reimbursement",
        "gratuity",
    )

    def test_schema_has_no_financial_fields(self):
        for table in db.metadata.tables.values():
            for column in table.columns:
                name = column.name.lower()
                self.assertFalse(
                    any(word in name for word in self.FORBIDDEN),
                    f"Financial column found: {table.name}.{column.name}",
                )

    def test_api_payloads_have_no_financial_fields(self):
        for identifier in ("+920000000001", "+920000000004"):
            headers = self.auth(identifier)
            for path in (
                "/api/dashboard/overview",
                "/api/guards",
                "/api/weapons",
                "/api/reports/sitrep",
            ):
                text = self.client.get(path, headers=headers).get_data(as_text=True).lower()
                for word in self.FORBIDDEN:
                    self.assertNotIn(word, text, f"{word!r} leaked in {path}")

    def test_frontend_has_no_financial_views(self):
        src_root = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "admin-dashboard",
            "src",
        )
        if not os.path.isdir(src_root):
            self.skipTest("admin-dashboard/src not present")
        violations = []
        for path in glob.glob(os.path.join(src_root, "**", "*.*"), recursive=True):
            if not path.endswith((".js", ".jsx", ".ts", ".tsx", ".css", ".html")):
                continue
            with open(path, encoding="utf-8", errors="ignore") as handle:
                text = handle.read().lower()
            for word in self.FORBIDDEN:
                if word in text:
                    violations.append(f"{os.path.basename(path)}:{word}")
        self.assertEqual(violations, [], violations)


if __name__ == "__main__":
    unittest.main()
