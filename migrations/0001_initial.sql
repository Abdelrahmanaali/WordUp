CREATE TABLE IF NOT EXISTS games (
 id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, mode TEXT NOT NULL, word TEXT,
 timer_seconds INTEGER NOT NULL, player_one_name TEXT, player_two_name TEXT, winner_name TEXT,
 result TEXT NOT NULL, player_one_guesses INTEGER DEFAULT 0, player_two_guesses INTEGER DEFAULT 0,
 player_one_hints INTEGER DEFAULT 0, player_two_hints INTEGER DEFAULT 0, duration_seconds INTEGER,
 started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
CREATE TABLE IF NOT EXISTS player_stats (
 player_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, games_played INTEGER DEFAULT 0,
 wins INTEGER DEFAULT 0, draws INTEGER DEFAULT 0, hints_used INTEGER DEFAULT 0,
 guesses INTEGER DEFAULT 0, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_words (
 play_date TEXT PRIMARY KEY, word TEXT NOT NULL, hints_json TEXT NOT NULL, created_at TEXT NOT NULL
);
