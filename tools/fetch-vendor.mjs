// Downloads Athom's homey-api browser bundle into public/vendor/ at build time (never committed).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeDownloadError } from './vendor-messages.mjs';

const URL_ = 'https://cdn.athom.com/homey-api/3.21.3.js';
const SHA256 = '427a4867df0962f5e613c4fa58b80d357c44d141834f1303b94be8995c95cd84';
const SIZE = 553170;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor', 'homey-api.js');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (existsSync(target) && sha256(await readFile(target)) === SHA256) {
  console.log('public/vendor/homey-api.js already matches the expected checksum; nothing to download.');
  process.exit(0);
}

let bytes;
try {
  const response = await fetch(URL_);
  if (!response.ok) {
    console.error(`Download failed: HTTP ${response.status} for ${URL_}`);
    process.exit(1);
  }
  bytes = Buffer.from(await response.arrayBuffer());
} catch (error) {
  console.error(describeDownloadError(error));
  process.exit(1);
}
const actual = sha256(bytes);
if (actual !== SHA256 || bytes.length !== SIZE) {
  console.error(`Checksum mismatch for ${URL_}: expected ${SHA256} (${SIZE} bytes), got ${actual} (${bytes.length} bytes). Nothing was written.`);
  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
const partial = `${target}.partial`;
try {
  await writeFile(partial, bytes);
  await rename(partial, target);
} catch (error) {
  await rm(partial, { force: true });
  throw error;
}
console.log(`Saved public/vendor/homey-api.js (${bytes.length} bytes, checksum verified).`);
