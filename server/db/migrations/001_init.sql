-- 001_init.sql — initial Declare schema
-- Matches docs/declare-plan.md §8.

-- ---------------------------------------------------------------------------
-- Admins (Vare OAuth identities)
-- ---------------------------------------------------------------------------
CREATE TABLE admins (
  id TEXT PRIMARY KEY,                 -- Vare ID
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('operator','moderator','global_admin','tsar')),
  role_badge TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  last_role_check_at TEXT
);

-- ---------------------------------------------------------------------------
-- Telegram users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT,
  language_code TEXT,
  registered_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);

CREATE INDEX idx_users_last_activity ON users(last_activity_at);
CREATE INDEX idx_users_username ON users(username COLLATE NOCASE);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('text','photo','video')),
  text TEXT,                           -- up to 4096 chars
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','in_review','accepted','rejected','archived')),
  moderation_note TEXT,
  moderated_by TEXT REFERENCES admins(id),
  moderated_at TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,     -- chatId:messageId — dedupe protection
  telegram_message_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_suggestions_created ON suggestions(created_at DESC);
CREATE INDEX idx_suggestions_user_created ON suggestions(user_id, created_at DESC);
CREATE INDEX idx_suggestions_tag_created ON suggestions(tag_id, created_at DESC);
CREATE INDEX idx_suggestions_status ON suggestions(status);

-- ---------------------------------------------------------------------------
-- Suggestion attachments (media)
-- ---------------------------------------------------------------------------
CREATE TABLE suggestion_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video')),
  telegram_file_id TEXT NOT NULL,
  telegram_file_unique_id TEXT,
  file_path TEXT,                      -- relative to data/media
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  duration_sec INTEGER,
  download_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (download_status IN ('pending','ready','failed')),
  download_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_attachments_suggestion ON suggestion_attachments(suggestion_id);

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  suggestion_id INTEGER REFERENCES suggestions(id) ON DELETE SET NULL,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed')),
  telegram_message_id INTEGER,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX idx_replies_user_created ON replies(user_id, created_at DESC);
CREATE INDEX idx_replies_suggestion ON replies(suggestion_id);

-- ---------------------------------------------------------------------------
-- Warnings
-- ---------------------------------------------------------------------------
CREATE TABLE warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES admins(id)
);

CREATE INDEX idx_warnings_user_created ON warnings(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Bans
-- ---------------------------------------------------------------------------
CREATE TABLE bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  reason TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,                        -- NULL = permanent
  lifted_at TEXT,
  lifted_by TEXT REFERENCES admins(id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_bans_user_starts ON bans(user_id, starts_at DESC);

-- ---------------------------------------------------------------------------
-- Admin audit log
-- ---------------------------------------------------------------------------
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL,                -- auth.login, suggestion.reply, user.ban, ...
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_action ON admin_audit_logs(action);

-- ---------------------------------------------------------------------------
-- Outbox (outgoing Telegram messages)
-- ---------------------------------------------------------------------------
CREATE TABLE outbox_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_id INTEGER REFERENCES replies(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                  -- reply, warning, ban, unban, system
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  telegram_message_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_outbox_status_next ON outbox_messages(status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Telegram update deduplication
-- ---------------------------------------------------------------------------
CREATE TABLE telegram_updates (
  update_id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','done','failed'))
);

-- ---------------------------------------------------------------------------
-- App settings (rate limits, managed from admin panel)
-- ---------------------------------------------------------------------------
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  suggestions_per_hour INTEGER NOT NULL DEFAULT 10,
  suggestions_per_day  INTEGER NOT NULL DEFAULT 30,
  min_interval_seconds INTEGER NOT NULL DEFAULT 5,
  duplicate_window_minutes INTEGER NOT NULL DEFAULT 10,
  bot_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bot_enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES admins(id)
);

-- ---------------------------------------------------------------------------
-- Bot heartbeat
-- ---------------------------------------------------------------------------
CREATE TABLE bot_heartbeat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at TEXT NOT NULL,
  version TEXT
);

-- ---------------------------------------------------------------------------
-- FTS5 full-text search over suggestion text
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE suggestions_fts USING fts5(
  text,
  content='suggestions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER suggestions_fts_ai AFTER INSERT ON suggestions BEGIN
  INSERT INTO suggestions_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER suggestions_fts_ad AFTER DELETE ON suggestions BEGIN
  INSERT INTO suggestions_fts(suggestions_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER suggestions_fts_au AFTER UPDATE ON suggestions BEGIN
  INSERT INTO suggestions_fts(suggestions_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
  INSERT INTO suggestions_fts(rowid, text) VALUES (new.id, new.text);
END;
