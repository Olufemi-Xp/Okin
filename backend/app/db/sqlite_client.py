import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.config import get_settings


_initialized_dbs = set()


def get_db_path(data_dir: Optional[str] = None) -> str:
    dir_path = data_dir or get_settings().DATA_DIR
    os.makedirs(dir_path, exist_ok=True)
    return os.path.join(dir_path, "suzzy_chats.db")


def init_db(data_dir: Optional[str] = None) -> None:
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path, timeout=10.0)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_threads_session
            ON threads(session_id, created_at DESC);
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                modality TEXT NOT NULL DEFAULT 'text',
                content TEXT NOT NULL,
                agent_used TEXT,
                audio_url TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
            );
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_thread
            ON messages(thread_id, created_at ASC);
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_session
            ON messages(session_id);
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS calendar_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT,
                location TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'scheduled',
                created_at TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_session_time
            ON calendar_events(session_id, start_time ASC);
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks_reminders (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                due_time TEXT,
                priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
                is_reminder INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_tasks_session
            ON tasks_reminders(session_id, completed ASC, created_at DESC);
            """
        )
        conn.commit()
        _initialized_dbs.add(db_path)
    finally:
        conn.close()


def get_connection(data_dir: Optional[str] = None) -> sqlite3.Connection:
    db_path = get_db_path(data_dir)
    if db_path not in _initialized_dbs:
        init_db(data_dir)
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def create_thread(session_id: str, title: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
    t_id = thread_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clean_title = (title.strip()[:60] or "New Chat")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO threads (id, session_id, title, created_at) VALUES (?, ?, ?, ?)",
            (t_id, session_id, clean_title, now),
        )
        conn.commit()
    return {"id": t_id, "session_id": session_id, "title": clean_title, "created_at": now}


def get_threads(session_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, session_id, title, created_at FROM threads WHERE session_id = ? ORDER BY created_at DESC",
            (session_id,),
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_thread(session_id: str, thread_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, session_id, title, created_at FROM threads WHERE session_id = ? AND id = ?",
            (session_id, thread_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_thread_title(session_id: str, thread_id: str, new_title: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE threads SET title = ? WHERE session_id = ? AND id = ?",
            (new_title[:60], session_id, thread_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_thread(session_id: str, thread_id: str) -> bool:
    with get_connection() as conn:
        # Delete messages first in case foreign_keys pragma is not active
        conn.execute("DELETE FROM messages WHERE thread_id = ? AND session_id = ?", (thread_id, session_id))
        cursor = conn.execute(
            "DELETE FROM threads WHERE session_id = ? AND id = ?",
            (session_id, thread_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def add_message(
    thread_id: str,
    session_id: str,
    role: str,
    content: str,
    modality: str = "text",
    agent_used: Optional[str] = None,
    audio_url: Optional[str] = None,
) -> Dict[str, Any]:
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, thread_id, session_id, role, modality, content, agent_used, audio_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, thread_id, session_id, role, modality, content, agent_used, audio_url, now),
        )
        conn.commit()
    return {
        "id": msg_id,
        "thread_id": thread_id,
        "session_id": session_id,
        "role": role,
        "modality": modality,
        "content": content,
        "agent_used": agent_used,
        "audio_url": audio_url,
        "created_at": now,
    }


def get_messages(session_id: str, thread_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, thread_id, session_id, role, modality, content, agent_used, audio_url, created_at
            FROM messages
            WHERE session_id = ? AND thread_id = ?
            ORDER BY created_at ASC
            """,
            (session_id, thread_id),
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def clear_session_threads(session_id: str) -> int:
    with get_connection() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        cursor = conn.execute("DELETE FROM threads WHERE session_id = ?", (session_id,))
        conn.commit()
        return cursor.rowcount


# ---------------------------------------------------------------------------
# Calendar Events & Reminders / To-Do CRUD Helpers
# ---------------------------------------------------------------------------

def create_calendar_event(
    session_id: str,
    title: str,
    start_time: str,
    end_time: Optional[str] = None,
    description: str = "",
    location: str = "",
) -> Dict[str, Any]:
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clean_title = title.strip()[:120] or "Untitled Event"
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO calendar_events (id, session_id, title, description, start_time, end_time, location, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
            """,
            (event_id, session_id, clean_title, description.strip(), start_time, end_time, location.strip(), now),
        )
        conn.commit()
    return {
        "id": event_id,
        "session_id": session_id,
        "title": clean_title,
        "description": description.strip(),
        "start_time": start_time,
        "end_time": end_time,
        "location": location.strip(),
        "status": "scheduled",
        "created_at": now,
    }


def get_calendar_events(session_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, session_id, title, description, start_time, end_time, location, status, created_at
            FROM calendar_events
            WHERE session_id = ? AND status != 'cancelled'
            ORDER BY start_time ASC
            """,
            (session_id,),
        )
        return [dict(row) for row in cursor.fetchall()]


def delete_calendar_event(session_id: str, event_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM calendar_events WHERE id = ? AND session_id = ?",
            (event_id, session_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def create_task_or_reminder(
    session_id: str,
    title: str,
    due_time: Optional[str] = None,
    priority: str = "medium",
    is_reminder: bool = False,
) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clean_title = title.strip()[:160] or "Untitled Task"
    clean_priority = priority.lower() if priority and priority.lower() in ("low", "medium", "high") else "medium"
    rem_flag = 1 if (is_reminder or due_time) else 0
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO tasks_reminders (id, session_id, title, due_time, priority, is_reminder, completed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (task_id, session_id, clean_title, due_time, clean_priority, rem_flag, now),
        )
        conn.commit()
    return {
        "id": task_id,
        "session_id": session_id,
        "title": clean_title,
        "due_time": due_time,
        "priority": clean_priority,
        "is_reminder": bool(rem_flag),
        "completed": False,
        "created_at": now,
    }


def get_tasks_and_reminders(session_id: str, include_completed: bool = True) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        query = """
            SELECT id, session_id, title, due_time, priority, is_reminder, completed, created_at
            FROM tasks_reminders
            WHERE session_id = ?
        """
        if not include_completed:
            query += " AND completed = 0"
        query += " ORDER BY completed ASC, due_time ASC, created_at DESC"
        cursor = conn.execute(query, (session_id,))
        rows = []
        for row in cursor.fetchall():
            d = dict(row)
            d["is_reminder"] = bool(d["is_reminder"])
            d["completed"] = bool(d["completed"])
            rows.append(d)
        return rows


def toggle_task_completion(session_id: str, task_id: str, completed: bool) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE tasks_reminders SET completed = ? WHERE id = ? AND session_id = ?",
            (1 if completed else 0, task_id, session_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_task(session_id: str, task_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM tasks_reminders WHERE id = ? AND session_id = ?",
            (task_id, session_id),
        )
        conn.commit()
        return cursor.rowcount > 0
