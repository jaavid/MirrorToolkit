const MIRROR_URL = './mirrors.json';
const state = { mirrors: [], results: [], categories: new Set(), activeCategory: 'all' };
const byId = (id) => document.getElementById(id);
const status = (msg) => { byId('statusMessage').textContent = msg; };

async function loadMirrors() {
  try {
    const res = await fetch(MIRROR_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('load failed');
    useMirrors(await res.json());
    byId('uploadFallback').classList.add('hidden');
    status('mirrors.json loaded.');
  } catch {
    byId('uploadFallback').classList.remove('hidden');
    status('Could not load mirrors.json. Upload a file to continue.');
  }
}
function useMirrors(data) {
  state.mirrors = Object.entries(data?.ecosystems || {}).flatMap(([category, eco]) =>
    (eco.mirrors || []).filter(m => m.enabled !== false).map(m => ({
      category,
      categoryLabel: eco.label || category,
      name: m.name || m.provider || m.url,
      provider: m.provider || 'Unknown',
      url: m.url,
      testUrl: m.test?.url || m.url
    }))
  );
  state.categories = new Set(state.mirrors.map(m => m.categoryLabel));
  renderFilters();
  renderSummary();
}

async function benchmarkOne(m) {
  const start = performance.now();
  try {
    const r = await fetch(m.testUrl, { mode: 'cors', cache: 'no-store' });
    return { state: r.ok ? 'exact' : 'failed', latency: Math.round(performance.now() - start), reason: r.ok ? '' : `HTTP ${r.status}` };
  } catch {
    try {
      await fetch(m.testUrl, { mode: 'no-cors', cache: 'no-store' });
      return { state: 'approximate', latency: Math.round(performance.now() - start), reason: 'no-cors fallback' };
    } catch {
      return { state: 'failed', latency: Math.round(performance.now() - start), reason: 'network/cors failure' };
    }
  }
}

function renderSummary() {
  const rows = state.results;
  const reachable = rows.filter(r => r.state !== 'failed');
  const failed = rows.filter(r => r.state === 'failed');
  const fastest = reachable.slice().sort((a, b) => a.latency - b.latency)[0];
  const cards = [
    ['Total mirrors', state.mirrors.length], ['Reachable', reachable.length], ['Failed', failed.length], ['Fastest overall', fastest ? `${fastest.name} (${fastest.latency}ms)` : '-'], ['Categories', state.categories.size]
  ];
  byId('summaryCards').innerHTML = cards.map(([k, v]) => `<article class="rounded-xl border border-slate-800 bg-surface/70 p-3"><p class="text-xs text-slate-400">${k}</p><p class="mt-1 text-sm font-semibold break-words">${v}</p></article>`).join('');
  byId('envOutput').value = reachable.map(r => `${r.category.toUpperCase()}_MIRROR=${r.url}`).join('\n');
}
function renderFilters() {
  byId('filters').innerHTML = ['all', ...state.categories].map(c => `<button data-cat="${c}" class="rounded-full border px-3 py-1 text-xs ${state.activeCategory === c ? 'border-primary bg-primary/20' : 'border-slate-700'}">${c}</button>`).join('');
  byId('filters').querySelectorAll('button').forEach(btn => btn.onclick = () => { state.activeCategory = btn.dataset.cat; renderRows(); });
}
function renderRows() {
  const filtered = state.results.filter(r => state.activeCategory === 'all' || r.categoryLabel === state.activeCategory);
  const fastestLatency = Math.min(...filtered.filter(x => x.state !== 'failed').map(x => x.latency), Infinity);
  byId('latencyRows').innerHTML = filtered.map(r => {
    const failed = r.state === 'failed';
    const approx = r.state === 'approximate';
    const fastest = r.latency === fastestLatency && !failed;
    const bar = failed ? 0 : Math.max(6, Math.min(100, 100 - Math.round((r.latency / 3000) * 100)));
    return `<article class="rounded-xl border p-3 ${fastest ? 'border-success bg-success/10' : failed ? 'border-danger/60 bg-danger/10 opacity-80' : 'border-slate-800 bg-surface/70'}"><div class="md:hidden space-y-1"><p class="font-semibold">${r.name}</p><p class="truncate text-xs text-slate-400">${r.url}</p></div><div class="hidden md:grid md:grid-cols-12 md:gap-2 md:items-center"><p class="col-span-2 font-semibold truncate">${r.name}</p><p class="col-span-2 text-xs">${r.categoryLabel}</p><p class="col-span-3 text-xs truncate">${r.url}</p><div class="col-span-3 h-2 rounded bg-slate-800"><div class="h-2 rounded bg-primary" style="width:${bar}%"></div></div><p class="col-span-1 text-xs">${failed ? '-' : r.latency + 'ms'}</p><p class="col-span-1 text-xs">${failed ? '<span class="rounded bg-danger/20 px-2 py-1">failed</span>' : approx ? '<span class="rounded bg-warning/20 px-2 py-1">approx</span>' : '<span class="rounded bg-success/20 px-2 py-1">exact</span>'}</p></div><div class="mt-2 md:hidden"><div class="h-2 rounded bg-slate-800"><div class="h-2 rounded bg-primary" style="width:${bar}%"></div></div><p class="mt-1 text-xs">${failed ? 'failed' : `${r.latency}ms (${approx ? 'approx' : 'exact'})`}</p></div></article>`;
  }).join('');
}

function optimizeDockerfile(input) {
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
  for (const m of state.mirrors) state.results.push({ ...m, ...(await benchmarkOne(m)) });
  renderSummary(); renderRows(); status('Benchmark completed.');
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
