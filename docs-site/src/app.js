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

function getEcosystemIcon(ecosystem) {
  const key = String(ecosystem || '').toLowerCase();
  const map = {
    docker: 'docker.svg', npm: 'npm.svg', pypi: 'python.svg', pip: 'python.svg', python: 'python.svg',
    node: 'node.svg', ubuntu: 'ubuntu.svg', debian: 'debian.svg', alpine: 'alpine.svg', github: 'github.svg',
    gitlab: 'gitlab.svg', java: 'java.svg', maven: 'maven.svg', go: 'go.svg', rust: 'rust.svg', apt: 'debian.svg'
  };
  const file = map[key] || null;
  return file ? `./assets/icons/${file}` : '';
}

function statusBadge(statusValue) {
  const tone = {
    [STATUS_MODEL.OK]: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    [STATUS_MODEL.SLOW]: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    [STATUS_MODEL.BLOCKED_BY_BROWSER]: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    [STATUS_MODEL.FAILED]: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    [STATUS_MODEL.UNTESTED]: 'border-slate-500/40 bg-slate-500/10 text-slate-300'
  };
  const labelsFa = {
    [STATUS_MODEL.OK]: 'سالم',
    [STATUS_MODEL.SLOW]: 'کند',
    [STATUS_MODEL.BLOCKED_BY_BROWSER]: 'محدودیت مرورگر',
    [STATUS_MODEL.FAILED]: 'ناموفق',
    [STATUS_MODEL.UNTESTED]: 'بررسی‌نشده'
  };
  const rawLabel = String(statusValue || STATUS_MODEL.UNTESTED);
  const label = labelsFa[rawLabel] || labelsFa[STATUS_MODEL.UNTESTED];
  return `<span title="${rawLabel}" aria-label="${rawLabel}" class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone[statusValue] || tone[STATUS_MODEL.UNTESTED]}">${label}</span>`;
}

function getRegionBadge(raw = {}) {
  const region = String(raw.country || raw.country_code || raw.region || '').trim();
  if (!region) return '';
  const alpha2 = region.length === 2 ? region.toLowerCase() : '';
  const allowedFlags = new Set(['ir', 'jp', 'fr', 'cn', 'nl', 'us', 'ru', 'de', 'gb']);
  if (alpha2 && allowedFlags.has(alpha2)) {
    return `<span class="technical inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300"><span class="fi fi-${alpha2}"></span>${alpha2.toUpperCase()}</span>`;
  }
  return `<span class="technical inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">${region}</span>`;
}

function normalizeMirrorData(rawData) { /* unchanged logic */
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
  if (groupedMirrors && typeof groupedMirrors === 'object' && !Array.isArray(groupedMirrors)) Object.entries(groupedMirrors).forEach(([k, arr]) => Array.isArray(arr) && arr.forEach((m) => pushMirror(m, k)));
  if (Array.isArray(source.mirrors)) source.mirrors.forEach((mirror) => pushMirror(mirror));
  const legacyEcosystems = source.ecosystems;
  if (legacyEcosystems && typeof legacyEcosystems === 'object' && !Array.isArray(legacyEcosystems)) Object.entries(legacyEcosystems).forEach(([k, v]) => (Array.isArray(v) ? v : Array.isArray(v?.mirrors) ? v.mirrors : []).forEach((m) => pushMirror(m, k)));
  const uniqueMirrors = Array.from(new Map(mirrors.map((mirror) => [mirror.id, mirror])).values());
  const ecosystems = Array.from(ecosystemSet).sort((a, b) => a.localeCompare(b));
  return { version: source.version ?? null, mirrors: uniqueMirrors, ecosystems, stats: { totalMirrors: uniqueMirrors.length, totalEcosystems: ecosystems.length } };
}

