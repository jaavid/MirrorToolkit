const MIRROR_URL = './mirrors.json';
const STATUS_MODEL = {
  OK: 'ok',
  SLOW: 'slow',
  BLOCKED_BY_BROWSER: 'blocked-by-browser',
  FAILED: 'failed',
  UNTESTED: 'untested'
};
const state = {
  mirrors: [],
  results: [],
  ecosystems: [],
  stats: { totalMirrors: 0, totalEcosystems: 0 },
  version: null,
  activeCategory: 'all',
  loadState: 'loading',
  benchmarkDone: false,
  dockerOptimized: false,
  dockerSummary: null
};
const byId = (id) => document.getElementById(id);
const status = (msg) => { byId('statusMessage').textContent = msg; };

function stableMirrorId(ecosystem, name, url) {
  return `${ecosystem || ''}::${name || ''}::${url || ''}`.trim().toLowerCase();
}

function normalizeMirrorData(rawData) {
  const mirrors = [];
  const ecosystemSet = new Set();
  const source = rawData && typeof rawData === 'object' ? rawData : {};

  const pushMirror = (mirror, ecosystemFromKey = '') => {
    if (!mirror || typeof mirror !== 'object') return;
    const ecosystem = String(ecosystemFromKey || mirror.ecosystem || '').trim();
    const url = String(mirror.url || '').trim();
    if (!ecosystem || !url) return;
    const name = String(mirror.name || mirror.provider || url).trim();
    ecosystemSet.add(ecosystem);
    mirrors.push({ id: stableMirrorId(ecosystem, name, url), name, ecosystem, url, raw: mirror });
  };

  const groupedMirrors = source.mirrors;
  if (groupedMirrors && typeof groupedMirrors === 'object' && !Array.isArray(groupedMirrors)) {
    Object.entries(groupedMirrors).forEach(([ecosystemKey, ecosystemMirrors]) => {
      if (!Array.isArray(ecosystemMirrors)) return;
      ecosystemMirrors.forEach((mirror) => pushMirror(mirror, ecosystemKey));
    });
  }

  if (Array.isArray(source.mirrors)) source.mirrors.forEach((mirror) => pushMirror(mirror));

  const legacyEcosystems = source.ecosystems;
  if (legacyEcosystems && typeof legacyEcosystems === 'object' && !Array.isArray(legacyEcosystems)) {
    Object.entries(legacyEcosystems).forEach(([ecosystemKey, ecosystemValue]) => {
      const mirrorRows = Array.isArray(ecosystemValue) ? ecosystemValue : Array.isArray(ecosystemValue?.mirrors) ? ecosystemValue.mirrors : [];
      mirrorRows.forEach((mirror) => pushMirror(mirror, ecosystemKey));
    });
  }

  const uniqueMirrors = Array.from(new Map(mirrors.map((mirror) => [mirror.id, mirror])).values());
  const ecosystems = Array.from(ecosystemSet).sort((a, b) => a.localeCompare(b));

  return { version: source.version ?? null, mirrors: uniqueMirrors, ecosystems, stats: { totalMirrors: uniqueMirrors.length, totalEcosystems: ecosystems.length } };
}

function setLoadState(nextState, details = {}) {
  state.loadState = nextState;
  const panel = byId('uploadFallback');
  panel.classList.add('hidden');

  if (nextState === 'error') {
    panel.classList.remove('hidden');
    const failedPath = details.path || MIRROR_URL;
    panel.innerHTML = `<h2 class="text-lg font-semibold">Failed to load mirrors.json</h2><p class="mt-2 text-sm text-slate-300">Path: <code>${failedPath}</code></p>`;
  } else if (nextState === 'empty') {
    panel.classList.remove('hidden');
    panel.innerHTML = `<h2 class="text-lg font-semibold">No valid mirrors found</h2><p class="mt-2 text-sm text-slate-300">No entries with both <code>ecosystem</code> and <code>url</code> were found.</p>`;
  }
  updateStepStrip();
}

function updateStepStrip() {
  const steps = ['Load mirrors', 'Run browser check', 'Copy env', 'Paste Dockerfile', 'Download output'];
  let active = 0;
  if (state.loadState === 'loaded' || state.loadState === 'empty') active = 1;
  if (state.benchmarkDone) active = 2;
  if (state.dockerOptimized) active = 4;
  byId('stepStrip').innerHTML = steps.map((step, idx) => `<li class="rounded-full border px-3 py-1 text-xs ${idx === active ? 'border-primary bg-primary/20 text-white' : 'border-slate-700 text-slate-300'}">${idx + 1}. ${step}</li>`).join('');
}

function rankStatus(value) {
  if (value === STATUS_MODEL.OK) return 0;
  if (value === STATUS_MODEL.SLOW) return 1;
  if (value === STATUS_MODEL.UNTESTED) return 2;
  if (value === STATUS_MODEL.BLOCKED_BY_BROWSER) return 3;
  return 4;
}

