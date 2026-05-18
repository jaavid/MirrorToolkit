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
  loadState: 'loading'
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
    mirrors.push({
      id: stableMirrorId(ecosystem, name, url),
      name,
      ecosystem,
      url,
      homepage: mirror.homepage,
      country: mirror.country || mirror.region,
      provider: mirror.provider,
      tags: Array.isArray(mirror.tags) ? mirror.tags : undefined,
      raw: mirror
    });
  };

  const groupedMirrors = source.mirrors;
  if (groupedMirrors && typeof groupedMirrors === 'object' && !Array.isArray(groupedMirrors)) {
    Object.entries(groupedMirrors).forEach(([ecosystemKey, ecosystemMirrors]) => {
      if (!Array.isArray(ecosystemMirrors)) return;
      ecosystemMirrors.forEach((mirror) => pushMirror(mirror, ecosystemKey));
    });
  }

  if (Array.isArray(source.mirrors)) {
    source.mirrors.forEach((mirror) => pushMirror(mirror));
  }

  const legacyEcosystems = source.ecosystems;
  if (legacyEcosystems && typeof legacyEcosystems === 'object' && !Array.isArray(legacyEcosystems)) {
    Object.entries(legacyEcosystems).forEach(([ecosystemKey, ecosystemValue]) => {
      const mirrorRows = Array.isArray(ecosystemValue)
        ? ecosystemValue
        : Array.isArray(ecosystemValue?.mirrors)
          ? ecosystemValue.mirrors
          : [];
      mirrorRows.forEach((mirror) => pushMirror(mirror, ecosystemKey));
    });
  }

  const uniqueMirrors = Array.from(new Map(mirrors.map((mirror) => [mirror.id, mirror])).values());
  const ecosystems = Array.from(ecosystemSet).sort((a, b) => a.localeCompare(b));

  return {
    version: source.version ?? null,
    mirrors: uniqueMirrors,
    ecosystems,
    stats: {
      totalMirrors: uniqueMirrors.length,
      totalEcosystems: ecosystems.length
    }
  };
}

