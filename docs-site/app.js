const MIRROR_URL = './mirrors.json';
const I18N = {
  fa: {
    kicker: 'Mirror Intelligence',
    appSubtitle: 'بررسی سریع میرورها و ساخت Dockerfile سازگار با شبکه',
    loadingMirrors: 'در حال بارگذاری mirrors.json...',
    mirrorsLoaded: 'mirrors.json با موفقیت بارگذاری شد.',
    mirrorsFailed: 'بارگذاری mirrors.json ناموفق بود. می‌توانید فایل جایگزین را آپلود کنید.',
    startCheck: 'شروع بررسی',
    checking: 'در حال بررسی...',
    checkedCount: '{checked} از {total}',
    currentChecking: 'در حال بررسی: {tool} ← {mirror}',
    totalMirrors: 'کل میرورها', checked: 'بررسی‌شده', success: 'موفق', failed: 'ناموفق', fastest: 'سریع‌ترین', average: 'میانگین',
    latencyChart: 'نمودار زمان پاسخ‌گویی', pending: 'در انتظار', dockerGuide: 'بعد از بررسی، Dockerfile را وارد و نسخه بهینه را دانلود کنید.',
    generateDockerfile: 'ساخت Dockerfile بهینه', downloadDockerfile: 'دانلود Dockerfile', noOutput: 'هنوز خروجی تولید نشده است.', global: 'Global',
  },
  en: {
    kicker: 'Mirror Intelligence',
    appSubtitle: 'Fast mirror checks and network-friendly Dockerfile optimization',
    loadingMirrors: 'Loading mirrors.json...', mirrorsLoaded: 'mirrors.json loaded successfully.', mirrorsFailed: 'Failed to load mirrors.json. You can upload a fallback file.',
    startCheck: 'Start check', checking: 'Checking...', checkedCount: '{checked} of {total}', currentChecking: 'Checking: {tool} ← {mirror}',
    totalMirrors: 'Total mirrors', checked: 'Checked', success: 'Success', failed: 'Failed', fastest: 'Fastest', average: 'Average',
    latencyChart: 'Latency chart', pending: 'Pending', dockerGuide: 'After checks, paste Dockerfile and download optimized output.',
    generateDockerfile: 'Generate optimized Dockerfile', downloadDockerfile: 'Download Dockerfile', noOutput: 'No generated output yet.', global: 'Global',
  }
};
const state = { lang: localStorage.getItem('mt_lang') || 'fa', mirrorsData: null, results: [], checking: false, progress: { done: 0, total: 0, currentTool: '-', currentMirror: '-' }, dockerIn: '', dockerOut: '' };
const byId = id => document.getElementById(id);
const setHtml = (id, h) => { const e = byId(id); if (e) e.innerHTML = h; };
const t = (k, v = {}) => (I18N[state.lang][k] || k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function renderSpinner(label, lg = false) {
  return `<span class="spinner ${lg ? 'spinner-lg' : ''}" role="status" aria-label="${escapeHtml(label || t('loadingMirrors'))}"><span class="sr-only">${escapeHtml(label || t('loadingMirrors'))}</span></span>`;
}
function renderCountryFlag(countryCode, countryName) {
  const normalized = String(countryCode || '').trim().toLowerCase();
  if (!normalized || normalized === 'global') {
    const label = escapeHtml(countryName || t('global'));
    return `<span class="country-flag country-flag-global" title="${label}" aria-label="${label}">🌐</span>`;
  }
  const label = escapeHtml(countryName || countryCode);
  return `<span class="country-flag" title="${label}" aria-label="${label}"><span class="fi fi-${escapeHtml(normalized)}"></span></span>`;
}
function applyLang() { document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'fa' ? 'rtl' : 'ltr'; localStorage.setItem('mt_lang', state.lang); byId('langFa')?.classList.toggle('active', state.lang === 'fa'); byId('langEn')?.classList.toggle('active', state.lang === 'en'); byId('headerKicker').textContent = t('kicker'); byId('appSubtitle').textContent = t('appSubtitle'); }
function normalizeMirrorEntry(ecosystem, eco, mirror) { return { ecosystem, ecosystemLabel: eco.label || ecosystem, icon: eco.icon, id: mirror.id || `${ecosystem}-${mirror.url}`, name: mirror.name || mirror.provider || mirror.url, url: mirror.url, country: mirror.country || 'Unknown', countryCode: mirror.countryCode || 'UNK', provider: mirror.provider || 'Unknown', enabled: mirror.enabled !== false, test: mirror.test || { method: 'GET', url: mirror.url } }; }
function classifyCheckFailure(err, status) { if (err?.name === 'AbortError') return 'timeout'; if (err?.message?.includes('Failed to fetch')) return 'CORS/network'; if (status && (status < 200 || status >= 300)) return `HTTP ${status}`; return 'error'; }
async function checkMirrorLatency(m) { const c = new AbortController(); const x = setTimeout(() => c.abort(), 7000); const s = performance.now(); try { const r = await fetch(m.test.url || m.url, { method: m.test.method || 'GET', mode: 'cors', signal: c.signal, cache: 'no-store' }); clearTimeout(x); const latency = Math.round(performance.now() - s); return r.ok ? { ok: true, latency } : { ok: false, latency, reason: classifyCheckFailure(null, r.status) }; } catch (e) { clearTimeout(x); return { ok: false, latency: Math.round(performance.now() - s), reason: classifyCheckFailure(e) }; } }

function renderProgress() { const p = state.progress, percent = p.total ? Math.round((p.done / p.total) * 100) : 0; setHtml('actionsSection', `<div class='card'><div class='row'><button id='runCheck' class='btn-primary btn-run' ${state.checking ? 'disabled' : ''}>${state.checking ? renderSpinner(t('checking')) : t('startCheck')}</button><span class='progress-percent'>${t('checkedCount', { checked: p.done, total: p.total })} (${percent}%)</span></div><div class='progress mt'><div style='width:${percent}%'></div></div><p class='helper mt'>${state.checking ? renderSpinner(t('checking')) + ' ' : ''}${t('currentChecking', { tool: p.currentTool, mirror: p.currentMirror })}</p></div>`); byId('runCheck')?.addEventListener('click', runChecks); }
function getRows() { return [...state.results].sort((a, b) => (a.state === 'success' ? 0 : 1) - (b.state === 'success' ? 0 : 1) || a.latency - b.latency); }
function renderResults() {
  const rows = getRows(); const success = rows.filter(r => r.state === 'success'); const failed = rows.filter(r => r.state === 'failed'); const fastest = success[0]; const avg = success.length ? Math.round(success.reduce((s, r) => s + r.latency, 0) / success.length) : 0;
  setHtml('summary', `<div class='card grid summary-grid'>${[[t('totalMirrors'), rows.length], [t('checked'), success.length + failed.length], [t('success'), success.length], [t('failed'), failed.length], [t('fastest'), fastest ? `${renderCountryFlag(fastest.countryCode, fastest.country)} ${fastest.latency}ms` : '-'], [t('average'), avg ? avg + 'ms' : '-']].map(([l, v]) => `<div class='metric'><div class='metric-label'>${l}</div><div class='metric-value'>${v}</div></div>`).join('')}</div>`);
  setHtml('latencySection', `<div class='grid'>${rows.map(r => `<div class='card ${r.state === 'success' ? 'ok' : r.state === 'failed' ? 'fail' : 'checking'}'><div class='row'><div>${renderCountryFlag(r.countryCode, r.country)} <img class='icon' src='${r.icon}' alt='${r.ecosystemLabel}'> <strong>${r.ecosystemLabel}</strong> · ${r.name} (${r.provider})</div><div class='latency-value'>${r.state === 'success' ? r.latency + 'ms' : r.state === 'failed' ? '✕ ' + r.reason : renderSpinner(t('checking'))}</div></div></div>`).join('')}</div>`);
  setHtml('envSection', `<div class='card'><h3>${t('latencyChart')}</h3><svg viewBox='0 0 540 ${Math.max(50, rows.length * 20 + 20)}' class='w-full'>${rows.map((r, i) => `<g transform='translate(0,${i * 20})'><text x='0' y='14' font-size='11' fill='#cbd5e1'>${r.ecosystem}: ${r.provider}</text><foreignObject x='190' y='2' width='24' height='16'>${renderCountryFlag(r.countryCode, r.country)}</foreignObject>${r.state === 'success' ? `<rect x='230' y='4' width='${Math.max(4, Math.round((r.latency / Math.max(...rows.filter(x => x.state === 'success').map(x => x.latency), 1)) * 200))}' height='10' fill='#22d3ee'/><text x='440' y='14' font-size='10' fill='#e2e8f0'>${r.latency}ms</text>` : r.state === 'failed' ? `<text x='230' y='14' font-size='10' fill='#fda4af'>${t('failed')}</text>` : `<text x='230' y='14' font-size='10' fill='#94a3b8'>...</text>`}</g>`).join('')}</svg></div>`);
}
function renderDocker() { const fastest = state.results.filter(r => r.state === 'success').slice().sort((a, b) => a.latency - b.latency).slice(0, 5); setHtml('dockerfileSection', `<div class='card'><p class='helper'>${t('dockerGuide')}</p><textarea id='dockerIn' class='compact-scroll mt' placeholder='Dockerfile'>${state.dockerIn}</textarea><div class='mt'><button id='genDocker' class='btn-primary' ${fastest.length ? '' : 'disabled'}>${t('generateDockerfile')}</button> <button id='dlDocker' class='btn' ${state.dockerOut ? '' : 'disabled'}>${t('downloadDockerfile')}</button></div><pre class='compact-scroll mt'>${state.dockerOut || t('noOutput')}</pre></div>`); byId('dockerIn').oninput = e => state.dockerIn = e.target.value; byId('genDocker').onclick = () => { state.dockerOut = `# mirrors selected\n${fastest.map(f => `# ${f.ecosystem} ${f.url}`).join('\n')}\n` + state.dockerIn; renderDocker(); }; byId('dlDocker').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([state.dockerOut])); a.download = 'Dockerfile.optimized'; a.click(); }; }
async function runChecks() { const items = Object.entries(state.mirrorsData?.ecosystems || {}).flatMap(([k, v]) => (v.mirrors || []).map(m => normalizeMirrorEntry(k, v, m)).filter(m => m.enabled)); state.results = items.map(m => ({ ...m, state: 'pending', latency: 0, reason: '' })); state.checking = true; state.progress = { done: 0, total: items.length, currentTool: '-', currentMirror: '-' }; render(); for (let i = 0; i < state.results.length; i++) { const r = state.results[i]; r.state = 'checking'; state.progress.currentTool = r.ecosystemLabel; state.progress.currentMirror = r.name; renderProgress(); renderResults(); const res = await checkMirrorLatency(r); r.state = res.ok ? 'success' : 'failed'; r.latency = res.latency; r.reason = res.reason || ''; state.progress.done = i + 1; renderProgress(); renderResults(); } state.checking = false; render(); }
function render() { applyLang(); renderProgress(); renderResults(); renderDocker(); }
async function init() { byId('statusMessage').textContent = ''; byId('statusMessage').innerHTML = renderSpinner(t('loadingMirrors')); byId('langFa').onclick = () => { state.lang = 'fa'; render(); }; byId('langEn').onclick = () => { state.lang = 'en'; render(); }; try { const r = await fetch(MIRROR_URL, { cache: 'no-store' }); if (!r.ok) throw new Error('bad'); state.mirrorsData = await r.json(); byId('statusMessage').textContent = t('mirrorsLoaded'); } catch { byId('statusMessage').textContent = t('mirrorsFailed'); } render(); }
document.addEventListener('DOMContentLoaded', init);
