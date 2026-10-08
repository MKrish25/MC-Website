// One-time move: uploads every file in UPLOAD_DIR to the configured S3 bucket
// and rewrites stored /uploads/* references to their new public URLs.
//
//   node scripts/migrate-uploads.js           # dry run, prints the plan
//   node scripts/migrate-uploads.js --apply  # uploads files + rewrites the DB
//
// Requires S3_BUCKET + S3_PUBLIC_URL in env. Safe to re-run: already-migrated
// references are skipped, and bucket keys reuse the local filenames.
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

async function main() {
  if (!config.s3Bucket || !config.s3PublicUrl) {
    console.error('Set S3_BUCKET and S3_PUBLIC_URL first (see .env.example).');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const db = require('../src/db');
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: config.s3Region,
    credentials: (config.s3Key && config.s3Secret)
      ? { accessKeyId: config.s3Key, secretAccessKey: config.s3Secret } : undefined,
    forcePathStyle: config.s3ForcePathStyle,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
  });
  const base = config.s3PublicUrl.replace(/\/$/, '');
  const files = fs.existsSync(config.uploadDir) ? fs.readdirSync(config.uploadDir) : [];
  console.log(`local files: ${files.length} | mode: ${apply ? 'APPLY' : 'dry-run'}`);
  const map = {};
  for (const f of files) {
    const buf = fs.readFileSync(path.join(config.uploadDir, f));
    const key = `media/${f}`;
    map['/uploads/' + f] = `${base}/${key}`;
    if (apply) {
      await s3.send(new PutObjectCommand({
        Bucket: config.s3Bucket, Key: key, Body: buf,
        ContentType: MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    }
  }
  const swap = s => map[s] || s;
  let gN = 0, eN = 0, pN = 0;
  const tx = db.transaction(() => {
    for (const g of db.prepare("SELECT id, src FROM gallery_items WHERE src LIKE '/uploads/%'").all()) {
      if (map[g.src]) { db.prepare('UPDATE gallery_items SET src=? WHERE id=?').run(map[g.src], g.id); gN++; }
    }
    for (const e of db.prepare('SELECT id, photos FROM events').all()) {
      let arr; try { arr = JSON.parse(e.photos || '[]'); } catch (_) { continue; }
      const next = arr.map(swap);
      if (JSON.stringify(next) !== JSON.stringify(arr)) { db.prepare('UPDATE events SET photos=? WHERE id=?').run(JSON.stringify(next), e.id); eN++; }
    }
    for (const p of db.prepare('SELECT user_id, data FROM profiles').all()) {
      let d; try { d = JSON.parse(p.data); } catch (_) { continue; }
      if (typeof d.photo === 'string' && map[d.photo]) {
        d.photo = map[d.photo];
        db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(d), p.user_id); pN++;
      }
    }
  });
  if (apply) tx();
  console.log(`gallery rows to update: ${gN} | events: ${eN} | profiles: ${pN}`);
  if (!apply) console.log('Dry run only — re-run with --apply to move files and rewrite the DB.');
}

main().catch(e => { console.error('migration failed:', e.message); process.exit(1); });
