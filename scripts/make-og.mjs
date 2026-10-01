#!/usr/bin/env node
/**
 * Generates a 1200×630 JPG share image (og:image) for a product.
 *
 *   node scripts/make-og.mjs --slug inspection-kit \
 *     --headline "Bago ka magbayad, i-check mo muna." \
 *     --subline "2nd Hand Car Inspection Kit PH · ₱199" \
 *     --tagline "Printable at Taglish · Para sa 2nd hand car buyers"
 *
 * Writes src/assets/products/<slug>/og.jpg. Then set `seo.ogImage: og.jpg` in the product YAML.
 * Re-run it whenever the logo, price or copy changes (and commit the new og.jpg).
 *
 * - Colors are read from src/styles/tokens.css, the logos from public/brand/logo-horizontal-{light,dark}.svg
 *   (run scripts/make-logos.mjs first if the logo changed).
 * - Text is converted to vector outlines with the site's own fonts (Bricolage Grotesque,
 *   Source Sans 3), so the result doesn't depend on fonts installed on this computer.
 * - The product mockup card on the right uses the product's `name` and `mockupLine` from its YAML.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import { svgToJpeg } from './lib/rasterize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* ── Args ─────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const slug = arg('slug');
const headline = arg('headline');
const subline = arg('subline');
const tagline = arg('tagline') ?? '';
if (!slug || !headline || !subline) {
  console.error('Usage: node scripts/make-og.mjs --slug <slug> --headline "<text>" --subline "<text>" [--tagline "<text>"]');
  process.exit(1);
}
const out = arg('out') ?? join(ROOT, 'src/assets/products', slug, 'og.jpg');

/* ── Brand inputs ─────────────────────────────────────────────────────────── */
const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const token = (name) => {
  const m = tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} not found in tokens.css`);
  return m[1];
};
const C = {
  bg: token('bg'),
  text: token('text'),
  muted: token('text-muted'),
  accent: token('accent'),
  lime: token('accent-bright'), // only used on the dark card
  dark: token('dark'),
  dark2: token('dark-2'),
  border: token('border'),
  onDarkMuted: token('on-dark-muted'),
};

const yaml = readFileSync(join(ROOT, 'src/content/products', `${slug}.yaml`), 'utf8');
const field = (k) => yaml.match(new RegExp(`^${k}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))?.[1] ?? '';
const cardTitle = field('name');
const cardLine = field('mockupLine');

/* ── Fonts (latin + latin-ext fallback for ₱ etc.) ───────────────────────── */
const loadFont = (pkg, file) => fontkit.openSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
const family = (pkg, weight) => [
  loadFont(pkg, `${pkg}-latin-${weight}-normal.woff`),
  loadFont(pkg, `${pkg}-latin-ext-${weight}-normal.woff`),
];
const F = {
  head: family('bricolage-grotesque', 800),
  body7: family('source-sans-3', 700),
  body6: family('source-sans-3', 600),
};

/** Split text into runs that each use the first font containing all their glyphs. */
function runs(text, fonts) {
  const out = [];
  for (const ch of text) {
    const font = fonts.find((f) => f.hasGlyphForCodePoint(ch.codePointAt(0))) ?? fonts[0];
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ font, text: ch });
  }
  return out;
}
/** Shapes each run with fontkit (kerning included) and hands every glyph outline to draw(). */
function layout(text, fonts, size, x, y, draw) {
  for (const r of runs(text, fonts)) {
    const scale = size / r.font.unitsPerEm;
    const { glyphs, positions } = r.font.layout(r.text);
    glyphs.forEach((g, i) => {
      const p = positions[i];
      // Font units are y-up; flip into SVG space at the pen position.
      if (draw) draw(g.path.toSVG(), `translate(${(x + p.xOffset * scale).toFixed(2)} ${(y - p.yOffset * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})`);
      x += p.xAdvance * scale;
    });
  }
  return x;
}
const measure = (text, fonts, size) => layout(text, fonts, size, 0, 0);
/**
 * SVG for one line of text starting at (x, baseline y): one <path> per glyph, because the
 * SVG renderer truncates very long path attributes. Wrap the result in <g fill="...">.
 */
