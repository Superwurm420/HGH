#!/usr/bin/env node
/**
 * fetch-instagram-preview.js
 * Fetches Instagram profile previews and caches them locally.
 * Runs in CI (GitHub Actions) to periodically update preview data.
 *
 * Usage: node tools/fetch-instagram-preview.js
 *
 * Uses Instagram's public oEmbed-like endpoints to get profile info.
 * Falls back to placeholder data if fetching fails.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const PROFILES = [
  { id: 'ht21', handle: 'usf_ht21', label: 'HT21 – Lunido' },
  { id: 'ht22', handle: 'usf_ht22', label: 'HT22 – LYS' },
  { id: 'schule', handle: 'hgh.hildesheim', label: 'HGH Hildesheim' }
];

const OUT_DIR = join(ROOT, 'data');
const OUT_FILE = join(OUT_DIR, 'instagram.json');

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchProfileMeta(handle) {
  try {
    const url = `https://www.instagram.com/${handle}/`;
    const { status, body } = await fetchURL(url);
    if (status !== 200) {
      console.log(`  [${handle}] HTTP ${status}`);
      return null;
    }
    // Try to extract og:image (profile picture) from meta tags
    const ogImage = body.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)?.[1]
      || body.match(/<meta\s+content="([^"]+)"\s+property="og:image"/)?.[1];
    const ogDesc = body.match(/<meta\s+property="og:description"\s+content="([^"]+)"/)?.[1]
      || body.match(/<meta\s+content="([^"]+)"\s+property="og:description"/)?.[1];

    // Try to extract follower count from description
    let followers = null;
    if (ogDesc) {
      const m = ogDesc.match(/([\d,.]+[KkMm]?)\s*Followers/i)
        || ogDesc.match(/([\d,.]+)\s*Abonnenten/i);
      if (m) followers = m[1];
    }

    return { profilePic: ogImage || null, description: ogDesc || null, followers };
  } catch (err) {
    console.log(`  [${handle}] Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('Fetching Instagram preview data...');

  const result = {
    fetchedAt: new Date().toISOString(),
    profiles: {}
  };

  for (const profile of PROFILES) {
    console.log(`Fetching @${profile.handle}...`);
    const meta = await fetchProfileMeta(profile.handle);
    result.profiles[profile.id] = {
      handle: profile.handle,
      label: profile.label,
      url: `https://www.instagram.com/${profile.handle}/`,
      profilePic: meta?.profilePic || null,
      followers: meta?.followers || null,
      description: meta?.description || null
    };
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`Written to ${OUT_FILE}`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
