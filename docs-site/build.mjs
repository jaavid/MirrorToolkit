import { cp, mkdir, rm, readFile, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
  p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed`)));
});

async function clean() { await rm(dist, { recursive: true, force: true }); await mkdir(path.join(dist, 'assets'), { recursive: true }); }

if (process.argv.includes('--clean')) { await clean(); process.exit(0); }

await clean();
await run('npm', ['run', 'build:css']);
for (const f of ['index.html', 'app.js', 'sample-report.json']) await cp(path.join(src, f), path.join(dist, f));
await cp(path.join(src, 'assets'), path.join(dist, 'assets'), { recursive: true });
try {
  await access(path.join(root, '..', 'mirrors.json'));
  await cp(path.join(root, '..', 'mirrors.json'), path.join(dist, 'mirrors.json'));
} catch {}

const htmlPath = path.join(dist, 'index.html');
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replaceAll('src/', './').replaceAll('href="/','href="./'));
