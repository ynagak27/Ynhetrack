-- Ynhetrack initial schema.
-- Dates are local 'YYYY-MM-DD' strings in the phone's timezone at entry time;
-- `timezone` is the IANA name (e.g. Europe/London, Asia/Tokyo) stored per entry.

CREATE TABLE daily_log (
  date        TEXT PRIMARY KEY,
  weight_kg   REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 300),
  sleep_hours REAL CHECK (sleep_hours IS NULL OR sleep_hours BETWEEN 0 AND 24),
  note        TEXT CHECK (note IS NULL OR length(note) <= 200),
  drank       INTEGER CHECK (drank IS NULL OR drank IN (0, 1)),  -- NULL = not answered
  timezone    TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row per drink type per evening; date = the evening it happened.
CREATE TABLE drinks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('beer', 'wine', 'sake', 'spirits', 'other')),
  count    INTEGER NOT NULL CHECK (count BETWEEN 1 AND 50),
  timezone TEXT NOT NULL,
  UNIQUE (date, type)
);

CREATE TABLE exercise (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('strength_a', 'strength_b', 'walk', 'jog', 'bike', 'other')),
  minutes    INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  effort_1_5 INTEGER CHECK (effort_1_5 IS NULL OR effort_1_5 BETWEEN 1 AND 5),
  timezone   TEXT NOT NULL
);
CREATE INDEX idx_exercise_date ON exercise (date);

-- Written by the Sunday job (phase 3); created now so the data model is complete.
CREATE TABLE weekly_review (
  week_start TEXT PRIMARY KEY,               -- Monday of the reviewed week
  avg_weight REAL,
  delta_kg   REAL,
  sessions   INTEGER NOT NULL,
  drink_days INTEGER NOT NULL,
  summary    TEXT NOT NULL,
  next_steps TEXT NOT NULL,                  -- JSON array of 2-3 strings
  source     TEXT NOT NULL CHECK (source IN ('claude', 'rules')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Single-row settings: weekly exercise targets only. There is deliberately no drink target.
CREATE TABLE settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  target_lifts INTEGER NOT NULL DEFAULT 3,
  target_walks INTEGER NOT NULL DEFAULT 3,
  target_bike  INTEGER NOT NULL DEFAULT 2
);
INSERT INTO settings (id) VALUES (1);