function setLoadState(nextState, details = {}) {
  state.loadState = nextState;
  const panel = byId('uploadFallback');
  panel.classList.add('hidden');

  if (nextState === 'error') {
    panel.classList.remove('hidden');
    const failedPath = details.path || MIRROR_URL;
    panel.innerHTML = `
      <h2 class="text-lg font-semibold">Failed to load mirrors.json</h2>
      <p class="mt-2 text-sm text-slate-300">Path: <code>${failedPath}</code></p>
      <p class="mt-2 text-sm text-slate-300">Likely cause: file is missing, blocked, or has invalid JSON.</p>
      <p class="mt-2 text-sm text-slate-300">Suggested action: verify <code>${failedPath}</code> exists beside this page, then refresh or upload mirrors.json manually.</p>
    `;
  } else if (nextState === 'empty') {
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <h2 class="text-lg font-semibold">No valid mirrors found</h2>
      <p class="mt-2 text-sm text-slate-300">mirrors.json loaded, but no entries with both <code>ecosystem</code> and <code>url</code> were found.</p>
      <p class="mt-2 text-sm text-slate-300">Suggested action: review schema and upload a corrected mirrors.json.</p>
    `;
  }
}

async function loadMirrors() {
  setLoadState('loading');
  status('Loading mirrors.json...');
  try {
    const res = await fetch(MIRROR_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawData = await res.json();
    useMirrors(rawData);
  } catch {
    state.mirrors = [];
    state.results = [];
    state.ecosystems = [];
    state.stats = { totalMirrors: 0, totalEcosystems: 0 };
    setLoadState('error', { path: MIRROR_URL });
    renderFilters();
    renderSummary();
    renderRows();
    status('Could not load mirrors.json. Upload a file to continue.');
  }
}

function useMirrors(data) {
  const normalized = normalizeMirrorData(data);
  state.version = normalized.version;
  state.mirrors = normalized.mirrors;
  state.results = normalized.mirrors.map((mirror) => ({ ...mirror, status: STATUS_MODEL.UNTESTED, latency: null, reason: '' }));
  state.ecosystems = normalized.ecosystems;
  state.stats = normalized.stats;

  if (state.mirrors.length === 0) {
    setLoadState('empty');
    status('mirrors.json loaded, but no valid mirrors were found.');
  } else {
    setLoadState('loaded');
    status(`mirrors.json loaded (${state.stats.totalMirrors} mirrors across ${state.stats.totalEcosystems} ecosystems).`);
  }

  renderFilters();
  renderSummary();
  renderRows();
}

async function benchmarkOne(mirror) {
  const start = performance.now();
  try {
    const response = await fetch(mirror.url, { mode: 'cors', cache: 'no-store' });
    const latency = Math.round(performance.now() - start);
    if (!response.ok) return { status: STATUS_MODEL.FAILED, latency, reason: `HTTP ${response.status}` };
    return { status: latency > 1500 ? STATUS_MODEL.SLOW : STATUS_MODEL.OK, latency, reason: '' };
  } catch {
    const latency = Math.round(performance.now() - start);
    return { status: STATUS_MODEL.BLOCKED_BY_BROWSER, latency, reason: 'Request blocked by browser policy (CORS/opaque).' };
  }
}

function statusPill(value) {
  if (value === STATUS_MODEL.OK) return '<span class="rounded bg-success/20 px-2 py-1">OK</span>';
  if (value === STATUS_MODEL.SLOW) return '<span class="rounded bg-warning/20 px-2 py-1">Slow</span>';
  if (value === STATUS_MODEL.BLOCKED_BY_BROWSER) return '<span class="rounded bg-warning/20 px-2 py-1">Blocked by browser</span>';
  if (value === STATUS_MODEL.FAILED) return '<span class="rounded bg-danger/20 px-2 py-1">Failed</span>';
  return '<span class="rounded bg-slate-700/60 px-2 py-1">Untested</span>';
}

function renderSummary() {
  const rows = state.results;
  const okOrSlow = rows.filter((r) => r.status === STATUS_MODEL.OK || r.status === STATUS_MODEL.SLOW);
  const failed = rows.filter((r) => r.status === STATUS_MODEL.FAILED);
  const blocked = rows.filter((r) => r.status === STATUS_MODEL.BLOCKED_BY_BROWSER);
  const tested = rows.filter((r) => r.status !== STATUS_MODEL.UNTESTED);
  const fastest = okOrSlow.slice().sort((a, b) => (a.latency || Infinity) - (b.latency || Infinity))[0];

  const cards = [
    ['Total mirrors', state.stats.totalMirrors],
    ['Total ecosystems', state.stats.totalEcosystems],
    ['OK/Slow', okOrSlow.length],
    ['Blocked by browser', blocked.length],
    ['Failed', failed.length],
    ['Tested', tested.length],
    ['Fastest overall', fastest ? `${fastest.name} (${fastest.latency}ms)` : '-']
  ];

  byId('summaryCards').innerHTML = cards
    .map(([k, v]) => `<article class="rounded-xl border border-slate-800 bg-surface/70 p-3"><p class="text-xs text-slate-400">${k}</p><p class="mt-1 text-sm font-semibold break-words">${v}</p></article>`)
    .join('');

  byId('envOutput').value = okOrSlow.map((r) => `${r.ecosystem.toUpperCase()}_MIRROR=${r.url}`).join('\n');
}

function renderFilters() {
  byId('filters').innerHTML = ['all', ...state.ecosystems]
    .map((category) => `<button data-cat="${category}" class="rounded-full border px-3 py-1 text-xs ${state.activeCategory === category ? 'border-primary bg-primary/20' : 'border-slate-700'}">${category}</button>`)
    .join('');
  byId('filters').querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      state.activeCategory = btn.dataset.cat;
      renderRows();
    };
  });
}

function renderRows() {
  const filtered = state.results.filter((r) => state.activeCategory === 'all' || r.ecosystem === state.activeCategory);
  const measurable = filtered.filter((x) => x.status === STATUS_MODEL.OK || x.status === STATUS_MODEL.SLOW);
  const fastestLatency = Math.min(...measurable.map((x) => x.latency), Infinity);

  byId('latencyRows').innerHTML = filtered
    .map((r) => {
      const isFailed = r.status === STATUS_MODEL.FAILED;
      const untested = r.status === STATUS_MODEL.UNTESTED;
      const fastest = r.latency === fastestLatency && Number.isFinite(r.latency);
      const bar = isFailed || untested || !Number.isFinite(r.latency) ? 0 : Math.max(6, Math.min(100, 100 - Math.round((r.latency / 3000) * 100)));
      return `<article class="rounded-xl border p-3 ${fastest ? 'border-success bg-success/10' : isFailed ? 'border-danger/60 bg-danger/10 opacity-80' : 'border-slate-800 bg-surface/70'}"><div class="md:hidden space-y-1"><p class="font-semibold">${r.name}</p><p class="text-xs">${r.ecosystem}</p><p class="truncate text-xs text-slate-400">${r.url}</p></div><div class="hidden md:grid md:grid-cols-12 md:gap-2 md:items-center"><p class="col-span-2 font-semibold truncate">${r.name}</p><p class="col-span-2 text-xs">${r.ecosystem}</p><p class="col-span-3 text-xs truncate">${r.url}</p><div class="col-span-3 h-2 rounded bg-slate-800"><div class="h-2 rounded bg-primary" style="width:${bar}%"></div></div><p class="col-span-1 text-xs">${Number.isFinite(r.latency) ? `${r.latency}ms` : '-'}</p><p class="col-span-1 text-xs">${statusPill(r.status)}</p></div><div class="mt-2 md:hidden"><div class="h-2 rounded bg-slate-800"><div class="h-2 rounded bg-primary" style="width:${bar}%"></div></div><p class="mt-1 text-xs">${untested ? 'Untested' : Number.isFinite(r.latency) ? `${r.latency}ms` : '-'}</p><p class="mt-1 text-xs">${r.status === STATUS_MODEL.BLOCKED_BY_BROWSER ? 'Blocked by browser policy' : r.reason || ''}</p></div></article>`;
    })
    .join('');
}

function optimizeDockerfile(input) { /* unchanged */
  const lines = input.split(/\r?\n/);
  const out = [];
  let sawFrom = false;
  let insertedManaged = false;
  const managed = new Set();
  for (const line of lines) {
    if (/^\s*FROM\s+/i.test(line)) {
      sawFrom = true;
      out.push(line);
      const inject = ['ARG NPM_CONFIG_REGISTRY','ARG PIP_INDEX_URL','ARG MAVEN_MIRROR_URL'];
      inject.forEach(a => { if (!managed.has(a)) { out.push(a); managed.add(a); } });
      insertedManaged = true;
      continue;
    }
    if (!sawFrom && /^\s*ENV\s+/i.test(line)) continue;
    if (/^\s*ARG\s+(NPM_CONFIG_REGISTRY|PIP_INDEX_URL|MAVEN_MIRROR_URL)\b/.test(line)) continue;
    let next = line;
    if (/#\s*mirror-toolkit:\s*enable-apt-rewrite/i.test(input)) next = next.replace(/archive.ubuntu.com|deb.debian.org/g, '${APT_UBUNTU_MIRROR}');
    if (/#\s*mirror-toolkit:\s*enable-maven-mirror/i.test(input)) next = next.replace(/https?:\/\/repo.maven.apache.org\/maven2/g, '${MAVEN_MIRROR_URL}');
    out.push(next);
  }
  if (!insertedManaged) return input;
  return out.filter((l, i, arr) => !(l.startsWith('ARG ') && arr.indexOf(l) !== i)).join('\n');
}

async function runBenchmark() {
  status('Benchmark in progress...');
  state.results = [];
  for (const mirror of state.mirrors) state.results.push({ ...mirror, ...(await benchmarkOne(mirror)) });
  renderSummary();
  renderRows();
  status('Benchmark completed.');
}

function download(name, data) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click(); }

document.addEventListener('DOMContentLoaded', async () => {
  byId('runBenchmark').onclick = runBenchmark;
  byId('uploadMirrorsBtn').onclick = () => byId('mirrorsUpload').click();
  byId('mirrorsUpload').onchange = async (e) => { const text = await e.target.files[0].text(); useMirrors(JSON.parse(text)); status('Uploaded mirrors.json loaded.'); };
  byId('copyEnvBtn').onclick = async () => navigator.clipboard.writeText(byId('envOutput').value || '');
  byId('downloadReportBtn').onclick = () => download('mirror-report.json', JSON.stringify(state.results, null, 2));
  byId('optimizeDocker').onclick = () => { byId('dockerOutput').textContent = optimizeDockerfile(byId('dockerInput').value || ''); };
  byId('downloadDocker').onclick = () => download('Dockerfile.optimized', byId('dockerOutput').textContent || '');
  byId('dockerUpload').onchange = async (e) => { byId('dockerInput').value = await e.target.files[0].text(); };
  await loadMirrors();
});
