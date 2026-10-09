/**
 * Buyer download links: /kit/<token>  (page)  and  /kit/<token>/<file>  (the file).
 * vercel.json rewrites those paths to this function.
 *
 * <token> is created by the private order page: AES-256-GCM over
 * {o: order no., n: name, e: email, x: expiry (unix seconds), k: product} with LINK_KEY, so it can't be
 * read, forged or edited. Links made before products existed have no k and mean the inspection kit.
 * Each request decrypts the file (KIT_KEY). PDFs that buyers keep get the buyer's name, email and order
 * number stamped on every page; forms meant for a talyer's own customers and Excel files are not stamped
 * on the page (PDF forms get it in their metadata only).
 *
 * The flagship (k = flagship) has one group per guide: the guide PDF and a toolkit .zip built on request from
 * api/_kit-flagship-<id>.js (product/delivery/encrypt-flagship.mjs); booklets inside the zip get the visible stamp.
 *
 * Environment variables (Vercel → Settings → Environment Variables): KIT_KEY, LINK_KEY.
 */
import { createDecipheriv } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as kit from './_kit-data.js';
import { zip } from './_zip.js';

const BRAND = 'AutoToolKitPH';
const MESSENGER = 'https://m.me/AutoToolKitPH'; // keep in sync with FB_PAGE_NAME in src/config/site.ts
const OPEN_TIP = 'Kung hindi bumukas ang file dito sa Messenger, i-tap ang <b>⋯</b> at piliin ang <b>Open in browser</b>, tapos i-download ulit.';

/* data = export name in _kit-data.js · stamp = how the buyer is marked · ext = file type */
const F = {
  phone: { label: 'Phone Version', note: 'Para gamitin sa phone mismo, kahit walang printer', filename: '2nd Hand Car Inspection Kit PH - Phone Version', data: 'phone', stamp: 'phone', ext: 'pdf' },
  printable: { label: 'Printable (Letter / short bond)', note: 'I-print at dalhin sa viewing', filename: '2nd Hand Car Inspection Kit PH - Printable (Letter)', data: 'printable', stamp: 'printable', ext: 'pdf' },
  guide: { label: 'Talyer Starter Kit PH 2026 (PDF guide)', note: 'Ang step-by-step na roadmap — simulan dito', filename: 'Talyer Starter Kit PH 2026', data: 'talyer_guide', stamp: 'ebook', ext: 'pdf' },
  toolkit: { label: 'Talyer Business Toolkit 2026 (Excel)', note: '9 tabs: startup cost, labor rate, job order, daily log, payroll, inventory, P&L, tax', filename: 'AutoToolKitPH Talyer Business Toolkit 2026', data: 'talyer_toolkit', ext: 'xlsx' },
  example: { label: 'Toolkit EXAMPLE (Excel)', note: 'Halimbawang shop na naka-fill in — tingnan muna ito', filename: 'AutoToolKitPH Talyer Business Toolkit 2026 - EXAMPLE', data: 'talyer_example', ext: 'xlsx' },
  pricelist: { label: 'Talyer Labor Price List (Excel)', note: '99 jobs, member price at printable price board', filename: 'AutoToolKitPH Talyer Labor Price List', data: 'pricelist', ext: 'xlsx' },
  'check-a4': { label: 'Vehicle Health Check Report (A4)', note: 'Fillable PDF — i-fill in sa phone o i-print', filename: 'AutoToolKitPH Vehicle Health Check Report - A4', data: 'check_a4', stamp: 'meta', ext: 'pdf' },
  'check-letter': { label: 'Vehicle Health Check Report (Letter / short bond)', note: 'Parehong form, para sa short bond', filename: 'AutoToolKitPH Vehicle Health Check Report - Letter', data: 'check_letter', stamp: 'meta', ext: 'pdf' },
};
const bonus = (k) => ({ ...F[k], label: 'BONUS: ' + F[k].label });

