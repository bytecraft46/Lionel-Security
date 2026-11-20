"""Idempotent seed for Lionel Security (Pvt) Ltd — Karachi operations.

Run from the backend directory:  python seed_lionel.py
"""
import os
from datetime import date, datetime, time, timedelta

import bcrypt

from app import create_app
from database import db
from models import (
    AttendanceLog,
    BroadcastAck,
    CommandBroadcast,
    GuardProfile,
    Incident,
    LeaveRequest,
    Post,
    Roster,
    SiteInspection,
    User,
    Weapon,
    WeaponLog,
    Zone,
    dumps,
)

ZONES = [
    {
        "key": "zone1",
        "name": "Zone 1",
        "areas": ["Central", "Korangi"],
        "code": "Z1",
        "supervisor": "Supervisor 1",
        "posts": [
            ("Ameer Khusro Rd / CPLC", "CPLC Karachi", 13, 24.8740, 67.0400),
            ("King Apparel Korangi", "King Apparel", 12, 24.8300, 67.1900),
            ("Al-Baraka", "Al-Baraka Enterprises", 6, 24.8605, 67.0105),
            ("Zama Foundation", "Zama Foundation", 2, 24.8700, 67.0300),
            ("DHA Phase 4 / 6", "DHA Residents Association", 5, 24.8000, 67.0600),
            ("Hafiz Flour Mills", "Hafiz Flour Mills", 4, 24.8500, 66.9900),
            ("Bhains Colony", "Bhains Colony Industrial", 4, 24.8400, 67.2200),
            ("PMTF / Gharo", "PMTF Gharo", 6, 24.7800, 67.3000),
        ],
    },
    {
        "key": "zone2",
        "name": "Zone 2",
        "areas": ["North Karachi", "Surjani"],
        "code": "Z2",
        "supervisor": "Supervisor 2",
        "posts": [
            ("Memon Nagar Society / Sch-33", "Memon Nagar Society", 14, 24.9400, 67.0300),
            ("Gulshan-e-Maymar", "Maymar Housing", 5, 24.9800, 67.1000),
            ("10 Highway", "Highway Commercial", 4, 24.9200, 67.1500),
            ("4K Chowrangi", "4K Business Centre", 4, 24.9600, 67.0700),
        ],
    },
    {
        "key": "zone3",
        "name": "Zone 3",
        "areas": ["South", "SITE"],
        "code": "Z3",
        "supervisor": "Supervisor 3",
        "posts": [
            ("DHA Phase-1", "DHA Phase 1 Residents", 84, 24.8100, 67.0500),
            ("Bilawal Chowrangi", "Clifton Commercial", 6, 24.8100, 67.0300),
            ("Glamour / Clifton Bridge", "Glamour Textiles", 5, 24.8130, 67.0320),
            ("Sher Shah", "Sher Shah Industrial", 6, 24.8800, 66.9900),
            ("SITE Area", "SITE Industrial Estate", 8, 24.8900, 66.9800),
        ],
    },
]

FIRST_NAMES = [
    "Abdul", "Muhammad", "Imran", "Kashif", "Gulzar", "Rashid", "Salman", "Naveed",
    "Adnan", "Farhan", "Tariq", "Yasir", "Kamran", "Shahid", "Waseem", "Noman",
    "Junaid", "Bilal", "Asif", "Faisal", "Hamza", "Umar", "Zafar", "Arif",
]
LAST_NAMES = [
    "Razzaq", "Ali", "Ahmed", "Qureshi", "Khan", "Hussain", "Siddiqui", "Malik",
    "Sheikh", "Abbasi", "Baloch", "Farooqi", "Mirza", "Raza", "Butt", "Arain",
]