function pickBestMirror(results, ecosystems) {
  const candidates = results.filter((r) => ecosystems.includes(r.ecosystem.toLowerCase()) && r.status !== STATUS_MODEL.FAILED);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const s = rankStatus(a.status) - rankStatus(b.status);
    if (s !== 0) return s;
    return (a.latency ?? Infinity) - (b.latency ?? Infinity);
  })[0];
}

function mirrorComments(mirror) {
  const lines = [`# status: ${mirror.status}`];
  if (Number.isFinite(mirror.latency)) lines.push(`# latency: ${mirror.latency}ms`);
  if (mirror.status === STATUS_MODEL.UNTESTED) lines.push('# note: run browser check or CLI benchmark before production use');
  if (mirror.status === STATUS_MODEL.BLOCKED_BY_BROWSER) lines.push('# note: browser could not verify this mirror because of CORS');
  return lines;
}

function generateEnvSnippets(results) {
  const out = [];
  const docker = pickBestMirror(results, ['docker']);
  out.push('### Docker');
  if (docker) out.push(...mirrorComments(docker), `DOCKER_REGISTRY_MIRROR=${docker.url}`, '# note: Docker daemon may require registry-mirrors configuration');
  else out.push('# No usable docker mirror detected');

  const npm = pickBestMirror(results, ['npm']);
  out.push('', '### npm');
  if (npm) out.push(...mirrorComments(npm), `NPM_CONFIG_REGISTRY=${npm.url}`);
  else out.push('# No usable npm mirror detected');

  const pypi = pickBestMirror(results, ['pip', 'pypi', 'python']);
  out.push('', '### pip / pypi');
  if (pypi) out.push(...mirrorComments(pypi), `PIP_INDEX_URL=${pypi.url}`, 'PIP_EXTRA_INDEX_URL=https://pypi.org/simple');
  else out.push('# No usable pip/pypi mirror detected');

  const ubuntu = pickBestMirror(results, ['ubuntu', 'apt']);
  const debian = pickBestMirror(results, ['debian', 'apt']);
  out.push('', '### apt / ubuntu / debian');
  if (ubuntu) out.push(...mirrorComments(ubuntu), `APT_UBUNTU_MIRROR=${ubuntu.url}`);
  else out.push('# No usable ubuntu mirror detected');
  if (debian) out.push(...mirrorComments(debian), `APT_DEBIAN_MIRROR=${debian.url}`);
  else out.push('# No usable debian mirror detected');

  return out.join('\n');
}

function renderSummary() {
  const rows = state.results;
  const okOrSlow = rows.filter((r) => r.status === STATUS_MODEL.OK || r.status === STATUS_MODEL.SLOW);
  const cards = [
    ['Total mirrors', state.stats.totalMirrors],
    ['Total ecosystems', state.stats.totalEcosystems],
    ['OK/Slow', okOrSlow.length]
  ];
  byId('summaryCards').innerHTML = cards.map(([k, v]) => `<article class="rounded-xl border border-slate-800 bg-surface/70 p-3"><p class="text-xs text-slate-400">${k}</p><p class="mt-1 text-sm font-semibold break-words">${v}</p></article>`).join('');
  byId('envOutput').value = generateEnvSnippets(rows);
}

function renderFilters() { /* unchanged */
  byId('filters').innerHTML = ['all', ...state.ecosystems].map((category) => `<button data-cat="${category}" class="rounded-full border px-3 py-1 text-xs ${state.activeCategory === category ? 'border-primary bg-primary/20' : 'border-slate-700'}">${category}</button>`).join('');
  byId('filters').querySelectorAll('button').forEach((btn) => { btn.onclick = () => { state.activeCategory = btn.dataset.cat; renderRows(); }; });
}

function renderRows() { /* unchanged-ish */
  const filtered = state.results.filter((r) => state.activeCategory === 'all' || r.ecosystem === state.activeCategory);
  byId('latencyRows').innerHTML = filtered.map((r) => `<article class="rounded-xl border p-3 border-slate-800 bg-surface/70"><p class="font-semibold">${r.name}</p><p class="text-xs">${r.ecosystem}</p><p class="text-xs">${r.url}</p><p class="text-xs mt-1">${r.status} ${Number.isFinite(r.latency) ? `(${r.latency}ms)` : ''}</p></article>`).join('');
}