/* Flagship: one group per guide. Literal import paths so Vercel bundles every part; each loads only when needed. */
const FLAG_PARTS = {
  starter: () => import('./_kit-flagship-starter.js'),
  sa: () => import('./_kit-flagship-sa.js'),
  tech: () => import('./_kit-flagship-tech.js'),
  ops: () => import('./_kit-flagship-ops.js'),
  fin: () => import('./_kit-flagship-fin.js'),
  hr: () => import('./_kit-flagship-hr.js'),
  gm: () => import('./_kit-flagship-gm.js'),
  media: () => import('./_kit-flagship-media.js'),
};
const SYS = 'Auto Service Center System PH';
const FLAGSHIP = [
  { id: 'starter', n: 1, title: 'Talyer Starter Guide', guideNote: 'Simulan dito: permits, puhunan, labor rate, presyo, tauhan', toolkitNote: 'Business Toolkit Excel + EXAMPLE, Labor Price List, Vehicle Health Check Report' },
  { id: 'sa', n: 2, title: 'Service Advisor', guideNote: 'Mula tawag hanggang release at follow-up', toolkitNote: 'Job Order form, 44 Messenger scripts, Follow-up Tracker, stickers + warranty cards' },
  { id: 'tech', n: 3, title: 'Technician Training', guideNote: 'Skills ladder, PMS, quality check, safety', toolkitNote: 'Skills Checklist, PMS checklist, QC sheet + Comeback Log, safety posters, 52 toolbox talks' },
  { id: 'ops', n: 4, title: 'Operations Manager', guideNote: 'Job flow, capacity, parts, weekly numbers', toolkitNote: 'Job Board kit, Capacity Planner, Parts Control, Weekly Report, daily checklists' },
  { id: 'fin', n: 5, title: 'Finance', guideNote: 'Cash control, receivables, P&L, BIR calendar', toolkitNote: '13-Week Cash Forecast, Receivables Tracker, cash count forms, BIR calendar' },
  { id: 'hr', n: 6, title: 'HR', guideNote: 'Hiring, pay, incentives, discipline, DOLE basics', toolkitNote: 'Incentive Calculator, HR forms, House Rules (Word), 201 File Tracker' },
  { id: 'gm', n: 7, title: 'General Manager', guideNote: 'Scorecard, weekly meeting, pricing, growth', toolkitNote: 'GM Scorecard, meeting tracker, Pricing Review, Growth Calculator, Yearly Plan, forms' },
  { id: 'media', n: 8, title: 'Media', guideNote: 'Facebook, Google reviews, ads, partnerships', toolkitNote: 'Caption Bank, Posting Planner, Review Kit, Media Report, consent kit, Partnership Kit' },
];
const two = (n) => String(n).padStart(2, '0');
const flagFiles = {};
for (const g of FLAGSHIP) {
  flagFiles[`${g.id}-guide`] = g.id === 'starter'
    ? { ...F.guide, label: `Guide ${g.n}: ${g.title} (PDF)`, note: g.guideNote }
    : { label: `Guide ${g.n}: ${g.title} (PDF)`, note: g.guideNote, filename: `${SYS} - Guide ${g.n} ${g.title}`, flag: g.id, part: 'guide', stamp: 'ebook', ext: 'pdf' };
  const tk = g.id === 'starter' ? 'Talyer Starter' : g.title;
  flagFiles[`${g.id}-toolkit`] = { label: `${tk} Toolkit (.zip)`, note: g.toolkitNote, filename: `${SYS} - ${two(g.n)} ${tk} Toolkit`, flag: g.id, part: 'toolkit', ext: 'zip' };
}

