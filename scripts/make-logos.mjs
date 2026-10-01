/**
 * Generates the brand logo SVGs in public/brand/ from the master logo (Logo/Logo.jpg, kept local),
 * plus the site-wide share image public/brand/og-default.jpg. After running it, re-run
 * scripts/make-og.mjs for each product so their share images pick up the new logo.
 *
 *   node scripts/make-logos.mjs
 *
 * The mark is a clean vector redraw of the master: shapes were measured from the JPG and
 * idealised (shared 0.6 slope, equal gaps). The wordmark is Unbounded 700 converted to outlines,
 * so the SVGs need no web font and render the same in <img>, favicons and the kit PDFs.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { svgToJpeg } from './lib/rasterize.mjs';

const require = createRequire(import.meta.url);
const OUT = fileURLToPath(new URL('../public/brand/', import.meta.url));

/* ── Colours (keep in sync with src/styles/tokens.css) ────────────────────── */
const NAVY = '#151F28'; // --color-dark / --color-text
const GREY = '#646C77'; // mark grey on light
const GREY_ON_DARK = '#8A939E';
const LIME = '#B4D12B'; // --color-accent-bright
const GREEN = '#487219'; // --color-accent ("PH" on light: lime fails contrast there)

const LIGHT = { arch: NAVY, grey: GREY, lime: LIME, text: NAVY, ph: GREEN }; // for light backgrounds
const DARK = { arch: '#FFFFFF', grey: GREY_ON_DARK, lime: LIME, text: '#FFFFFF', ph: LIME }; // for dark backgrounds

/* ── Mark: 666 × 330 units ────────────────────────────────────────────────── */
const MARK_W = 666;
const MARK_H = 330;
const markShapes = (c) => `<path fill="${c.arch}" d="M0 330L159 65C211 -21.7 319 -21.7 371 65L530 330H429L288 95C272 68.3 258 68.3 242 95L101 330Z"/>
<path fill="${c.grey}" d="M285 330L219 220L257.8 155.3Q265 143.3 272.2 155.3L377 330Z"/>
<path fill="${c.grey}" d="M445.8 103H529.8L583.8 193L541.9 263.2Z"/>
<path fill="${c.lime}" d="M583.8 193L666 330H582L541.9 263.2Z"/>`;

/* ── Wordmark: Unbounded 700 as outlines ──────────────────────────────────── */
const font = fontkit.openSync(require.resolve('@fontsource/unbounded/files/unbounded-latin-700-normal.woff'));
const round = (d) => d.replace(/-?\d*\.\d+/g, (n) => String(Math.round(parseFloat(n) * 10) / 10));

/** Lays out "AutoToolKitPH" once (keeps kerning) and splits it into the two coloured runs. */
function wordmark(capH, { split = true } = {}) {
  const s = capH / font.capHeight;
  const text = 'AutoToolKitPH';
  const run = font.layout(text);
  const runs = [[], []];
  const widths = [0, 0];
  let x = 0;
  run.glyphs.forEach((g, i) => {
    const part = i < 11 ? 0 : 1;
    if (split && part === 1 && widths[1] === 0) x = 0;
    runs[part].push(g.path.scale(s, -s).translate(x, 0).toSVG());
    x += run.positions[i].xAdvance * s;
    widths[part] = x;
  });
  if (!split) widths[1] -= widths[0];
  return { auto: round(runs[0].join('')), ph: round(runs[1].join('')), widths, capH };
}

const svg = (w, h, body, title = 'AutoToolKitPH') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">
<title>${title}</title>
${body}
</svg>
`;
const r1 = (n) => Math.round(n * 10) / 10;

/* Horizontal: mark + "AutoToolKitPH" on one line, text centred on the mark. */
function horizontal(c) {
  const capH = MARK_H * 0.36;
  const gap = 84;
  const wm = wordmark(capH, { split: false });
  const w = r1(MARK_W + gap + wm.widths[0] + wm.widths[1]);
  const base = r1((MARK_H + capH) / 2);
  return {
    w,
    h: MARK_H,
    body: `${markShapes(c)}
