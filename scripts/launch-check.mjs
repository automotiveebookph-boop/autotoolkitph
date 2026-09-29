#!/usr/bin/env node
/**
 * Launch check — fetches the live site and prints a PASS / FAIL / WARN report.
 *
 *   node scripts/launch-check.mjs [url] [--pixel <id>]
 *   npm run launch-check -- [url] [--pixel <id>]
 *
 * url      defaults to production (https://autotoolkitph-cyai.vercel.app)
 * --pixel  the Meta Pixel ID you expect to be live (or set PUBLIC_META_PIXEL_ID in your shell).
 *          Without it, the check only reports whether a Pixel is installed.
 *
 * Exit code 1 if anything FAILs (WARN does not fail the run).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_URL = 'https://autotoolkitph-cyai.vercel.app';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Args ─────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const pixelFlag = args.indexOf('--pixel');
const expectedPixel = (pixelFlag >= 0 ? args[pixelFlag + 1] : process.env.PUBLIC_META_PIXEL_ID || '').trim();
const base = (args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--pixel') || DEFAULT_URL).replace(/\/+$/, '');

/* ── Local project facts ──────────────────────────────────────────────────── */
const siteTs = readFileSync(join(ROOT, 'src/config/site.ts'), 'utf8');
const FB_PAGE_NAME = siteTs.match(/export const FB_PAGE_NAME(?:: string)? = '([^']+)'/)?.[1];
if (!FB_PAGE_NAME) throw new Error('Could not read FB_PAGE_NAME from src/config/site.ts');
const MESSENGER = `https://m.me/${FB_PAGE_NAME}`;