function setLoadState(nextState, details = {}) {
  state.loadState = nextState;
  const panel = byId('uploadFallback');
  panel.classList.add('hidden');
  if (nextState === 'loading') {
    panel.classList.remove('hidden');
    panel.innerHTML = `<h2 class="text-base font-semibold">Loading mirrors.json</h2><p class="mt-1 text-sm text-slate-300">Attempting to read <code>${MIRROR_URL}</code> ...</p>`;
  } else if (nextState === 'error') {
    panel.classList.remove('hidden');
    const failedPath = details.path || MIRROR_URL;
    panel.innerHTML = `<h2 class="text-base font-semibold">Failed to load mirrors.json</h2><p class="mt-1 text-sm text-slate-300">Path: <code>${failedPath}</code></p>`;
  } else if (nextState === 'empty') {
    panel.classList.remove('hidden');
    panel.innerHTML = `<h2 class="text-base font-semibold">No valid mirrors found</h2><p class="mt-1 text-sm text-slate-300">No entries with both <code>ecosystem</code> and <code>url</code> were found.</p>`;
  }
  updateStepStrip();
}

function updateStepStrip() { const steps = ['Load mirrors', 'Run browser check', 'Copy env', 'Paste Dockerfile', 'Download output']; let active = 0; if (state.loadState === 'loaded' || state.loadState === 'empty') active = 1; if (state.benchmarkDone) active = 2; if (state.dockerOptimized) active = 4; byId('stepStrip').innerHTML = steps.map((step, idx) => `<li class="rounded-full border px-3 py-1 text-xs ${idx <= active ? 'border-primary/70 bg-primary/15 text-slate-100' : 'border-slate-700 text-slate-400'}">${idx + 1}. ${step}</li>`).join(''); }
function rankStatus(value) { if (value === STATUS_MODEL.OK) return 0; if (value === STATUS_MODEL.SLOW) return 1; if (value === STATUS_MODEL.UNTESTED) return 2; if (value === STATUS_MODEL.BLOCKED_BY_BROWSER) return 3; return 4; }
function pickBestMirror(results, ecosystems) { const candidates = results.filter((r) => ecosystems.includes(r.ecosystem.toLowerCase()) && r.status !== STATUS_MODEL.FAILED); if (!candidates.length) return null; return candidates.sort((a, b) => { const s = rankStatus(a.status) - rankStatus(b.status); if (s !== 0) return s; return (a.latency ?? Infinity) - (b.latency ?? Infinity); })[0]; }
function mirrorComments(mirror) { const lines = [`# status: ${mirror.status}`]; if (Number.isFinite(mirror.latency)) lines.push(`# latency: ${mirror.latency}ms`); if (mirror.status === STATUS_MODEL.UNTESTED) lines.push('# note: run browser check or CLI benchmark before production use'); if (mirror.status === STATUS_MODEL.BLOCKED_BY_BROWSER) lines.push('# note: browser could not verify this mirror because of CORS'); return lines; }
function generateEnvSnippets(results) { const out = []; const docker = pickBestMirror(results, ['docker']); out.push('### Docker'); if (docker) out.push(...mirrorComments(docker), `DOCKER_REGISTRY_MIRROR=${docker.url}`, '# note: Docker daemon may require registry-mirrors configuration'); else out.push('# No usable docker mirror detected'); const npm = pickBestMirror(results, ['npm']); out.push('', '### npm'); if (npm) out.push(...mirrorComments(npm), `NPM_CONFIG_REGISTRY=${npm.url}`); else out.push('# No usable npm mirror detected'); const pypi = pickBestMirror(results, ['pip', 'pypi', 'python']); out.push('', '### pip / pypi'); if (pypi) out.push(...mirrorComments(pypi), `PIP_INDEX_URL=${pypi.url}`, 'PIP_EXTRA_INDEX_URL=https://pypi.org/simple'); else out.push('# No usable pip/pypi mirror detected'); const ubuntu = pickBestMirror(results, ['ubuntu', 'apt']); const debian = pickBestMirror(results, ['debian', 'apt']); out.push('', '### apt / ubuntu / debian'); if (ubuntu) out.push(...mirrorComments(ubuntu), `APT_UBUNTU_MIRROR=${ubuntu.url}`); else out.push('# No usable ubuntu mirror detected'); if (debian) out.push(...mirrorComments(debian), `APT_DEBIAN_MIRROR=${debian.url}`); else out.push('# No usable debian mirror detected'); return out.join('\n'); }

