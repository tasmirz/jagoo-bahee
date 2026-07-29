"""SQLite-backed store-and-forward queue. Frames survive relay process restarts."""

from __future__ import annotations

from pathlib import Path
import sqlite3
import threading
import time


class RelayStore:
    def __init__(self, path: str | Path) -> None:
        self._connection = sqlite3.connect(str(path), check_same_thread=False)
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS outbound (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              destination TEXT NOT NULL,
              frame BLOB NOT NULL,
              queued_at_ms INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        self._connection.commit()
        self._lock = threading.Lock()

    def enqueue(self, destination: str, frames: list[bytes]) -> None:
        with self._lock:
            self._connection.executemany(
                "INSERT INTO outbound(destination, frame, queued_at_ms) VALUES (?, ?, ?)",
                [(destination, frame, int(time.time() * 1000)) for frame in frames],
            )
            self._connection.commit()

    def due(self, limit: int = 256) -> list[tuple[int, str, bytes]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT id, destination, frame FROM outbound ORDER BY id LIMIT ?",
                (limit,),
            ).fetchall()
        return [(int(row[0]), str(row[1]), bytes(row[2])) for row in rows]

    def succeed(self, identifier: int) -> None:
        with self._lock:
            self._connection.execute("DELETE FROM outbound WHERE id = ?", (identifier,))
            self._connection.commit()

    def fail(self, identifier: int) -> None:
        with self._lock:
            self._connection.execute(
                "UPDATE outbound SET attempts = attempts + 1 WHERE id = ?",
                (identifier,),
            )
            self._connection.commit()

    def depth(self) -> int:
        with self._lock:
            return int(self._connection.execute("SELECT COUNT(*) FROM outbound").fetchone()[0])

    def close(self) -> None:
        self._connection.close()
