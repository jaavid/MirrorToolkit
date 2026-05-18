import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFile(path.join(root, p), 'utf8');

const failures = [];
const indexHtml = await read('src/index.html');
const inputCss = await read('src/input.css');
const appJs = await read('src/app.js');

if (!/html[^>]*\blang=["']fa["']/i.test(indexHtml)) failures.push('index.html must include lang="fa" on <html>.');
if (!/html[^>]*\bdir=["']rtl["']/i.test(indexHtml)) failures.push('index.html must include dir="rtl" on <html>.');
if (!/href=["'][^"']*assets\/vendor\/flag-icons\/flag-icons\.min\.css["']/.test(indexHtml)) failures.push('index.html must include local flag-icons stylesheet.');
if (!/\.font-brand\b/.test(inputCss)) failures.push('input.css must define .font-brand.');
if (!/\.technical\b/.test(inputCss)) failures.push('input.css must define .technical.');
if (!/function\s+getRegionBadge\s*\(/.test(appJs)) failures.push('app.js must contain getRegionBadge().');
for (const label of ['سالم', 'کند', 'محدودیت مرورگر', 'ناموفق', 'بررسی\u200cنشده']) {
  if (!appJs.includes(label)) failures.push(`app.js must contain Persian status label: ${label}`);
}
if (/https:\/\/(?:cdn|unpkg|jsdelivr|fonts\.googleapis)/i.test(indexHtml)) failures.push('index.html contains forbidden CDN URL.');

if (failures.length) {
  console.error('UI identity contract check failed:');
  failures.forEach((msg, i) => console.error(`${i + 1}. ${msg}`));
  process.exit(1);
}

console.log('UI identity contract check passed.');