const PRODUCTS = {
  inspection: {
    name: '2nd Hand Car Inspection Kit PH',
    files: { phone: F.phone, printable: F.printable },
    tips: ['Basahin muna ang <b>“Paano gamitin”</b> (page 2) bago ang viewing.', OPEN_TIP, 'Para sa personal na gamit lamang ang kit; naka-pangalan ito sa inyo.'],
    guarantee: true,
  },
  talyer: {
    name: 'Talyer Starter Kit PH 2026',
    files: { guide: F.guide, toolkit: F.toolkit, example: F.example, pricelist: bonus('pricelist'), 'check-a4': bonus('check-a4'), 'check-letter': bonus('check-letter') },
    tips: ['Basahin muna ang <b>Parts 1–4</b> ng guide bago pumirma ng lease o bumili ng tools.',
      'Buksan ang Excel files sa computer (Microsoft Excel) para sa pinakamagandang resulta. Tingnan muna ang <b>EXAMPLE</b> file para makita kung paano gamitin.',
      OPEN_TIP, 'Para sa sariling gamit at negosyo ninyo lamang; naka-pangalan sa inyo ang guide.'],
  },
  pricelist: {
    name: 'Talyer Labor Price List PH',
    files: { pricelist: F.pricelist },
    tips: ['Buksan sa Excel, i-type ang shop name sa <b>Price List</b> tab, i-adjust ang presyo, tapos i-print ang <b>Price Board</b> tab.', OPEN_TIP, 'Para sa sariling gamit at negosyo ninyo lamang.'],
  },
  check: {
    name: 'Vehicle Health Check Report PH',
    files: { 'check-a4': F['check-a4'], 'check-letter': F['check-letter'] },
    tips: ['Para mag-fill in sa phone, buksan sa PDF app na may forms (hal. Adobe Acrobat Reader). Pwede rin itong i-print nang marami.',
      'Piliin ang A4 o Letter (short bond) depende sa papel na gamit ninyo.', OPEN_TIP, 'Para sa sariling gamit at negosyo ninyo lamang.'],
  },
  flagship: {
    name: SYS,
    files: flagFiles,
    groups: FLAGSHIP.map((g) => ({ title: `${g.n} · ${g.title}`, keys: [`${g.id}-guide`, `${g.id}-toolkit`] })),
    tips: ['Magsimula sa <b>Guide 1</b>, tapos sundan ang guide ng bawat role. Pwede ninyong ibigay ang guide sa tao ninyo (SA, mekaniko, manager).',
      'Ang <b>Guide PDF</b> ay mababasa sa phone. Ang <b>Toolkit (.zip)</b> ay para sa computer: i-download, i-right-click at piliin ang <b>Extract All</b>, tapos buksan ang Excel at forms. Tingnan muna ang mga <b>EXAMPLE</b> file.',
      OPEN_TIP, 'Para sa sariling gamit at negosyo ninyo lamang; naka-pangalan sa inyo ang mga guide.'],
  },
};
const TYPES = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip' };

const key = (name) => {
  const k = Buffer.from(process.env[name] || '', 'base64');
  if (k.length !== 32) throw new Error(`${name} is missing or not 32 bytes`);
  return k;
};
function aesOpen(buf, k) {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const d = createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}

/** Token: base64url( iv(12) | ciphertext | tag(16) ) — WebCrypto's AES-GCM output order. */
function readToken(t) {
  if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{40,1200}$/.test(t)) return null;
  try {
    const p = JSON.parse(aesOpen(Buffer.from(t, 'base64url'), key('LINK_KEY')).toString('utf8'));
    if (typeof p.o !== 'string' || typeof p.n !== 'string' || typeof p.x !== 'number') return null;
    p.k = p.k === undefined ? 'inspection' : p.k;
    if (!PRODUCTS[p.k]) return null;
    return p;
  } catch (e) {
    if (/LINK_KEY/.test(e.message)) throw e;
    return null;
  }
}