def seed():
    app, _ = create_app()
    with app.app_context():
        existing = User.query.filter_by(email="ceo@lionel.pk").first()
        if existing:
            print("[seed] Lionel dataset already present — nothing to do.")
            return

        demo_hash = bcrypt.hashpw(
            (os.getenv("SEED_GUARD_PASSWORD") or "Lionel@Guard2026").encode()[:72],
            bcrypt.gensalt(rounds=10),
        ).decode()

        ceo = User(
            employee_id="LS-CEO-001",
            full_name="Chief Executive Officer",
            email="ceo@lionel.pk",
            phone_number="+923000000001",
            role="CEO",
        )
        ops = User(
            employee_id="LS-OPS-001",
            full_name="Operations Manager",
            email="ops@lionel.pk",
            phone_number="+923000000002",
            role="OPS_MANAGER",
        )
        for user, env_key, fallback in (
            (ceo, "SEED_CEO_PASSWORD", "Lionel@Ceo2026"),
            (ops, "SEED_OPS_PASSWORD", "Lionel@Ops2026"),
        ):
            user.password_hash = bcrypt.hashpw(
                (os.getenv(env_key) or fallback).encode()[:72], bcrypt.gensalt(rounds=10)
            ).decode()
        db.session.add_all([ceo, ops])
        db.session.flush()

        zone_objs = {}
        supervisor_objs = {}
        posts = []
        for index, zone_data in enumerate(ZONES, start=1):
            supervisor = User(
                employee_id=f"LS-SUP-00{index}",
                full_name=zone_data["supervisor"],
                email=f"supervisor{index}@lionel.pk",
                phone_number=f"+92300000010{index}",
                role="SUPERVISOR",
            )
            supervisor.password_hash = bcrypt.hashpw(
                (os.getenv("SEED_SUPERVISOR_PASSWORD") or "Lionel@Sup2026").encode()[:72],
                bcrypt.gensalt(rounds=10),
            ).decode()
            db.session.add(supervisor)
            db.session.flush()

            zone = Zone(
                name=zone_data["name"],
                code=zone_data["code"],
                areas=dumps(zone_data["areas"]),
                description=", ".join(zone_data["areas"]),
                supervisor_id=supervisor.id,
            )
            db.session.add(zone)
            db.session.flush()
            supervisor.zone_id = zone.id
            supervisor.zones.append(zone)
            zone_objs[zone_data["key"]] = zone
            supervisor_objs[zone_data["key"]] = supervisor

            for name, client, required, lat, lng in zone_data["posts"]:
                posts.append(
                    Post(
                        zone_id=zone.id,
                        supervisor_id=supervisor.id,
                        name=name,
                        client_name=client,
                        required_strength=required,
                        lat=lat,
                        lng=lng,
                        geofence_type="CIRCLE",
                        radius_meters=120.0,
                        status="GREEN",
                        address=name + ", Karachi",
                    )
                )
        db.session.add_all(posts)
        db.session.flush()

        # Guards: fill the required strength at every location, plus a relief pool.
        guard_number = 0
        post_guards = {}
        for post in posts:
            post_guards[post.id] = []
            for _ in range(post.required_strength):
                guard_number += 1
                guard = User(
                    employee_id=f"LS-G-{guard_number:04d}",
                    full_name=f"{FIRST_NAMES[guard_number % len(FIRST_NAMES)]} "
                    f"{LAST_NAMES[(guard_number * 3) % len(LAST_NAMES)]}",
                    phone_number=f"+92301{guard_number:07d}",
                    cnic=f"42{guard_number % 5}01-{1000000 + guard_number}-{guard_number % 9}",
                    role="GUARD",
                    zone_id=post.zone_id,
                    assigned_post_id=post.id,
                )
                guard.password_hash = demo_hash
                db.session.add(guard)
                db.session.flush()
                db.session.add(
                    GuardProfile(
                        user_id=guard.id,
                        rank="SEP" if guard_number % 4 else "HC",
                        father_name="Muhammad " + LAST_NAMES[guard_number % len(LAST_NAMES)],
                        previous_service=("ARMY", "POLICE", "CIVILIAN")[guard_number % 3],
                        date_of_joining=date.today() - timedelta(days=200 + guard_number),
                        cnic_expiry_date=date.today()
                        + timedelta(days=15 if guard_number % 17 == 0 else 900),
                        training_expiry_date=date.today()
                        + timedelta(days=20 if guard_number % 23 == 0 else 500),
                        medical_fitness="FIT",
                        medical_expiry_date=date.today()
                        + timedelta(days=25 if guard_number % 29 == 0 else 400),
                        assigned_post_id=post.id,
                        employment_status="ACTIVE",
                    )
                )
                post_guards[post.id].append(guard)

        # Relief pool
        relief = []
        for extra in range(12):
            guard_number += 1
            guard = User(
                employee_id=f"LS-G-{guard_number:04d}",
                full_name=f"{FIRST_NAMES[guard_number % len(FIRST_NAMES)]} "
                f"{LAST_NAMES[(guard_number * 5) % len(LAST_NAMES)]}",
                phone_number=f"+92301{guard_number:07d}",
                role="GUARD",
                zone_id=posts[extra % len(posts)].zone_id,
            )
            guard.password_hash = demo_hash
            db.session.add(guard)
            db.session.flush()
            db.session.add(
                GuardProfile(
                    user_id=guard.id,
                    rank="SEP",
                    date_of_joining=date.today() - timedelta(days=90),
                    employment_status="ACTIVE",
                )
            )
            relief.append(guard)

        db.session.flush()

        # Today's roster: DAY / NIGHT split across every post.
        today = date.today()
        for post in posts:
            assigned = post_guards[post.id]
            for position, guard in enumerate(assigned):
                night = position % 2 == 1
                db.session.add(
                    Roster(
                        post_id=post.id,
                        guard_id=guard.id,
                        duty_date=today,
                        duty_shift="NIGHT" if night else "DAY",
                        duty_timing="1900-0700" if night else "0700-1900",
                        supervisor_id=post.supervisor_id,
                    )
                )

        # Live attendance for the day shift (about 70% of day guards).
        now = datetime.now()
        for post in posts:
            for position, guard in enumerate(post_guards[post.id]):
                if position % 2 == 1:
                    continue
                if position and position % 25 == 0:
                    continue
                verified = (position + 1) % 11 != 0
                db.session.add(
                    AttendanceLog(
                        guard_id=guard.id,
                        post_id=post.id,
                        punch_type="IN",
                        punch_timestamp=now.replace(hour=7, minute=5, second=0, microsecond=0),
                        latitude=post.lat,
                        longitude=post.lng,
                        distance_meters=8.0 + position,
                        is_geofence_valid=True,
                        is_mock_location=False,
                        qr_valid=True,
                        status="PRESENT" if verified else "FLAGGED_ANOMALY",
                        verification_source="APP_GPS_QR" if verified else "MANUAL_ENTRY",
                        notes=None if verified else "QR code mismatch",
                    )
                )

        # Approved leave / rest.
        for index, guard in enumerate(relief[:6]):
            db.session.add(
                LeaveRequest(
                    guard_id=guard.id,
                    leave_type="WEEKLY_REST" if index % 2 else "ANNUAL",
                    start_date=today,
                    end_date=today + timedelta(days=1),
                    expected_return_date=today + timedelta(days=2),
                    status="APPROVED",
                    approved_by=supervisor_objs["zone1"].id,
                    decided_at=datetime.utcnow(),
                )
            )

        # Armoury: one weapon per two posts, plus issued examples.
        weapon_number = 0
        for index, post in enumerate(posts):
            if index % 2:
                continue
            weapon_number += 1
            weapon = Weapon(
                weapon_type=("RIFLE", "SHOTGUN", "PISTOL")[weapon_number % 3],
                make_model=("G3", "Mossberg 500", "Beretta 92")[weapon_number % 3],
                serial_number=f"LS-WPN-{weapon_number:04d}",
                licence_number=f"LIC-2026-{weapon_number:04d}",
                licence_expiry_date=date.today()
                + timedelta(days=20 if weapon_number % 7 == 0 else 700),
                ammunition_count=40,
                assigned_post_id=post.id,
                condition="SERVICEABLE",
                armoury_status="AVAILABLE",
                last_inspection_date=today,
            )
            db.session.add(weapon)
            db.session.flush()
            if index % 4 == 0 and post_guards[post.id]:
                guard = post_guards[post.id][0]
                weapon.issued_to_guard_id = guard.id
                weapon.issued_at = datetime.utcnow()
                weapon.armoury_status = "ISSUED"
                db.session.add(
                    WeaponLog(
                        weapon_id=weapon.id,
                        action="ISSUE",
                        guard_id=guard.id,
                        post_id=post.id,
                        actor_id=post.supervisor_id,
                        notes="Seed issue",
                    )
                )

        # Command broadcasts
        critical = CommandBroadcast(
            title="Threat warning — heightened posture",
            message="All locations: maintain heightened vigilance and verify visitor logs hourly.",
            priority="CRITICAL",
            category="THREAT_WARNING",
            issued_by=ops.id,
            target_scope="ALL",
            target_zone_ids=dumps([]),
            target_post_ids=dumps([]),
        )
        routine = CommandBroadcast(
            title="Night shift reporting timing",
            message="Night shift guards must report 15 minutes before 1900 hours.",
            priority="NORMAL",
            category="POSTURE_CHANGE",
            issued_by=ops.id,
            target_scope="ZONES",
            target_zone_ids=dumps([zone_objs["zone3"].id]),
            target_post_ids=dumps([]),
        )
        db.session.add_all([critical, routine])
        db.session.flush()
        for supervisor in supervisor_objs.values():
            db.session.add(
                BroadcastAck(
                    broadcast_id=critical.id,
                    user_id=supervisor.id,
                    ack_status="NOT_RECEIVED",
                    compliance_status="PENDING",
                )
            )
        db.session.add(
            BroadcastAck(
                broadcast_id=routine.id,
                user_id=supervisor_objs["zone3"].id,
                ack_status="RECEIVED",
                acknowledged_at=datetime.utcnow(),
                compliance_status="ACTION_TAKEN",
                action_notes="Briefed all night shift guards.",
            )
        )

        # Incidents and inspections
        db.session.add(
            Incident(
                incident_type="CLIENT_COMPLAINT",
                post_id=posts[-1].id,
                zone_id=posts[-1].zone_id,
                reported_by_id=posts[-1].supervisor_id,
                immediate_action="Client complaint about gate logging; retraining scheduled.",
                status="ACKNOWLEDGED",
                occurred_at=datetime.utcnow() - timedelta(hours=4),
            )
        )
        db.session.add(
            Incident(
                incident_type="ATTEMPTED_INTRUSION",
                post_id=posts[0].id,
                zone_id=posts[0].zone_id,
                reported_by_id=posts[0].supervisor_id,
                immediate_action="Perimeter challenged, individuals dispersed.",
                status="RESOLVED",
                occurred_at=datetime.utcnow() - timedelta(hours=20),
                resolved_at=datetime.utcnow() - timedelta(hours=18),
            )
        )
        for post, score in ((posts[0], 5), (posts[3], 2), (posts[-2], 3)):
            db.session.add(
                SiteInspection(
                    post_id=post.id,
                    supervisor_id=post.supervisor_id,
                    inspection_type="SURPRISE" if score < 4 else "DAILY",
                    turnout_uniform_ok=score >= 3,
                    weapons_condition="SERVICEABLE",
                    attendance_verified=True,
                    security_preparedness="ADEQUATE" if score >= 3 else "NEEDS_IMPROVEMENT",
                    deficiencies=None if score >= 3 else "Guard turnout below standard",
                    corrective_action=None if score >= 3 else "Uniform re-issue and counselling",
                    score=score,
                )
            )

        db.session.commit()
        print("[seed] Zones:", Zone.query.count())
        print("[seed] Guards:", User.query.filter_by(role="GUARD").count())
        print("[seed] Posts:", Post.query.count())
        print("[seed] Weapons:", Weapon.query.count())
        print("[seed] Seeded Lionel Security dataset.")
        print(
            "[seed] Logins: ceo@lionel.pk / ops@lionel.pk / admin@lionel.pk / "
            "supervisor1@lionel.pk / guard phones"
        )


if __name__ == "__main__":
    seed()