function renderSummary() { const rows = state.results; const okOrSlow = rows.filter((r) => r.status === STATUS_MODEL.OK || r.status === STATUS_MODEL.SLOW); const cards = [['Mirrors', state.stats.totalMirrors], ['Ecosystems', state.stats.totalEcosystems], ['Ready', okOrSlow.length]]; byId('summaryCards').innerHTML = cards.map(([k, v]) => `<article class="rounded-lg border border-slate-800 bg-surface/70 p-2.5"><p class="text-[11px] uppercase tracking-wide text-slate-400">${k}</p><p class="mt-1 text-base font-semibold">${v}</p></article>`).join(''); byId('envOutput').value = generateEnvSnippets(rows); }

function renderFilters() { byId('filters').innerHTML = ['all', ...state.ecosystems].map((category) => { const icon = getEcosystemIcon(category); return `<button data-cat="${category}" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${state.activeCategory === category ? 'border-primary bg-primary/20' : 'border-slate-700'}">${icon ? `<img src="${icon}" alt="" class="h-4 w-4">` : ''}<span>${category}</span></button>`; }).join(''); byId('filters').querySelectorAll('button').forEach((btn) => { btn.onclick = () => { state.activeCategory = btn.dataset.cat; renderRows(); }; }); }

function renderRows() { const filtered = state.results.filter((r) => state.activeCategory === 'all' || r.ecosystem === state.activeCategory); byId('latencyRows').innerHTML = filtered.map((r) => { const icon = getEcosystemIcon(r.ecosystem); const region = getRegionBadge(r.raw); return `<article class="rounded-lg border border-slate-800 bg-surface/70 p-2.5"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="flex items-center gap-2 font-semibold text-sm">${icon ? `<img src="${icon}" alt="" class="h-4 w-4">` : ''}<span class="truncate">${r.name}</span></p><p class="technical mt-0.5 text-[11px] text-slate-400">${r.ecosystem}</p><p class="technical mt-1 truncate text-xs text-slate-300">${r.url}</p></div><div class="shrink-0 text-right">${statusBadge(r.status)}${Number.isFinite(r.latency) ? `<p class="mt-1 text-[11px] text-slate-400">${r.latency}ms</p>` : ''}${region ? `<div class="mt-1">${region}</div>` : ''}</div></div></article>`; }).join(''); }

function optimizeDockerfile(input) { const lines = input.split(/\r?\n/); const out = []; const inserted = []; let baseImage = null; for (const line of lines) { if (!baseImage && /^\s*FROM\s+(.+)/i.test(line)) baseImage = line.match(/^\s*FROM\s+(.+)/i)[1].trim(); out.push(line);} if (baseImage) { const argLines = ['ARG NPM_CONFIG_REGISTRY', 'ARG PIP_INDEX_URL', 'ARG APT_UBUNTU_MIRROR', 'ARG APT_DEBIAN_MIRROR']; const firstFrom = out.findIndex((l) => /^\s*FROM\s+/i.test(l)); argLines.forEach((arg) => { if (!out.some((l) => l.trim() === arg)) { out.splice(firstFrom + 1, 0, arg); inserted.push(arg); } }); } return { text: out.join('\n'), summary: { baseImage: baseImage || 'not detected', insertedArgs: inserted, warnings: baseImage ? [] : ['No FROM line detected; no ARG lines inserted.'] } }; }

