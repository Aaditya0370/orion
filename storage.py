"""Small offline SQLite store for settings, plane calibrations, and event logs."""
import json
import sqlite3
import time


class SettingsStore(object):
    def __init__(self, path="orion_fireguard.db"):
        self.path = path
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=2.0)
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self):
        with self._connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS calibrations (plane TEXT PRIMARY KEY, value TEXT NOT NULL, updated REAL NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created REAL NOT NULL, message TEXT NOT NULL)")

    def load_settings(self):
        with self._connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = 'config'").fetchone()
        if row is None:
            return {}
        value = json.loads(row[0])
        return value if isinstance(value, dict) else {}

    def save_settings(self, config):
        payload = json.dumps(config, sort_keys=True)
        with self._connect() as connection:
            connection.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('config', ?)", (payload,))

    def save_calibration(self, plane, calibration_data):
        payload = json.dumps(calibration_data, sort_keys=True)
        with self._connect() as connection:
            connection.execute("INSERT OR REPLACE INTO calibrations(plane, value, updated) VALUES(?, ?, ?)",
                               (str(plane), payload, time.time()))

    def load_calibrations(self):
        with self._connect() as connection:
            rows = connection.execute("SELECT plane, value FROM calibrations").fetchall()
        return dict((plane, json.loads(value)) for plane, value in rows)

    def log_event(self, message):
        with self._connect() as connection:
            connection.execute("INSERT INTO event_log(created, message) VALUES(?, ?)", (time.time(), str(message)))

    def load_events(self, limit=100):
        limit = max(1, min(1000, int(limit)))
        with self._connect() as connection:
            rows = connection.execute("SELECT message FROM event_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [row[0] for row in reversed(rows)]
