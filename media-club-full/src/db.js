const path = require('path');
const fs = require('fs');
const config = require('./config');

const isPostgres = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

let db = {};

if (isPostgres) {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[db:pg] Unexpected error on idle client', err);
  });

  function toPgSql(sql) {
    let index = 1;
    let s = sql.replace(/\?/g, () => `$${index++}`);
    s = s.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/gi, 'NOW()');
    s = s.replace(/INSERT OR IGNORE/gi, 'INSERT'); // Handled with ON CONFLICT
    return s;
  }

  db.isPostgres = true;
  db.pool = pool;

  db.get = async (sql, params = []) => {
    const arr = Array.isArray(params) ? params : [params];
    const res = await pool.query(toPgSql(sql), arr);
    return res.rows[0] || null;
  };

  db.all = async (sql, params = []) => {
    const arr = Array.isArray(params) ? params : [params];
    const res = await pool.query(toPgSql(sql), arr);
    return res.rows;
  };

  db.run = async (sql, params = []) => {
    const arr = Array.isArray(params) ? params : [params];
    const res = await pool.query(toPgSql(sql), arr);
    return {
      changes: res.rowCount || 0,
      lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : null,
    };
  };

  db.exec = async (sql) => {
    return pool.query(sql);
  };

  // Helper for compatibility
  db.prepare = (sql) => ({
    get: (...params) => db.get(sql, params),
    all: (...params) => db.all(sql, params),
    run: (...params) => db.run(sql, params),
  });

  // Initialize tables on Postgres if they don't exist
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','oc','admin')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          data TEXT NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS gallery_items (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('photo','video')),
          src TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'Other',
          meta TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
          featured INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL DEFAULT 0,
          uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          blurb TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          tag TEXT NOT NULL DEFAULT 'Open to all',
          start_at TEXT NOT NULL,
          end_at TEXT,
          highlights TEXT NOT NULL DEFAULT '[]',
          photos TEXT NOT NULL DEFAULT '[]',
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          author_name TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS applications (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL, email TEXT NOT NULL, interest TEXT, link TEXT, message TEXT,
          status TEXT NOT NULL DEFAULT 'new',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS follows (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, member_id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          link TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          read INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS photo_social (
          pid TEXT PRIMARY KEY,
          likes TEXT NOT NULL DEFAULT '[]',
          comments TEXT NOT NULL DEFAULT '[]',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS password_resets (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
          handled INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      console.log('[db] Connected to Supabase PostgreSQL');
    } catch (err) {
      console.warn('[db:pg] Table initialization notice:', err.message);
    }
  })();

} else {
  // SQLite Mode (for local development & offline fallback)
  const Database = require('better-sqlite3');
  if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  const sqliteDb = new Database(config.dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','oc','admin')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS gallery_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('photo','video')),
      src TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      meta TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      featured INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gallery_user ON gallery_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_gallery_status ON gallery_items(status);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      blurb TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT 'Open to all',
      start_at TEXT NOT NULL,
      end_at TEXT,
      highlights TEXT NOT NULL DEFAULT '[]',
      photos TEXT NOT NULL DEFAULT '[]',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT NOT NULL, interest TEXT, link TEXT, message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS follows (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (user_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
    CREATE TABLE IF NOT EXISTS photo_social (
      pid TEXT PRIMARY KEY,
      likes TEXT NOT NULL DEFAULT '[]',
      comments TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
      handled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  try {
    const cols = sqliteDb.prepare('PRAGMA table_info(users)').all();
    if (!cols.some(c => c.name === 'status')) {
      sqliteDb.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','rejected'))`);
    }
    sqliteDb.prepare(`UPDATE users SET status='active' WHERE status IS NULL OR status=''`).run();
    const ecol = sqliteDb.prepare('PRAGMA table_info(events)').all();
    if (!ecol.some(c => c.name === 'photos')) {
      sqliteDb.exec(`ALTER TABLE events ADD COLUMN photos TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch (e) {
    console.warn('[db] status migration skipped:', e.message);
  }

  // Seed events on first SQLite run
  try {
    const n = sqliteDb.prepare('SELECT COUNT(*) c FROM events').get().c;
    if (n === 0) {
      const seedEvents = [
        { id: 'orientation-meet', title: 'Orientation Meet', blurb: 'First meet of the year — intros, portfolio swap, and a walk through the studio.', description: "The year kicked off with an open house at the studio: new members met the leads, ran through the darkroom and edit bays, and paired up for the term's first assignment.", tag: 'Open to all', start: '2026-08-30T10:00:00', end: '2026-08-30T13:00:00', highlights: ['120+ members and prospects attended', 'New darkroom rota published', "Term's first assignment briefed"] },
        { id: 'founders-week-livestream', title: "Founders' Week Livestream", blurb: 'Live coverage from the main quad — streaming all week as it happens.', description: "Round-the-clock coverage of Founders' Week from the main quad — interviews, behind-the-scenes cuts, and a live edit bay so you can watch the team work in real time.", tag: 'Streaming', start: '2026-09-22T00:00:00', end: '2026-10-03T23:59:59', highlights: ['Live edit bay open to viewers', 'New cut published daily', 'Highlights reel drops end of week'] },
        { id: 'street-photography-walk', title: 'Street Photography Walk', blurb: 'Meet at the fountain, 7am — golden hour shoot through the old quarter.', description: 'A golden-hour walk through the old quarter, shooting street and architecture. Bring any camera — phones welcome. Ends with coffee and a quick group edit.', tag: 'Open to all', start: '2026-10-04T07:00:00', end: '2026-10-04T10:00:00', highlights: ['Meet at the fountain, 7am sharp', 'Route: old quarter → riverside', 'Group edit session after'] },
        { id: 'editing-workshop-colour-to-mono', title: 'Editing Workshop: Colour to Mono', blurb: 'Hands-on session on converting and grading black-and-white work.', description: 'A hands-on workshop on converting and grading black-and-white work — channel mixing, split toning, and building a personal mono preset from scratch.', tag: 'Members', start: '2026-10-11T15:00:00', end: '2026-10-11T17:00:00', highlights: ['Bring a laptop with your editor of choice', 'Sample RAW files provided', 'Preset pack shared after'] },
        { id: 'screening-night-member-shorts', title: 'Screening Night: Member Shorts', blurb: "Six short films from this year's film team, open floor for feedback.", description: "Six short films from this year's film team, screened back to back, with an open floor for feedback afterward.", tag: 'Open to all', start: '2026-10-22T18:30:00', end: '2026-10-22T21:00:00', highlights: ['Six premieres from the film team', 'Q&A with directors after', 'Snacks provided'] },
        { id: 'zine-launch-between-classes', title: 'Zine Launch: Between Classes', blurb: "Print launch and signing for the design team's new zine.", description: "Print launch and signing for the design team's new zine, Between Classes — copies on sale, with a small print show of the featured work.", tag: 'Open to all', start: '2026-11-02T17:00:00', end: '2026-11-02T20:00:00', highlights: ['Limited first print run', 'Signing with contributing photographers', 'Small print show on the night'] },
      ];
      const ins = sqliteDb.prepare(`INSERT OR IGNORE INTO events(id,title,blurb,description,tag,start_at,end_at,highlights,photos) VALUES(?,?,?,?,?,?,?,?,?)`);
      const tx = sqliteDb.transaction(() => {
        for (const e of seedEvents) ins.run(e.id, e.title, e.blurb, e.description, e.tag, e.start, e.end, JSON.stringify(e.highlights), '[]');
      });
      tx();
    }
  } catch (e) {
    console.warn('[db] event seed skipped:', e.message);
  }

  db.isPostgres = false;
  db.sqlite = sqliteDb;

  db.get = async (sql, params = []) => {
    const stmt = sqliteDb.prepare(sql);
    const arr = Array.isArray(params) ? params : [params];
    return stmt.get(...arr) || null;
  };

  db.all = async (sql, params = []) => {
    const stmt = sqliteDb.prepare(sql);
    const arr = Array.isArray(params) ? params : [params];
    return stmt.all(...arr);
  };

  db.run = async (sql, params = []) => {
    const stmt = sqliteDb.prepare(sql);
    const arr = Array.isArray(params) ? params : [params];
    const info = stmt.run(...arr);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  };

  db.exec = async (sql) => {
    return sqliteDb.exec(sql);
  };

  // Direct access to prepare for SQLite synchronous statements
  db.prepare = (sql) => sqliteDb.prepare(sql);
  db.transaction = (fn) => sqliteDb.transaction(fn);
}

module.exports = db;