function optimizeDockerfile(input) {
  const lines = input.split(/\r?\n/); const out = []; const inserted = []; let baseImage = null;
  for (const line of lines) {
    if (!baseImage && /^\s*FROM\s+(.+)/i.test(line)) baseImage = line.match(/^\s*FROM\s+(.+)/i)[1].trim();
    out.push(line);
  }
  if (baseImage) {
    const argLines = ['ARG NPM_CONFIG_REGISTRY', 'ARG PIP_INDEX_URL', 'ARG APT_UBUNTU_MIRROR', 'ARG APT_DEBIAN_MIRROR'];
    const firstFrom = out.findIndex((l) => /^\s*FROM\s+/i.test(l));
    argLines.forEach((arg) => { if (!out.some((l) => l.trim() === arg)) { out.splice(firstFrom + 1, 0, arg); inserted.push(arg); } });
  }
  return { text: out.join('\n'), summary: { baseImage: baseImage || 'not detected', insertedArgs: inserted, warnings: baseImage ? [] : ['No FROM line detected; no ARG lines inserted.'] } };
}

async function loadMirrors() {
  setLoadState('loading'); status('Loading mirrors.json...');
  try { const res = await fetch(MIRROR_URL, { cache: 'no-store' }); if (!res.ok) throw new Error(); useMirrors(await res.json()); }
  catch { state.mirrors = []; state.results = []; state.ecosystems = []; state.stats = { totalMirrors: 0, totalEcosystems: 0 }; setLoadState('error', { path: MIRROR_URL }); renderFilters(); renderSummary(); renderRows(); status('Could not load mirrors.json. Upload a file to continue.'); }
}

function useMirrors(data) {
  const normalized = normalizeMirrorData(data);
  state.mirrors = normalized.mirrors;
  state.results = normalized.mirrors.map((mirror) => ({ ...mirror, status: STATUS_MODEL.UNTESTED, latency: null, reason: '' }));
  state.ecosystems = normalized.ecosystems;
  state.stats = normalized.stats;
  state.benchmarkDone = false;
  setLoadState(state.mirrors.length === 0 ? 'empty' : 'loaded');
  renderFilters(); renderSummary(); renderRows(); updateStepStrip();
  status(state.mirrors.length === 0 ? 'Loaded but no valid mirrors found.' : `mirrors.json loaded (${state.stats.totalMirrors} mirrors across ${state.stats.totalEcosystems} ecosystems).`);
}

async function benchmarkOne(mirror) {
  const start = performance.now();
  try { const response = await fetch(mirror.url, { mode: 'cors', cache: 'no-store' }); const latency = Math.round(performance.now() - start); if (!response.ok) return { status: STATUS_MODEL.FAILED, latency }; return { status: latency > 1500 ? STATUS_MODEL.SLOW : STATUS_MODEL.OK, latency }; }
  catch { return { status: STATUS_MODEL.BLOCKED_BY_BROWSER, latency: Math.round(performance.now() - start) }; }
}

async function runBenchmark() {
  status('Benchmark in progress...'); state.results = [];
  for (const mirror of state.mirrors) state.results.push({ ...mirror, ...(await benchmarkOne(mirror)) });
  state.benchmarkDone = true; renderSummary(); renderRows(); updateStepStrip(); status('Benchmark completed.');
}

function download(name, data) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click(); }

document.addEventListener('DOMContentLoaded', async () => {
  byId('runBenchmark').onclick = runBenchmark;
  byId('uploadMirrorsBtn').onclick = () => byId('mirrorsUpload').click();
  byId('mirrorsUpload').onchange = async (e) => {
    try {
      const text = await e.target.files[0].text();
      useMirrors(JSON.parse(text));
      status('Uploaded mirrors.json loaded.');
    } catch {
      setLoadState('error', { path: 'uploaded file' });
      status('Invalid JSON file');
    }
  };
  byId('copyEnvBtn').onclick = async () => navigator.clipboard.writeText(byId('envOutput').value || '');
  byId('downloadReportBtn').onclick = () => download('mirror-report.json', JSON.stringify(state.results, null, 2));
  byId('optimizeDocker').onclick = () => {
    const { text, summary } = optimizeDockerfile(byId('dockerInput').value || '');
    state.dockerOptimized = true;
    state.dockerSummary = summary;
    byId('dockerOutput').textContent = text;
    byId('dockerSummary').innerHTML = `<p>base image detected: <span class="text-slate-200">${summary.baseImage}</span></p><p>inserted ARG lines: <span class="text-slate-200">${summary.insertedArgs.length ? summary.insertedArgs.join(', ') : 'none'}</span></p><p>warnings: <span class="text-slate-200">${summary.warnings.length ? summary.warnings.join('; ') : 'none'}</span></p>`;
    updateStepStrip();
  };
  byId('copyDocker').onclick = async () => navigator.clipboard.writeText(byId('dockerOutput').textContent || '');
  byId('downloadDocker').onclick = () => download('Dockerfile.optimized', byId('dockerOutput').textContent || '');
  byId('dockerUpload').onchange = async (e) => { byId('dockerInput').value = await e.target.files[0].text(); };
  updateStepStrip();
  await loadMirrors();
});
