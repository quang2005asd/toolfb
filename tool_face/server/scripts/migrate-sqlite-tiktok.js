const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '../data/tool_face.sqlite');
console.log('Connecting to SQLite:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

const ddl = `
CREATE TABLE IF NOT EXISTS TikTokAccounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  username TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  session_id TEXT,
  cookies_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS IX_TikTokAccounts_username ON TikTokAccounts(username);
`;

db.exec(ddl, (err) => {
  if (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
  console.log('SUCCESS: Table TikTokAccounts and index created successfully!');

  // Check columns in Posts
  db.all("PRAGMA table_info(Posts);", (err, rows) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }
    const cols = rows.map(r => r.name);
    const alterQueries = [];
    if (!cols.includes('platform')) {
      alterQueries.push("ALTER TABLE Posts ADD COLUMN platform TEXT NOT NULL DEFAULT 'facebook';");
    }
    if (!cols.includes('tiktok_account_id')) {
      alterQueries.push("ALTER TABLE Posts ADD COLUMN tiktok_account_id TEXT;");
    }

    if (alterQueries.length > 0) {
      db.exec(alterQueries.join('\n'), (aErr) => {
        if (aErr) console.error('Error adding columns to Posts:', aErr);
        else console.log('SUCCESS: Added platform & tiktok_account_id columns to Posts!');
        db.close();
      });
    } else {
      console.log('Posts table already has needed columns.');
      db.close();
    }
  });
});
