-- Schema for the daily song game (Cloudflare D1 / SQLite).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,           -- random UUID, also stored in the signed session cookie
  nickname     TEXT NOT NULL,              -- as displayed
  nickname_key TEXT NOT NULL UNIQUE,       -- normalized (no accents/spaces/punctuation) to keep it unique
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id     INTEGER PRIMARY KEY,
  titles TEXT NOT NULL,                    -- JSON array: accepted titles, first one is canonical
  artist TEXT NOT NULL,                    -- canonical name from public/assets/data/artists.json
  clue1  TEXT NOT NULL,
  clue2  TEXT NOT NULL,
  clue3  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule (
  play_date TEXT PRIMARY KEY,              -- YYYY-MM-DD, Argentina time (UTC-3)
  song_id   INTEGER NOT NULL REFERENCES songs(id)
);

-- One row per player per day. The primary key is what enforces "one game per day".
CREATE TABLE IF NOT EXISTS plays (
  player_id     TEXT NOT NULL REFERENCES players(id),
  play_date     TEXT NOT NULL,
  week_key      TEXT NOT NULL,             -- e.g. 2026-W44, used by the weekly ranking (Stage 3)
  attempt       INTEGER NOT NULL DEFAULT 1,
  title_ok      INTEGER NOT NULL DEFAULT 0,
  artist_ok     INTEGER NOT NULL DEFAULT 0,
  finished      INTEGER NOT NULL DEFAULT 0,
  won           INTEGER NOT NULL DEFAULT 0,
  score         INTEGER,
  last_feedback TEXT,
  finished_at   TEXT,
  PRIMARY KEY (player_id, play_date)
);

CREATE INDEX IF NOT EXISTS idx_plays_week ON plays (week_key, finished, score);