<g transform="translate(${MARK_W + gap} ${base})"><path fill="${c.text}" d="${wm.auto}"/><path fill="${c.ph}" d="${wm.ph}"/></g>`,
  };
}

/* Stacked (like the master): mark, "AutoToolKit", then "PH" centred underneath. */
function stacked(c) {
  const capH = 68;
  const wm = wordmark(capH);
  const w = r1(Math.max(MARK_W, wm.widths[0]));
  const markX = r1((w - MARK_W) / 2);
  const line1 = MARK_H + 84 + capH;
  const line2 = line1 + 44 + capH;
  return {
    w,
    h: line2,
    body: `<g transform="translate(${markX} 0)">${markShapes(c)}</g>
<g transform="translate(${r1((w - wm.widths[0]) / 2)} ${line1})"><path fill="${c.text}" d="${wm.auto}"/></g>
<g transform="translate(${r1((w - wm.widths[1]) / 2)} ${line2})"><path fill="${c.ph}" d="${wm.ph}"/></g>`,
  };
}

/* Square icon: light mark on a navy rounded square (favicon, schema.org logo). */
function icon() {
  const size = 800;
  const scale = 0.94;
  const mw = MARK_W * scale;
  const mh = MARK_H * scale;
  return svg(
    64,
    64,
    `<svg viewBox="0 0 ${size} ${size}" width="64" height="64"><rect width="${size}" height="${size}" rx="176" fill="${NAVY}"/>
<g transform="translate(${r1((size - mw) / 2)} ${r1((size - mh) / 2 + 12)}) scale(${scale})">${markShapes(DARK)}</g></svg>`,
  );
}

const write = (name, { w, h, body }) => writeFileSync(OUT + name, svg(w, h, body));

write('logo-horizontal-light.svg', horizontal(LIGHT));
write('logo-horizontal-dark.svg', horizontal(DARK));
write('logo-stacked-light.svg', stacked(LIGHT));
write('logo-stacked-dark.svg', stacked(DARK));
writeFileSync(OUT + 'logo-mark.svg', icon());

for (const [n, v] of Object.entries({ horizontal: horizontal(LIGHT), stacked: stacked(LIGHT) }))
  console.log(`${n}: ${v.w} × ${v.h} (ratio ${(v.w / v.h).toFixed(3)})`);
console.log('Wrote public/brand/logo-{horizontal,stacked}-{light,dark}.svg and logo-mark.svg');

/* ── Default share image (1200 × 630): navy, logo, tagline ───────────────── */
{
  const W = 1200;
  const H = 630;
  const PAD = 90;
  const body = fontkit.openSync(require.resolve('@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff'));
  const TAGLINE = 'Practical automotive tools, guides & systems for Filipinos'; // TAGLINE in src/config/site.ts
  const size = 34;
  const sc = size / body.unitsPerEm;
  const run = body.layout(TAGLINE);
  let x = 0;
  const tag = run.glyphs
    .map((g, i) => {
      const d = g.path.scale(sc, -sc).translate(x, 0).toSVG();
      x += run.positions[i].xAdvance * sc;
      return d;
    })
    .join('');
  const logo = horizontal(DARK);
  const logoH = 112;
  const k = logoH / logo.h;
  const logoY = 214;
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${NAVY}"/>
<circle cx="${W + 20}" cy="-40" r="300" fill="none" stroke="${LIME}" stroke-opacity="0.12" stroke-width="56"/>
<g transform="translate(${PAD} ${logoY}) scale(${k.toFixed(5)})">${logo.body}</g>
<path fill="#B8BCC2" transform="translate(${PAD} ${logoY + logoH + 70})" d="${round(tag)}"/>
<rect x="${PAD}" y="${logoY + logoH + 110}" width="120" height="10" rx="5" fill="${LIME}"/>
</svg>`;
  const info = await svgToJpeg(og, W, H, OUT + 'og-default.jpg');
  console.log(`Wrote public/brand/og-default.jpg — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB (via ${info.via})`);
}
