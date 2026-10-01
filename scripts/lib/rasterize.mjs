/**
 * Renders an SVG string to a JPG file.
 *
 * Uses sharp when it loads. On PCs where native modules are blocked (Windows Application Control),
 * it falls back to headless Chrome/Edge for the render and pure-JS pngjs + jpeg-js for the encode.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** @returns {Promise<{ width: number, height: number, size: number, via: string }>} */
export async function svgToJpeg(svg, width, height, out, { quality = 86 } = {}) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
    await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
  } catch {
    sharp = null;
  }
  if (sharp) {
    const info = await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toFile(out);
    return { width: info.width, height: info.height, size: info.size, via: 'sharp' };
  }

  const browser = BROWSERS.find(existsSync);
  if (!browser) throw new Error('sharp is unavailable and no Chrome/Edge was found to render with');
  const { PNG } = await import('pngjs');
  const jpeg = (await import('jpeg-js')).default;

  const dir = mkdtempSync(join(tmpdir(), 'raster-'));
  try {
    const html = join(dir, 'page.html');
    const png = join(dir, 'shot.png');
    writeFileSync(html, `<!doctype html><html><body style="margin:0;overflow:hidden">${svg}</body></html>`);
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${width},${height}`, `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
    const img = PNG.sync.read(readFileSync(png));
    const data = jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data;
    writeFileSync(out, data);
    return { width: img.width, height: img.height, size: data.length, via: 'chrome' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
