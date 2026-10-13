import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * File storage for notebook image attachments and avatars.
 *
 * Hardened after the readiness review:
 *  - IMAGES ONLY. Content type is verified by magic bytes, not the
 *    client-supplied name or MIME. This alone removes the stored-XSS vector
 *    (no more uploading `evil.html` / `evil.svg`).
 *  - Size-capped.
 *  - Local files are written to a PRIVATE directory (`RUNE_UPLOAD_DIR`, else
 *    `<RUNE_DATA_DIR>/uploads`, else `./data/uploads`), never `public/`, and are served only through the
 *    authenticated `/api/uploads/[file]` route with `Content-Disposition:
 *    inline` + `X-Content-Type-Options: nosniff`.
 *  - S3 driver unchanged in shape; the image-only rule protects it too.
 */

export interface StoredFile {
  url: string;
}

const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || 'auto';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_PUBLIC_URL_BASE = process.env.S3_PUBLIC_URL_BASE;

const useS3 = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
export const uploadDriver: 'local' | 's3' = useS3 ? 's3' : 'local';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

// Allowed image types, keyed by the extension we store them under.
const IMAGE_SIGNATURES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: 'png', mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.length > 6 && b.toString('ascii', 0, 6).match(/^GIF8[79]a$/) !== null },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

// Notebook entry attachments accept everything IMAGE_SIGNATURES does, plus
// PDF - still magic-byte verified, still never trusts the client-supplied
// name/MIME. Kept as a separate list (not a broader free-for-all) so the
// image-only figure-embed path is untouched.
const ATTACHMENT_SIGNATURES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  ...IMAGE_SIGNATURES,
  { ext: 'pdf', mime: 'application/pdf', test: (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];

export class UploadValidationError extends Error {}

export interface DetectedImage {
  ext: string;
  mime: string;
}

/** Verifies the buffer is an allowed image by magic bytes; throws otherwise. */
export function detectImage(buffer: Buffer): DetectedImage {
  if (buffer.length === 0) throw new UploadValidationError('Empty file.');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
  }
  const match = IMAGE_SIGNATURES.find((s) => s.test(buffer));
  if (!match) {
    throw new UploadValidationError('Only PNG, JPEG, GIF, or WebP images can be uploaded.');
  }
  return { ext: match.ext, mime: match.mime };
}

export function mimeForStoredName(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const found = ATTACHMENT_SIGNATURES.find((s) => s.ext === ext || (ext === 'jpeg' && s.ext === 'jpg'));
  return found ? found.mime : 'application/octet-stream';
}

/** RUNE_UPLOAD_DIR, else <RUNE_DATA_DIR>/uploads, else ./data/uploads. Following RUNE_DATA_DIR keeps uploads on the persistent volume in Docker. */
export function localUploadDir(): string {
  const dataDir = process.env.RUNE_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
  return process.env.RUNE_UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ dataDir, 'uploads');
}

function randomStoredName(ext: string, ownerId: string): string {
  // Owner id is folded into the name (hashed) so the serving route can do a
  // cheap owner check without a DB lookup, while the name stays unguessable.
  const ownerTag = crypto.createHash('sha256').update(ownerId).digest('hex').slice(0, 8);
  return `${ownerTag}_${crypto.randomBytes(12).toString('hex')}.${ext}`;
}

export function ownerTagFor(ownerId: string): string {
  return crypto.createHash('sha256').update(ownerId).digest('hex').slice(0, 8);
}

function publicUrlBase(): string {
  if (S3_PUBLIC_URL_BASE) return S3_PUBLIC_URL_BASE;
  if (S3_ENDPOINT) return `${S3_ENDPOINT.replace(/\/+$/, '')}/${S3_BUCKET}`;
  return `https://${S3_BUCKET}.s3.amazonaws.com`;
}

async function saveToS3(buffer: Buffer, filename: string, contentType: string): Promise<StoredFile> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: { accessKeyId: S3_ACCESS_KEY_ID!, secretAccessKey: S3_SECRET_ACCESS_KEY! }
  });
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: 'inline'
  }));
  const base = publicUrlBase().replace(/\/+$/, '');
  return { url: `${base}/${filename}` };
}

async function saveToLocalDisk(buffer: Buffer, filename: string): Promise<StoredFile> {
  const uploadDir = localUploadDir();
  fs.mkdirSync(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
  await fs.promises.writeFile(/*turbopackIgnore: true*/ path.join(uploadDir, filename), buffer);
  return { url: `/api/uploads/${filename}` };
}

/** Reads a stored local upload for the serving route. Guards against path traversal. */
export async function readLocalUpload(filename: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{8}_[a-f0-9]{24}\.(png|jpg|gif|webp|pdf)$/.test(filename)) return null;
  try {
    return await fs.promises.readFile(/*turbopackIgnore: true*/ path.join(localUploadDir(), filename));
  } catch {
    return null;
  }
}

/**
 * Validates and stores an uploaded image. `ownerId` scopes the stored name.
 * Throws `UploadValidationError` for anything that isn't an allowed image.
 */
export async function saveUploadedImage(buffer: Buffer, ownerId: string): Promise<StoredFile & { mime: string }> {
  const { ext, mime } = detectImage(buffer);
  const filename = randomStoredName(ext, ownerId);
  const stored = useS3 ? await saveToS3(buffer, filename, mime) : await saveToLocalDisk(buffer, filename);
  return { ...stored, mime };
}

/** Same validation approach as `saveUploadedImage`, but also accepts PDF - for notebook entry attachments (a downloadable file, not an inline figure). */
export async function saveUploadedFile(buffer: Buffer, ownerId: string): Promise<StoredFile & { mime: string }> {
  if (buffer.length === 0) throw new UploadValidationError('Empty file.');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
  }
  const match = ATTACHMENT_SIGNATURES.find((s) => s.test(buffer));
  if (!match) {
    throw new UploadValidationError('Only PNG, JPEG, GIF, WebP, or PDF files can be attached.');
  }
  const filename = randomStoredName(match.ext, ownerId);
  const stored = useS3 ? await saveToS3(buffer, filename, match.mime) : await saveToLocalDisk(buffer, filename);
  return { ...stored, mime: match.mime };
}