/** Files stored as base64( iv(12) | tag(16) | ciphertext ). */
const masters = {};
function unseal(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', key('KIT_KEY'), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}
function master(name) {
  if (!masters[name]) {
    if (!kit[name]) throw new Error(`file "${name}" is not in _kit-data.js`);
    masters[name] = unseal(kit[name]);
  }
  return masters[name];
}
async function flagMaster(id, part) {
  const name = `flag:${id}:${part}`;
  if (!masters[name]) {
    const mod = await FLAG_PARTS[id]();
    if (!mod[part]) throw new Error(`part "${part}" is not in _kit-flagship-${id}.js`);
    masters[name] = unseal(mod[part]);
  }
  return masters[name];
}
/** Toolkit bundle (deflate-compressed before encryption): u32 manifest length | manifest JSON {folder, files: [{path, size, kind}]} | file bytes in order. */
function readBundle(buf) {
  const len = buf.readUInt32LE(0);
  const m = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
  let at = 4 + len;
  const files = m.files.map((f) => {
    const data = buf.subarray(at, at + f.size);
    at += f.size;
    return { ...f, data };
  });
  return { folder: m.folder, files };
}

/* Stamp: same placement as the PC tool and the order page. */
const forFont = (font, s) =>
  [...s]
    .map((ch) => {
      try { font.encodeText(ch); return ch; } catch {}
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try { font.encodeText(plain); return plain; } catch { return '?'; }
    })
    .join('');
function fit(font, head, tail, maxW, size, minSize) {
  const w = (t, sz) => font.widthOfTextAtSize(t + tail, sz);
  while (size > minSize && w(head, size) > maxW) size -= 0.25;
  let t = head;
  while (w(t, size) > maxW && t.length > 12) t = t.slice(0, -2).trimEnd() + '…';
  return { text: t + tail, size };
}
async function makeFile(file, p) {
  if (file.part === 'toolkit') {
    // Booklets the buyer keeps get the visible stamp; forms for the shop's customers get metadata only; Excel/Word/text as-is.
    const b = readBundle(inflateRawSync(await flagMaster(file.flag, 'toolkit')));
    const entries = [];
    for (const f of b.files) {
      const data = f.kind === 'raw' ? f.data : await stampPdf(f.data, f.kind === 'booklet' ? 'ebook' : 'meta', p);
      entries.push({ name: `${b.folder}/${f.path}`, data });
    }
    return zip(entries);
  }
  const raw = file.flag ? await flagMaster(file.flag, file.part) : master(file.data);
  if (file.ext !== 'pdf') return raw;
  return stampPdf(raw, file.stamp, p);
}
async function stampPdf(raw, stamp, p) {
  const file = { stamp };
  const pdf = await PDFDocument.load(raw);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const head = forFont(font, `Para kay ${p.n}${p.e ? ` · ${p.e}` : ''}`);
  const tail = forFont(font, ` · Order #${p.o}`);
  const grey = rgb(0x6b / 255, 0x6f / 255, 0x75 / 255);
  const coverGrey = rgb(0xb8 / 255, 0xbc / 255, 0xc2 / 255);
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    if (file.stamp === 'printable') {
      const f = fit(font, head, tail, 300, 7.5, 6);
      page.drawText(f.text, { x: 386 - font.widthOfTextAtSize(f.text, f.size) / 2, y: 18.8, size: f.size, font, color: grey });
    } else if (file.stamp === 'phone') {
      const f = i === 0 ? fit(font, head, tail, width - 36, 7, 5.5) : fit(font, head, tail, width - 27, 6, 5);
      page.drawText(f.text, i === 0 ? { x: 18, y: 11, size: f.size, font, color: coverGrey } : { x: 13.5, y: 20.5, size: f.size, font, color: grey });
    } else if (file.stamp === 'ebook') {
      // Centered under the page number; the cover and back page are dark, so a light grey there.
      const f = fit(font, head, tail, width - 80, 6.5, 5.5);
      const dark = i === 0 || i === pages.length - 1;
      page.drawText(f.text, { x: (width - font.widthOfTextAtSize(f.text, f.size)) / 2, y: 12, size: f.size, font, color: dark ? coverGrey : grey });
    }
  });
  pdf.setSubject(`Para kay ${p.n}${p.e ? ` · ${p.e}` : ''} · Order #${p.o}`);
  pdf.setKeywords([`order:${p.o}`, `buyer:${p.n}`, ...(p.e ? [`email:${p.e}`] : [])]);
  pdf.setAuthor(BRAND);
  return Buffer.from(await pdf.save());
}

/* Pages */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (unix) => new Date(unix * 1000).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
const shell = (title, body) => `<!doctype html><html lang="fil"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><link rel="icon" href="/brand/logo-mark.svg" type="image/svg+xml">
<style>
:root{--bg:#f5f5f2;--card:#fff;--ink:#151f28;--muted:#4a4f55;--line:#dadad3;--accent:#487219;--accent-h:#3d6015;--dark:#151f28;--lime:#b4d12b;--tint:#eef4e4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.top{background:var(--dark);padding:14px 18px;line-height:0}.top img{height:26px;width:auto}
main{max-width:30rem;margin:0 auto;padding:20px 16px 40px;display:grid;gap:16px}
h1{font-size:1.6rem;line-height:1.15;margin:0}p{margin:0}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:12px}
a.btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-decoration:none;background:var(--accent);color:#fff;border-radius:12px;padding:14px 16px;font-weight:700;min-height:56px}
a.btn small{font-weight:400;opacity:.9}a.btn:hover{background:var(--accent-h)}a.btn.alt{background:var(--card);color:var(--ink);border:1px solid var(--line)}
a.btn:focus-visible{outline:3px solid #1b6fd1;outline-offset:3px}
ul{margin:0;padding-left:1.1rem;display:grid;gap:6px}.tint{background:var(--tint);border-color:#cfe0b8}
a{color:var(--accent);font-weight:700}
</style></head><body><div class="top"><img src="/brand/logo-horizontal-dark.svg" width="172" height="26" alt="AutoToolKitPH"></div><main>${body}</main></body></html>`;

