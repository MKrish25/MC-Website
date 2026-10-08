-- MEDIA CLUB — Supabase (PostgreSQL) Database Schema
-- Run this in the Supabase Dashboard -> SQL Editor

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (members, oc, admin)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'oc', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. Profiles Table (Crew profile details, bio, gear, socials)
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Gallery Items Table (Photos and videos with moderation)
CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  src TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  meta TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  featured INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_user ON gallery_items(user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_status ON gallery_items(status);
CREATE INDEX IF NOT EXISTS idx_gallery_uploaded_at ON gallery_items(uploaded_at DESC);

-- 4. Events Table
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

CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);

-- 5. Journal Posts Table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- 6. Recruitment Applications Table
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  interest TEXT,
  link TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Follows Table (member social subscriptions)
CREATE TABLE IF NOT EXISTS follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, member_id)
);

-- 8. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

-- 9. Photo Social Table (Likes, Comments & Replies)
CREATE TABLE IF NOT EXISTS photo_social (
  pid TEXT PRIMARY KEY,
  likes TEXT NOT NULL DEFAULT '[]',
  comments TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Site Settings Table (Page visibility toggles, features)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 11. Password Resets Table
CREATE TABLE IF NOT EXISTS password_resets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- 12. Contact Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default Seed Events (Only inserted if events table is empty)
INSERT INTO events (id, title, blurb, description, tag, start_at, end_at, highlights, photos)
VALUES
  ('orientation-meet', 'Orientation Meet', 'First meet of the year — intros, portfolio swap, and a walk through the studio.', 'The year kicked off with an open house at the studio: new members met the leads, ran through the darkroom and edit bays, and paired up for the term''s first assignment.', 'Open to all', '2026-08-30T10:00:00', '2026-08-30T13:00:00', '["120+ members and prospects attended", "New darkroom rota published", "Term''s first assignment briefed"]', '[]'),
  ('founders-week-livestream', 'Founders'' Week Livestream', 'Live coverage from the main quad — streaming all week as it happens.', 'Round-the-clock coverage of Founders'' Week from the main quad — interviews, behind-the-scenes cuts, and a live edit bay so you can watch the team work in real time.', 'Streaming', '2026-09-22T00:00:00', '2026-10-03T23:59:59', '["Live edit bay open to viewers", "New cut published daily", "Highlights reel drops end of week"]', '[]'),
  ('street-photography-walk', 'Street Photography Walk', 'Meet at the fountain, 7am — golden hour shoot through the old quarter.', 'A golden-hour walk through the old quarter, shooting street and architecture. Bring any camera — phones welcome. Ends with coffee and a quick group edit.', 'Open to all', '2026-10-04T07:00:00', '2026-10-04T10:00:00', '["Meet at the fountain, 7am sharp", "Route: old quarter → riverside", "Group edit session after"]', '[]'),
  ('editing-workshop-colour-to-mono', 'Editing Workshop: Colour to Mono', 'Hands-on session on converting and grading black-and-white work.', 'A hands-on workshop on converting and grading black-and-white work — channel mixing, split toning, and building a personal mono preset from scratch.', 'Members', '2026-10-11T15:00:00', '2026-10-11T17:00:00', '["Bring a laptop with your editor of choice", "Sample RAW files provided", "Preset pack shared after"]', '[]'),
  ('screening-night-member-shorts', 'Screening Night: Member Shorts', 'Six short films from this year''s film team, open floor for feedback.', 'Six short films from this year''s film team, screened back to back, with an open floor for feedback afterward.', 'Open to all', '2026-10-22T18:30:00', '2026-10-22T21:00:00', '["Six premieres from the film team", "Q&A with directors after", "Snacks provided"]', '[]'),
  ('zine-launch-between-classes', 'Zine Launch: Between Classes', 'Print launch and signing for the design team''s new zine.', 'Print launch and signing for the design team''s new zine, Between Classes — copies on sale, with a small print show of the featured work.', 'Open to all', '2026-11-02T17:00:00', '2026-11-02T20:00:00', '["Limited first print run", "Signing with contributing photographers", "Small print show on the night"]', '[]')
ON CONFLICT (id) DO NOTHING;