async function loadMirrors() { setLoadState('loading'); status('Loading mirrors.json...'); try { const res = await fetch(MIRROR_URL, { cache: 'no-store' }); if (!res.ok) throw new Error(); useMirrors(await res.json()); } catch { state.mirrors = []; state.results = []; state.ecosystems = []; state.stats = { totalMirrors: 0, totalEcosystems: 0 }; setLoadState('error', { path: MIRROR_URL }); renderFilters(); renderSummary(); renderRows(); status('Could not load mirrors.json. Upload a file to continue.'); } }
function useMirrors(data) { const normalized = normalizeMirrorData(data); state.mirrors = normalized.mirrors; state.results = normalized.mirrors.map((mirror) => ({ ...mirror, status: STATUS_MODEL.UNTESTED, latency: null, reason: '' })); state.ecosystems = normalized.ecosystems; state.stats = normalized.stats; state.benchmarkDone = false; setLoadState(state.mirrors.length === 0 ? 'empty' : 'loaded'); renderFilters(); renderSummary(); renderRows(); updateStepStrip(); status(state.mirrors.length === 0 ? 'Loaded but no valid mirrors found.' : `mirrors.json loaded (${state.stats.totalMirrors} mirrors across ${state.stats.totalEcosystems} ecosystems).`); }
async function benchmarkOne(mirror) { const start = performance.now(); try { const response = await fetch(mirror.url, { mode: 'cors', cache: 'no-store' }); const latency = Math.round(performance.now() - start); if (!response.ok) return { status: STATUS_MODEL.FAILED, latency }; return { status: latency > 1500 ? STATUS_MODEL.SLOW : STATUS_MODEL.OK, latency }; } catch { return { status: STATUS_MODEL.BLOCKED_BY_BROWSER, latency: Math.round(performance.now() - start) }; } }
async function runBenchmark() { status('Benchmark in progress...'); state.results = []; for (const mirror of state.mirrors) state.results.push({ ...mirror, ...(await benchmarkOne(mirror)) }); state.benchmarkDone = true; renderSummary(); renderRows(); updateStepStrip(); status('Benchmark completed.'); }
function download(name, data) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click(); }

document.addEventListener('DOMContentLoaded', async () => {
  byId('runBenchmark').onclick = runBenchmark;
  byId('uploadMirrorsBtn').onclick = () => byId('mirrorsUpload').click();
  byId('mirrorsUpload').onchange = async (e) => { try { const text = await e.target.files[0].text(); useMirrors(JSON.parse(text)); status('Uploaded mirrors.json loaded.'); } catch { setLoadState('error', { path: 'uploaded file' }); byId('uploadFallback').classList.remove('border-warning/60', 'bg-warning/10'); byId('uploadFallback').classList.add('border-rose-500/50', 'bg-rose-500/10'); byId('uploadFallback').innerHTML = '<h2 class="text-base font-semibold">Invalid uploaded JSON</h2><p class="mt-1 text-sm text-slate-300">Please upload a valid mirrors.json payload.</p>'; status('Invalid JSON file'); } };
  byId('copyEnvBtn').onclick = async () => navigator.clipboard.writeText(byId('envOutput').value || '');
  byId('downloadReportBtn').onclick = () => download('mirror-report.json', JSON.stringify(state.results, null, 2));
  byId('optimizeDocker').onclick = () => { const { text, summary } = optimizeDockerfile(byId('dockerInput').value || ''); state.dockerOptimized = true; state.dockerSummary = summary; byId('dockerOutput').textContent = text; byId('dockerSummary').innerHTML = `<p>base image detected: <span class="text-slate-200">${summary.baseImage}</span></p><p>inserted ARG lines: <span class="text-slate-200">${summary.insertedArgs.length ? summary.insertedArgs.join(', ') : 'none'}</span></p><p>warnings: <span class="text-slate-200">${summary.warnings.length ? summary.warnings.join('; ') : 'none'}</span></p>`; updateStepStrip(); };
  byId('copyDocker').onclick = async () => navigator.clipboard.writeText(byId('dockerOutput').textContent || '');
  byId('downloadDocker').onclick = () => download('Dockerfile.optimized', byId('dockerOutput').textContent || '');
  byId('dockerUpload').onchange = async (e) => { byId('dockerInput').value = await e.target.files[0].text(); };
  updateStepStrip();
  await loadMirrors();
});
