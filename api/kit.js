/**
 * Buyer download links: /kit/<token>  (page)  and  /kit/<token>/<phone|printable>  (PDF).
 * vercel.json rewrites those paths to this function.
 *
 * <token> is created by the private order page: AES-256-GCM over
 * {o: order no., n: name, e: email, x: expiry (unix seconds)} with LINK_KEY, so it can't be
 * read, forged or edited. Each request decrypts the kit (KIT_KEY), stamps the buyer's name,
 * email and order number on every page, and returns it.
 *
 * Environment variables (Vercel → Settings → Environment Variables): KIT_KEY, LINK_KEY.
 */
import { createDecipheriv } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as kit from './_kit-data.js';

const BRAND = 'AutoToolKitPH';
const MESSENGER = 'https://m.me/AutoToolKitPH'; // keep in sync with FB_PAGE_NAME in src/config/site.ts
const FILES = {
  phone: { label: 'Phone Version', note: 'Para gamitin sa phone mismo, kahit walang printer', filename: '2nd Hand Car Inspection Kit PH - Phone Version' },
  printable: { label: 'Printable A4', note: 'I-print at dalhin sa viewing', filename: '2nd Hand Car Inspection Kit PH - Printable (A4)' },
};

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
    return p;
  } catch (e) {
    if (/LINK_KEY/.test(e.message)) throw e;
    return null;
  }
}

/** Kit stored as base64( iv(12) | tag(16) | ciphertext ). */
const masters = {};
function master(name) {
  if (!masters[name]) {
    const buf = Buffer.from(kit[name], 'base64');
    const d = createDecipheriv('aes-256-gcm', key('KIT_KEY'), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    masters[name] = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  }
  return masters[name];
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
async function stamp(name, p) {
  const pdf = await PDFDocument.load(master(name));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const head = forFont(font, `Para kay ${p.n}${p.e ? ` · ${p.e}` : ''}`);
  const tail = forFont(font, ` · Order #${p.o}`);
  const grey = rgb(0x6b / 255, 0x6f / 255, 0x75 / 255);
  const coverGrey = rgb(0xb8 / 255, 0xbc / 255, 0xc2 / 255);
  pdf.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    if (name === 'printable') {
      const f = fit(font, head, tail, 300, 7.5, 6);
      page.drawText(f.text, { x: 375 - font.widthOfTextAtSize(f.text, f.size) / 2, y: 19.2, size: f.size, font, color: grey });
    } else if (i === 0) {
      const f = fit(font, head, tail, width - 36, 7, 5.5);
      page.drawText(f.text, { x: 18, y: 11, size: f.size, font, color: coverGrey });
    } else {
      const f = fit(font, head, tail, width - 27, 6, 5);
      page.drawText(f.text, { x: 13.5, y: 20.5, size: f.size, font, color: grey });
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
:root{--bg:#f5f5f2;--card:#fff;--ink:#1b1d1f;--muted:#4a4f55;--line:#dadad3;--accent:#487219;--accent-h:#3d6015;--dark:#1b1d1f;--lime:#8dc63f;--tint:#eef4e4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.top{background:var(--dark);color:#fff;padding:16px 18px}.top b{font-weight:800}.top span{color:var(--lime)}
main{max-width:30rem;margin:0 auto;padding:20px 16px 40px;display:grid;gap:16px}
h1{font-size:1.6rem;line-height:1.15;margin:0}p{margin:0}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:12px}
a.btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-decoration:none;background:var(--accent);color:#fff;border-radius:12px;padding:14px 16px;font-weight:700;min-height:56px}
a.btn small{font-weight:400;opacity:.9}a.btn:hover{background:var(--accent-h)}a.btn.alt{background:var(--card);color:var(--ink);border:1px solid var(--line)}
a.btn:focus-visible{outline:3px solid #1b6fd1;outline-offset:3px}
ul{margin:0;padding-left:1.1rem;display:grid;gap:6px}.tint{background:var(--tint);border-color:#cfe0b8}
a{color:var(--accent);font-weight:700}
</style></head><body><div class="top"><b>AutoToolKit<span>PH</span></b></div><main>${body}</main></body></html>`;

function downloadPage(t, p) {
  const first = p.n.split(' ')[0];
  return shell(`Kit ni ${p.n} — ${BRAND}`, `
<h1>Salamat, ${esc(first)}! 🎉</h1>
<p class="muted">Order #${esc(p.o)} · 2nd Hand Car Inspection Kit PH</p>
<section class="card">
  <a class="btn" href="/kit/${t}/phone">⬇ I-download: ${FILES.phone.label}<small>${FILES.phone.note}</small></a>
  <a class="btn alt" href="/kit/${t}/printable">⬇ I-download: ${FILES.printable.label}<small>${FILES.printable.note}</small></a>
  <p class="muted" style="font-size:.9rem">Valid ang link hanggang <b>${fmtDate(p.x)}</b>. I-download na po agad at i-save sa phone.</p>
</section>
<section class="card">
  <p><b>Paano magsimula</b></p>
  <ul>
    <li>Basahin muna ang <b>“Paano gamitin”</b> (page 2) bago ang viewing.</li>
    <li>Kung hindi bumukas ang PDF dito sa Messenger, i-tap ang <b>⋯</b> at piliin ang <b>Open in browser</b>, tapos i-download ulit.</li>
    <li>Para sa personal na gamit lamang ang kit; naka-pangalan ito sa inyo.</li>
  </ul>
</section>
<section class="card tint">
  <p><b>7-day money-back guarantee</b></p>
  <p class="muted">Kung hindi ninyo nakitang useful, i-message lang kami at ibabalik namin ang bayad.</p>
  <p><a href="${MESSENGER}">I-message ang AutoToolKitPH</a></p>
</section>`);
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
  const f = req.query.f ? String(req.query.f).replace(/\.pdf$/, '') : '';

  // /kit/check — setup diagnostic. Reports only whether each key is set and usable, never a value.
  if (t === 'check') {
    const probe = (name) => {
      const v = process.env[name];
      if (v === undefined) return 'missing';
      if (/^\s|\s$|["']/.test(v)) return 'set, but has spaces or quotes around it';
      return Buffer.from(v, 'base64').length === 32 ? 'ok' : 'set, but not a 32-byte key';
    };
    res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify({ KIT_KEY: probe('KIT_KEY'), LINK_KEY: probe('LINK_KEY'), environment: process.env.VERCEL_ENV || 'unknown' }));
  }

  let p;
  try {
    p = readToken(t);
  } catch (e) {
    console.error('kit: configuration error:', e.message);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('May problema sa download', 'Pasensya na po, may problema sa ngayon. I-message lang po kami at ipapadala namin ulit ang kit ninyo.'));
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
  if (!FILES[f]) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('Walang ganitong file', 'Bumalik sa download page at piliin ang Phone Version o Printable A4.'));
  }
  try {
    const pdf = await stamp(f, p);
    const filename = `${FILES[f].filename} - ${p.o}.pdf`;
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(pdf);
  } catch (e) {
    console.error('kit: stamping failed:', e.message);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(problemPage('May problema sa download', 'Pasensya na po, hindi nagawa ang file. I-message lang po kami at ipapadala namin ulit.'));
  }
}