function textPath(text, fonts, size, x, y) {
  let out = '';
  layout(text, fonts, size, x, y, (d, t) => d && (out += `<path transform="${t}" d="${d}"/>`));
  return out;
}
function wrap(text, fonts, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && measure(test, fonts, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
/** Shrinks the font size until the text fits in maxLines. */
function fit(text, fonts, size, maxWidth, maxLines, min) {
  let lines = wrap(text, fonts, size, maxWidth);
  while (lines.length > maxLines && size > min) {
    size -= 2;
    lines = wrap(text, fonts, size, maxWidth);
  }
  return { size, lines };
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
const W = 1200;
const H = 630;
const PAD = 72;
const COL = 610; // left text column width

const head = fit(headline, F.head, 76, COL, 3, 52);
const sub = fit(subline, F.body7, 34, COL, 2, 24);
const tag = tagline ? fit(tagline, F.body6, 26, COL, 2, 18) : { size: 0, lines: [] };

// Vertically centre the text block between the logo and the bottom edge.
const headLH = head.size * 1.08;
const subLH = sub.size * 1.25;
const tagLH = tag.size * 1.35;
const blockH = head.lines.length * headLH + 34 + sub.lines.length * subLH + (tag.lines.length ? 22 + tag.lines.length * tagLH : 0);
const top = 150 + Math.max(0, (H - 150 - 56 - blockH) / 2);

let y = top + head.size * 0.9;
const headD = head.lines.map((l, i) => textPath(l, F.head, head.size, PAD, y + i * headLH)).join('');
y += (head.lines.length - 1) * headLH + 26;
const barY = y;
y += 8 + sub.size;
const subD = sub.lines.map((l, i) => textPath(l, F.body7, sub.size, PAD, y + i * subLH)).join('');
y += (sub.lines.length - 1) * subLH + 22 + tag.size;
const tagD = tag.lines.map((l, i) => textPath(l, F.body6, tag.size, PAD, y + i * tagLH)).join('');

// Product card (mirrors the CSS mockup on the site): dark cover, lime accents.
const cardX = 800;
const cardY = 92;
const cardW = 330;
const cardH = 446;
const ct = fit(cardTitle, F.head, 38, cardW - 64, 4, 26);
const cl = fit(cardLine, F.body6, 19, cardW - 64, 3, 14);
let cy = cardY + cardH - 64 - (cl.lines.length - 1) * 25 - 34 - (ct.lines.length - 1) * ct.size * 1.08 - 18;
const cardTitleD = ct.lines.map((l, i) => textPath(l, F.head, ct.size, cardX + 32, cy + i * ct.size * 1.08)).join('');
cy += (ct.lines.length - 1) * ct.size * 1.08 + 22;
const cardRuleY = cy;
cy += 30 + 12;
const cardLineD = cl.lines.map((l, i) => textPath(l, F.body6, 19, cardX + 32, cy + i * 25)).join('');
const pillW = measure('PDF', F.body7, 15) + 24;

/* ── Logos (the real SVG files, embedded) ─────────────────────────────────── */
function logoImage(variant, x, y, h) {
  const file = readFileSync(join(ROOT, `public/brand/logo-horizontal-${variant}.svg`), 'utf8');
  const [, vw, vh] = file.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const w = ((h * vw) / vh).toFixed(1);
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/svg+xml;base64,${Buffer.from(file).toString('base64')}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="${W - 470}" y="0" width="470" height="${H}" fill="${C.dark}"/>
  <circle cx="${W + 20}" cy="${H + 40}" r="230" fill="none" stroke="${C.lime}" stroke-opacity="0.14" stroke-width="44"/>

  ${logoImage('light', PAD, 60, 48)}

  <g fill="${C.text}">${headD}</g>
  <rect x="${PAD}" y="${barY}" width="84" height="8" rx="4" fill="${C.accent}"/>
  <g fill="${C.accent}">${subD}</g>
  <g fill="${C.muted}">${tagD}</g>

  <g transform="rotate(4 ${cardX + cardW / 2} ${cardY + cardH / 2})">
    <rect x="${cardX + 14}" y="${cardY + 10}" width="${cardW}" height="${cardH}" rx="20" fill="#2e3a46"/>
  </g>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="${C.dark2}" stroke="#34404c" stroke-width="2"/>
  ${logoImage('dark', cardX + 32, cardY + 34, 24)}
  <rect x="${cardX + cardW - 32 - pillW}" y="${cardY + 32}" width="${pillW}" height="28" rx="14" fill="none" stroke="${C.lime}" stroke-width="1.5"/>
  <g fill="${C.lime}">${textPath('PDF', F.body7, 15, cardX + cardW - 32 - pillW + 12, cardY + 51)}</g>
  ${[0, 1, 2]
    .map(
      (i) => `<rect x="${cardX + 32}" y="${cardY + 96 + i * 30}" width="16" height="16" rx="4" fill="${C.lime}"/>
  <rect x="${cardX + 58}" y="${cardY + 100 + i * 30}" width="${[200, 160, 120][i]}" height="8" rx="4" fill="#34404c"/>`,
    )
    .join('\n  ')}
  <g fill="#ffffff">${cardTitleD}</g>
  <rect x="${cardX + 32}" y="${cardRuleY}" width="58" height="7" rx="3.5" fill="${C.lime}"/>
  <g fill="${C.onDarkMuted}">${cardLineD}</g>
</svg>`;

mkdirSync(dirname(out), { recursive: true });
const info = await svgToJpeg(svg, W, H, out);

console.log(`Wrote ${out.replace(ROOT, '.').replace(/\\/g, '/')} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB (via ${info.via})`);
console.log(`Headline ${head.size}px on ${head.lines.length} line(s): ${head.lines.map((l) => `"${l}"`).join(' / ')}`);
