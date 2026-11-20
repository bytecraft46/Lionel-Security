import sqlite3
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Configure SQLite for robust multi-client concurrent operations:
    - WAL mode allows concurrent readers during writes.
    - Foreign keys enforce relational constraints.
    - Busy timeout avoids lock failures under peak punch traffic.
    - Synchronous=NORMAL optimizes durability vs write throughput.
    """
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("PRAGMA busy_timeout = 5000;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.close()