const productsDir = join(ROOT, 'src/content/products');
const localActive = readdirSync(productsDir)
  .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith('_'))
  .map((f) => readFileSync(join(productsDir, f), 'utf8'))
  .filter((y) => /^status:\s*active\s*$/m.test(y))
  .map((y) => y.match(/^slug:\s*['"]?([a-z0-9-]+)/m)?.[1])
  .filter(Boolean);

let localHead = '';
try {
  localHead = execSync('git rev-parse --short=7 HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}

const FORBIDDEN = ['TotoGaragehomeservice', 'YOURPAGENAME'];
const PLACEHOLDERS = [
  { label: '[X]', re: /\[X\]/ },
  { label: '[8AM', re: /\[8AM/ },
  { label: 'TODO', re: /TODO/ },
  { label: 'placeholder', re: /placeholder/i },
];
const CTA_LOCATIONS = ['hero', 'pricing', 'final', 'sticky'];

/* ── Report helpers ───────────────────────────────────────────────────────── */
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const counts = { PASS: 0, FAIL: 0, WARN: 0 };
const failures = [];
function report(status, message, details = []) {
  counts[status]++;
  const tag = { PASS: paint(32, 'PASS'), FAIL: paint(31, 'FAIL'), WARN: paint(33, 'WARN') }[status];
  console.log(`  ${tag}  ${message}`);
  for (const d of details) console.log(`          ${paint(2, d)}`);
  if (status === 'FAIL') failures.push(message);
}
const section = (title) => console.log(`\n${paint(1, title)}`);

/* ── Fetch helpers ────────────────────────────────────────────────────────── */
const pages = new Map(); // path -> { status, html }
async function getPage(path) {
  if (!pages.has(path)) {
    const res = await fetch(base + path, { headers: { 'cache-control': 'no-cache' }, redirect: 'follow' });
    pages.set(path, { status: res.status, html: res.ok ? await res.text() : '' });
  }
  return pages.get(path);
}
async function statusOf(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405) res = await fetch(url, { redirect: 'follow' });
    return res.status;
  } catch (e) {
    return `network error (${e.message})`;
  }
}
const abs = (u) => new URL(u.replace(/&amp;/g, '&'), base + '/').href;
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const snippet = (html, re) => {
  const m = html.match(re);
  if (!m) return '';
  const i = m.index;
  return '…' + html.slice(Math.max(0, i - 50), i + 60).replace(/\s+/g, ' ') + '…';
};

/* ── Run ──────────────────────────────────────────────────────────────────── */
console.log(paint(1, `Launch check — ${base}`));
console.log(`Expected Messenger page: ${MESSENGER}   Local active products: ${localActive.join(', ') || '(none)'}`);

// Discover product pages from the live sitemap (only active products are listed there).
section('Site & deployment');
const home = await getPage('/');
report(home.status === 200 ? 'PASS' : 'FAIL', `Homepage returns HTTP ${home.status}`);
const privacy = await getPage('/privacy');
report(privacy.status === 200 ? 'PASS' : 'FAIL', `Privacy page returns HTTP ${privacy.status}`);

const build = home.html.match(/<meta name="x-build" content="([^"]*)"/)?.[1];
if (!build) {
  report('WARN', 'No build stamp (<meta name="x-build">) on homepage — cannot tell which commit is live');
} else {
  const [commit, env] = build.split(' ');
  const isProdUrl = base === DEFAULT_URL;
  if (isProdUrl && env !== 'production') report('FAIL', `Live build environment is "${env}", expected "production"`);
  else report('PASS', `Live build: commit ${commit}, environment ${env}`);
  if (localHead && commit !== 'local' && commit !== localHead)
    report('WARN', `Live commit ${commit} differs from local HEAD ${localHead} (not pushed yet, still building, or not promoted)`);
}

const sitemapRes = await fetch(base + '/sitemap.xml');
const sitemap = sitemapRes.ok ? await sitemapRes.text() : '';
const productPaths = attrs(sitemap, /<loc>([^<]+)<\/loc>/g)
  .map((u) => new URL(u).pathname)
  .filter((p) => p !== '/' && p !== '/privacy');
report(sitemapRes.ok ? 'PASS' : 'FAIL', `sitemap.xml returns HTTP ${sitemapRes.status} — ${productPaths.length} product page(s): ${productPaths.join(', ') || 'none'}`);
const liveSlugs = productPaths.map((p) => p.slice(1));
const notLive = localActive.filter((s) => !liveSlugs.includes(s));
const extra = liveSlugs.filter((s) => !localActive.includes(s));
if (notLive.length) report('FAIL', `Active locally but not live: ${notLive.join(', ')} (push/deploy needed)`);
if (extra.length) report('WARN', `Live but not active locally: ${extra.join(', ')}`);

const scanPaths = ['/', ...productPaths, '/privacy'];
for (const p of productPaths) await getPage(p);

// 1. Messenger links
section('Messenger links');
for (const path of scanPaths) {
  const { html } = await getPage(path);
  const links = attrs(html, /href="(https?:\/\/(?:www\.)?m\.me\/[^"]*)"/g).map((l) => l.replace(/&amp;/g, '&'));
  const bad = links.filter((l) => !(l === MESSENGER || l.startsWith(MESSENGER + '?')));
  if (!links.length) report(path === '/' ? 'PASS' : 'WARN', `${path}: no m.me links`);
  else if (bad.length) report('FAIL', `${path}: ${bad.length} of ${links.length} m.me link(s) don't point to ${MESSENGER}`, bad);
  else report('PASS', `${path}: all ${links.length} m.me link(s) point to ${MESSENGER}`);
}

// 2. Refs per product
section('Button refs');
for (const path of productPaths) {
  const slug = path.slice(1);
  const { html } = await getPage(path);
  const refs = attrs(html, /href="https?:\/\/m\.me\/[^"?]*\?ref=([^"&]+)"/g).map(decodeURIComponent);
  const missing = CTA_LOCATIONS.map((l) => `${slug}_${l}`).filter((r) => !refs.includes(r));
  if (missing.length) report('FAIL', `${path}: missing ref(s) ${missing.join(', ')}`, [`found: ${refs.join(', ') || 'none'}`]);
  else report('PASS', `${path}: has ${CTA_LOCATIONS.map((l) => `${slug}_${l}`).join(', ')}`);
}

// 3. Forbidden page names + unfilled placeholders
section('Old page names & unfilled placeholders');
for (const path of scanPaths) {
  const { html } = await getPage(path);
  const forbidden = FORBIDDEN.filter((f) => html.toLowerCase().includes(f.toLowerCase()));
  if (forbidden.length) report('FAIL', `${path}: contains ${forbidden.join(', ')}`);
  else report('PASS', `${path}: no ${FORBIDDEN.join(' / ')}`);
  const found = PLACEHOLDERS.filter((p) => p.re.test(html));
  if (found.length)
    report('FAIL', `${path}: unfilled placeholder(s): ${found.map((p) => `"${p.label}"`).join(', ')}`, found.map((p) => snippet(html, p.re)));
  else report('PASS', `${path}: no "[X]", "[8AM", "TODO" or "placeholder"`);
}

// 4. Meta Pixel
section('Meta Pixel');
for (const path of scanPaths) {
  const { html } = await getPage(path);
  const loader = html.includes('connect.facebook.net/en_US/fbevents.js');
  const liveId = html.match(/fbq\('init',\s*"(\d+)"\)/)?.[1] || html.match(/var PIXEL_ID = "(\d+)"/)?.[1] || '';
  if (expectedPixel) {
    if (loader && liveId === expectedPixel) report('PASS', `${path}: Pixel ${liveId} installed`);
    else report('FAIL', `${path}: expected Pixel ${expectedPixel}, found ${liveId || 'no Pixel'}`);
  } else if (liveId) {
    report('PASS', `${path}: Pixel ${liveId} installed`);
  } else {
    report('WARN', `${path}: no Pixel installed (PUBLIC_META_PIXEL_ID not set) — required before running ads`);
  }
}

// 5. Images: previews + og:image
section('Images');
for (const path of scanPaths) {
  const { html } = await getPage(path);
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!og) report('FAIL', `${path}: no og:image`);
  else {
    const s = await statusOf(abs(og));
    report(s === 200 ? 'PASS' : 'FAIL', `${path}: og:image → HTTP ${s}`, [abs(og)]);
  }
}
for (const path of productPaths) {
  const { html } = await getPage(path);
  const gallery = html.match(/<div class="gallery"[\s\S]*?<\/ul>/)?.[0] || '';
  const hasPreviewSection = /id="previews-h"/.test(html);
  const urls = new Set([
    ...attrs(gallery, /<img[^>]+src="([^"]+)"/g),
    ...attrs(gallery, /srcset="([^"]+)"/g).flatMap((s) => s.split(',').map((x) => x.trim().split(/\s+/)[0])),
    ...attrs(html, /data-full="([^"]+)"/g),
  ]);
  const thumbs = (gallery.match(/data-lightbox-index=/g) || []).length;
  const slides = (gallery.match(/class="slide"/g) || []).length;
  if (!hasPreviewSection) {
    report('WARN', `${path}: no preview section`);
    continue;
  }
  if (thumbs < slides || thumbs === 0)
    report('FAIL', `${path}: ${thumbs} of ${slides} preview slot(s) have a real image`);
  else report('PASS', `${path}: all ${slides} preview slot(s) have a real image (open in lightbox)`);
  const bad = [];
  for (const u of urls) {
    const s = await statusOf(abs(u));
    if (s !== 200) bad.push(`${s}  ${abs(u)}`);
  }
  if (urls.size) report(bad.length ? 'FAIL' : 'PASS', `${path}: ${urls.size - bad.length} of ${urls.size} preview image URL(s) return HTTP 200`, bad);
}

/* ── Summary ──────────────────────────────────────────────────────────────── */
console.log(`\n${paint(1, 'Summary')}: ${paint(32, counts.PASS + ' pass')}, ${paint(31, counts.FAIL + ' fail')}, ${paint(33, counts.WARN + ' warn')}`);
if (failures.length) {
  console.log(paint(31, '\nFailures:'));
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failures.length ? 1 : 0);