function downloadPage(t, p) {
  const prod = PRODUCTS[p.k];
  const first = p.n.split(' ')[0];
  const files = Object.entries(prod.files);
  const btn = ([k, f], i) => `<a class="btn${i ? ' alt' : ''}" href="/kit/${t}/${k}">⬇ I-download: ${f.label}<small>${f.note}</small></a>`;
  const valid = `<p class="muted" style="font-size:.9rem">Valid ang link hanggang <b>${fmtDate(p.x)}</b>. I-download na po agad${files.length > 1 ? ' ang lahat ng file' : ''} at i-save.</p>`;
  const list = prod.groups
    ? `<section class="card">${valid}</section>
${prod.groups.map((g) => `<section class="card">
  <p><b>${esc(g.title)}</b></p>
  ${g.keys.map((k, i) => btn([k, prod.files[k]], i)).join('\n  ')}
</section>`).join('\n')}`
    : `<section class="card">
  ${files.map(btn).join('\n  ')}
  ${valid}
</section>`;
  return shell(`${prod.name} ni ${p.n} — ${BRAND}`, `
<h1>Salamat, ${esc(first)}! 🎉</h1>
<p class="muted">Order #${esc(p.o)} · ${esc(prod.name)}</p>
${list}
<section class="card">
  <p><b>Paano magsimula</b></p>
  <ul>${prod.tips.map((x) => `<li>${x}</li>`).join('')}</ul>
</section>
${prod.guarantee ? `<section class="card tint">
  <p><b>7-day money-back guarantee</b></p>
  <p class="muted">Kung hindi ninyo nakitang useful, i-message lang kami at ibabalik namin ang bayad.</p>
  <p><a href="${MESSENGER}">I-message ang AutoToolKitPH</a></p>
</section>` : `<section class="card"><p class="muted">May tanong? <a href="${MESSENGER}">I-message ang AutoToolKitPH</a></p></section>`}`);
}
function problemPage(title, text) {
  return shell(`${title} — ${BRAND}`, `
<h1>${esc(title)}</h1>
<section class="card"><p>${text}</p><p><a href="${MESSENGER}">I-message ang AutoToolKitPH sa Messenger</a></p></section>`);
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  const t = String(req.query.t || '');
  const f = req.query.f ? String(req.query.f).replace(/\.(pdf|xlsx|zip)$/, '') : '';

  // /kit/check — setup diagnostic. Reports only whether each key is set and usable (and which files exist), never a value.
  if (t === 'check') {
    const probe = (name) => {
      const v = process.env[name];
      if (v === undefined) return 'missing';
      if (/^\s|\s$|["']/.test(v)) return 'set, but has spaces or quotes around it';
      return Buffer.from(v, 'base64').length === 32 ? 'ok' : 'set, but not a 32-byte key';
    };
    const files = [...new Set(Object.values(F).map((x) => x.data))].filter((d) => !kit[d]);
    for (const [id, load] of Object.entries(FLAG_PARTS)) {
      try {
        const mod = await load();
        if (!mod.toolkit || (id !== 'starter' && !mod.guide)) files.push(`flagship:${id}`);
      } catch {
        files.push(`flagship:${id}`);
      }
    }
    res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify({ KIT_KEY: probe('KIT_KEY'), LINK_KEY: probe('LINK_KEY'), missingFiles: files, environment: process.env.VERCEL_ENV || 'unknown' }));
  }

  let p;
  try {
    p = readToken(t);
  } catch (e) {
    console.error('kit: configuration error:', e.message);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('May problema sa download', 'Pasensya na po, may problema sa ngayon. I-message lang po kami at ipapadala namin ulit ang files ninyo.'));
  }
  if (!p) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('Hindi gumagana ang link', 'Mukhang kulang o mali ang link. Siguraduhing kinopya ang buong link, o i-message kami para sa bagong link.'));
  }
  if (p.x < Date.now() / 1000) {
    res.status(410).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('Expired na ang link', `Valid lang ang link hanggang ${esc(fmtDate(p.x))}. I-message lang po kami at bibigyan namin kayo ng bagong link.`));
  }

  if (!f) {
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(downloadPage(t, p));
  }
  const file = PRODUCTS[p.k].files[f];
  if (!file) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('Walang ganitong file', 'Bumalik sa download page at piliin ang file doon.'));
  }
  try {
    const data = await makeFile(file, p);
    const filename = `${file.filename} - ${p.o}.${file.ext}`;
    res.status(200);
    res.setHeader('Content-Type', TYPES[file.ext]);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(data);
  } catch (e) {
    console.error('kit: file failed:', e.message);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('May problema sa download', 'Pasensya na po, hindi nagawa ang file. I-message lang po kami at ipapadala namin ulit.'));
  }
}
