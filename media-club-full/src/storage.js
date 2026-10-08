// File storage with two drivers:
//   - local: ./data/uploads served as /uploads/* (dev + tests)
//   - s3:    any S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3, …)
//            files go straight to the bucket, nothing stays on local disk.
// Switch with env: S3_BUCKET set  => s3 driver, otherwise local.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

let s3 = null;
function s3Client() {
  if (!config.s3Bucket) return null;
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    const opts = {
      region: config.s3Region,
      credentials: (config.s3Key && config.s3Secret)
        ? { accessKeyId: config.s3Key, secretAccessKey: config.s3Secret }
        : undefined,
      forcePathStyle: config.s3ForcePathStyle,
    };
    if (config.s3Endpoint) opts.endpoint = config.s3Endpoint;
    s3 = new S3Client(opts);
  }
  return s3;
}

const useS3 = () => !!config.s3Bucket;
const bucketBase = () => config.s3PublicUrl.replace(/\/$/, '');

// Store buffer, return its public URL.
async function put(buf, { ext, mime, prefix = 'media' }) {
  const name = crypto.randomBytes(12).toString('hex') + ext;
  if (useS3()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = `${prefix}/${name}`;
    await s3Client().send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: buf,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${bucketBase()}/${key}`;
  }
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, name), buf);
  return '/uploads/' + name;
}

// Delete a previously stored URL. Ignores anything we don't manage.
async function del(url) {
  if (!url) return;
  if (useS3() && typeof url === 'string' && url.startsWith(bucketBase() + '/')) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: url.slice(bucketBase().length + 1),
    }));
    return;
  }
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    await fs.promises.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => {});
  }
}

// True when src is an already-stored file reference (legacy /uploads/*,
// empty/cleared, or one of our bucket URLs) as opposed to a fresh data: URL.
function isStoredUrl(src) {
  if (typeof src !== 'string') return false;
  if (src === '' || src.startsWith('/uploads/')) return true;
  if (useS3() && src.startsWith(bucketBase() + '/')) return true;
  return false;
}

module.exports = { put, del, isStoredUrl, useS3 };
