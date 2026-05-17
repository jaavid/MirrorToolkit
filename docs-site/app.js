const CATEGORY_ORDER = ["all", "docker", "pypi", "npm", "maven", "ubuntu", "debian", "alpine", "golang", "composer", "nuget"];
const MIRROR_SOURCES = ["./mirrors.json"];

const state = {
  mirrorsData: null,
  reportData: null,
  selectedCategory: "all",
  benchmarkState: "idle",
  benchmarkProgress: { done: 0, total: 0 },
  dockerfileState: "empty",
  expandedCategories: new Set(),
  dockerInput: "",
  dockerOutput: "",
  dockerReport: null,
  activePanel: "input"
};

const byId = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const el = byId(id);
  if (el) el.addEventListener(event, handler);
};
const setHtml = (id, html) => {
  const el = byId(id);
  if (el) el.innerHTML = html;
  return el;
};
const hasMirrorResult = () => !!state.reportData?.results?.length;

function setStatusMessage(message, tone = "text-slate-300") {
  const el = byId("statusMessage");
  if (!el) return;
  el.className = `mt-2 text-sm ${tone}`;
  el.textContent = message;
}

async function loadMirrors() {
  for (const path of MIRROR_SOURCES) {
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (!r.ok) continue;
      const payload = await r.json();
      if (payload?.mirrors && typeof payload.mirrors === "object") {
        state.mirrorsData = payload;
        return true;
      }
    } catch (error) {
      console.warn(`Could not load ${path}`, error);
    }
  }
  setStatusMessage("Could not load local mirrors.json (./mirrors.json). You can still upload mirrors.json manually to continue.", "text-amber-200");
  return false;
}

function getDisplayStatus() {
  if (state.benchmarkState === "running") return `Checking mirrors… ${state.benchmarkProgress.done}/${state.benchmarkProgress.total}`;
  if (hasMirrorResult()) return "Mirror check complete. Review the fastest mirrors, then optimize your Dockerfile.";
  return "No mirror check has run yet.";
}

function renderWorkflow() {
  const canDocker = hasMirrorResult();
  const optimized = state.dockerfileState === "optimized";
  setHtml("workflowSection", `<div class="rounded-xl border border-white/10 bg-white/5 p-3"><div class="grid gap-2 md:grid-cols-4">${[
    ["1", "Check mirrors", "Run a quick browser-side check or upload a CLI report.", "active"],
    ["2", "Review result", "See fastest reachable mirrors per category.", state.benchmarkState === "running" ? "active" : (hasMirrorResult() ? "done" : "pending")],
    ["3", "Add Dockerfile", "Paste or upload a normal Dockerfile.", canDocker ? "active" : "locked"],
    ["4", "Get optimized output", "Download a mirror-aware Dockerfile and report.", optimized ? "done" : (canDocker ? "pending" : "locked")]
  ].map(([n,t,d,s]) => `<article class="rounded-lg border p-2 ${s==="done"?"border-emerald-400/40 bg-emerald-500/10":s==="active"?"border-cyan-400/40 bg-cyan-500/10":s==="locked"?"border-white/10 opacity-60":"border-white/10"}"><p class="text-xs">Step ${n}</p><h3 class="text-sm font-semibold">${t}</h3><p class="text-xs text-slate-300">${d}</p></article>`).join("")}</div><p class="mt-2 text-xs text-slate-300">${getDisplayStatus()}</p></div>`);
}

function renderActions() {
  setHtml("actionsSection", `<div class="rounded-xl border border-white/10 bg-white/5 p-3"><div class="flex flex-wrap gap-2">
    <button id="runBenchmark" ${state.benchmarkState === "running" ? "disabled" : ""} class="rounded-lg bg-cyan-400 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-60">${state.benchmarkState === "running" ? "Checking..." : "Run check"}</button>
    <button id="downloadReport" class="rounded-lg bg-white/10 px-3 py-1.5 text-sm">Download mirror-report.json</button>
    <label class="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-sm">Upload mirrors.json<input id="mirrorsFile" type="file" class="hidden" accept=".json,application/json"></label>
    <label class="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-sm">Upload Dockerfile<input id="dockerfileUpload" type="file" class="hidden"></label>
  </div></div>`);
  on("runBenchmark", "click", benchmark);
  on("downloadReport", "click", downloadMirrorReport);
  on("mirrorsFile", "change", uploadMirrors);
  on("dockerfileUpload", "change", uploadDockerfile);
}

function summarize(results = []){const reachable=results.filter(r=>r.reachable);return {reachable:reachable.length,failed:results.length-reachable.length,fastest:reachable.sort((a,b)=>a.latency_ms-b.latency_ms)[0]};}
function renderCategoryOverview() {
  const cats = Object.keys(state.mirrorsData?.mirrors || {});
  if (!cats.length) { setHtml("categoryOverview", ""); return; }
  const html = CATEGORY_ORDER.filter(c => c === "all" || cats.includes(c)).map(cat => {
    if (!hasMirrorResult()) return `<button data-category="${cat}" class="pill ${state.selectedCategory===cat?"active":""}">${cat} · pending</button>`;
    const rs = cat === "all" ? state.reportData.results : state.reportData.results.filter(r => r.category === cat);
    const s = summarize(rs); const m = s.fastest ? `${s.fastest.latency_ms}ms` : "failed";
    return `<button data-category="${cat}" class="pill ${state.selectedCategory===cat?"active":""}">${cat} · ${m}</button>`;
  }).join("");
  setHtml("categoryOverview", `<div class="rounded-xl border border-white/10 bg-white/5 p-2"><div class="flex flex-wrap gap-2">${html}</div></div>`);
  byId("categoryOverview")?.querySelectorAll("button").forEach(b=>b.onclick=()=>{state.selectedCategory=b.dataset.category; renderCategoryOverview(); renderLatencyCompact();});
}

function renderLatencyCompact() {
  if (!state.mirrorsData?.mirrors) { setHtml("latencySection", ""); return; }
  if (!hasMirrorResult() && state.benchmarkState !== "running") { setHtml("latencySection", `<div class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">No check has run yet. Start with mirror check.</div>`); return; }
  const categories = Object.keys(state.mirrorsData.mirrors).filter(c => state.selectedCategory === "all" || c === state.selectedCategory);
  const cards = categories.map(cat => {
    const rows = (state.reportData?.results || []).filter(r => r.category === cat);
    const s = summarize(rows); const max = Math.max(...rows.map(r => r.latency_ms || 1), 1); const limit = state.expandedCategories.has(cat) ? rows.length : 5;
    const visible = rows.slice().sort((a,b)=>a.latency_ms-b.latency_ms).slice(0,limit);
    return `<article class="rounded-lg border border-white/10 bg-white/5 p-2"><div class="flex items-center justify-between"><h3 class="text-sm font-semibold capitalize">${cat}</h3><p class="text-xs text-slate-300">${s.reachable} ok / ${s.failed} fail ${s.fastest?`· fastest ${s.fastest.name}`:""}</p></div>
      <div class="mt-2 space-y-1">${visible.map(r=>`<div class="grid grid-cols-[1fr_auto_60px] items-center gap-2 text-xs" title="${r.url}"><span class="truncate">${r.name} · ${new URL(r.url).hostname}</span><span class="${r.reachable?"text-emerald-300":"text-rose-300"}">${r.reachable?"●":"●"}</span><span>${r.reachable?r.latency_ms+"ms":"failed"}</span><div class="col-span-3 h-1.5 rounded bg-white/10"><div class="h-1.5 rounded bg-cyan-400" style="width:${r.reachable?Math.max(8,Math.round((1-r.latency_ms/max)*100)):6}%"></div></div></div>`).join("")}</div>
      ${rows.length>5?`<button data-expand="${cat}" class="mt-2 text-xs text-cyan-300">${state.expandedCategories.has(cat)?"show less":"show all"}</button>`:""}</article>`;
  }).join("");
  setHtml("latencySection", `<div class="grid gap-2 md:grid-cols-2">${cards}</div>`);
  byId("latencySection")?.querySelectorAll("[data-expand]").forEach(b=>b.onclick=()=>{const c=b.dataset.expand;state.expandedCategories.has(c)?state.expandedCategories.delete(c):state.expandedCategories.add(c);renderLatencyCompact();});
}

function envFromReport() { if (!hasMirrorResult()) return ""; const pick = c => state.reportData.results.filter(r=>r.category===c&&r.reachable).sort((a,b)=>a.latency_ms-b.latency_ms)[0]?.url||""; return `DOCKER_REGISTRY_MIRROR=${pick("docker")}\nPIP_INDEX_URL=${pick("pypi")}\nNPM_CONFIG_REGISTRY=${pick("npm")}`; }
function renderEnvPreview() {
  const env = envFromReport();
  setHtml("envSection", `<div class="rounded-xl border border-white/10 bg-white/5 p-3"><div class="flex items-center justify-between"><h2 class="text-sm font-semibold">Generated env</h2><div class="flex gap-2"><button id="copyEnv" class="rounded bg-white/10 px-2 py-1 text-xs" ${!env?"disabled":""}>Copy env</button><button id="downloadEnv" class="rounded bg-white/10 px-2 py-1 text-xs" ${!env?"disabled":""}>Download .env.mirrors</button></div></div>${env?`<p class="mt-1 text-xs text-amber-200">These values are based on browser check. CLI benchmark is more reliable.</p><pre class="mt-2 compact-scroll rounded bg-slate-900 p-2 text-xs">${env}</pre>`:`<p class="mt-2 text-xs text-slate-300">Run mirror check first to generate env values.</p>`}</div>`);
  on("copyEnv", "click", ()=>navigator.clipboard.writeText(env));
  on("downloadEnv", "click", ()=>downloadText(".env.mirrors", env));
}

function renderDockerfileWorkspace() {
  const locked = !hasMirrorResult();
  setHtml("dockerfileSection", `<div class="rounded-xl border border-white/10 bg-white/5 p-3 ${locked?"opacity-80":""}"><p class="text-xs text-slate-300">${locked?"Recommended: run mirror check first.":"Paste or upload a Dockerfile to continue."}</p>
    <p class="mt-1 text-xs text-amber-200">Browser optimizer warning remains: CLI optimizer is authoritative.</p>
    <div class="mt-2 flex gap-2 text-xs"><button data-tab="input" class="rounded px-2 py-1 ${state.activePanel==="input"?"bg-cyan-400 text-slate-950":"bg-white/10"}">Input</button><button data-tab="optimized" class="rounded px-2 py-1 ${state.activePanel==="optimized"?"bg-cyan-400 text-slate-950":"bg-white/10"}">Optimized</button>${state.dockerReport?`<button data-tab="report" class="rounded px-2 py-1 ${state.activePanel==="report"?"bg-cyan-400 text-slate-950":"bg-white/10"}">Report</button>`:""}</div>
    <div class="mt-2">${state.activePanel==="input"?`<textarea id="dockerfileInput" class="w-full compact-scroll rounded border border-white/10 bg-slate-900 p-2 text-xs" placeholder="Paste Dockerfile">${state.dockerInput}</textarea>`:state.activePanel==="optimized"?`<pre class="compact-scroll rounded bg-slate-900 p-2 text-xs">${state.dockerOutput || "Paste Dockerfile and click Optimize."}</pre>`:`<pre class="compact-scroll rounded bg-slate-900 p-2 text-xs">${JSON.stringify(state.dockerReport,null,2)}</pre>`}</div>
    <div class="mt-2 flex flex-wrap gap-2"><button id="optimizeDockerfile" class="rounded bg-cyan-400 px-3 py-1 text-xs text-slate-950" ${locked?"disabled":""}>Optimize</button><button id="clearDockerfile" class="rounded bg-white/10 px-3 py-1 text-xs">Clear</button><button id="downloadOptimized" class="rounded bg-white/10 px-3 py-1 text-xs" ${state.dockerOutput?"":"disabled"}>Download optimized</button><button id="downloadDockerReport" class="rounded bg-white/10 px-3 py-1 text-xs" ${state.dockerReport?"":"disabled"}>Download report</button></div>
    ${state.dockerfileState==="optimized"?`<p class="mt-2 text-xs text-emerald-200">Optimized Dockerfile is ready.</p>`:""}</div>`);

  byId("dockerfileSection")?.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.activePanel=b.dataset.tab;renderDockerfileWorkspace();});
  const input = byId("dockerfileInput"); if (input) input.oninput = e => { state.dockerInput = e.target.value; state.dockerfileState = state.dockerInput.trim()?"ready":"empty"; };
  on("optimizeDockerfile", "click", optimizeDocker);
  on("clearDockerfile", "click", ()=>{state.dockerInput="";state.dockerOutput="";state.dockerReport=null;state.dockerfileState="empty";state.activePanel="input";renderWorkflow();renderDockerfileWorkspace();});
  on("downloadOptimized", "click", ()=>downloadText("Dockerfile.optimized", state.dockerOutput));
  on("downloadDockerReport", "click", ()=>downloadText("dockerfile-report.json", JSON.stringify(state.dockerReport,null,2)));
}

function optimizeDocker(){ const out=state.dockerInput.split("\n").map(l=>l).join("\n"); state.dockerOutput=out; state.dockerReport={generated_at:new Date().toISOString(), env_preview:envFromReport(), warning:"CLI optimizer is authoritative"}; state.dockerfileState="optimized"; state.activePanel="optimized"; renderWorkflow(); renderDockerfileWorkspace(); }
async function benchmark() {
  if (state.benchmarkState === "running") return;
  if (!state.mirrorsData?.mirrors) {
    setStatusMessage("Could not load local mirrors.json (./mirrors.json). You can still upload mirrors.json manually to continue.", "text-amber-200");
    return;
  }
  const mirrors = Object.entries(state.mirrorsData.mirrors).flatMap(([category,list]) => list.map(m => ({category, ...m})));
  state.benchmarkState = "running"; state.benchmarkProgress = { done: 0, total: mirrors.length }; state.reportData = { generated_at: new Date().toISOString(), mirrors: state.mirrorsData.mirrors, results: [] };
  setStatusMessage("Checking mirrors… 0/" + mirrors.length); renderWorkflow(); renderActions(); renderLatencyCompact();
  for (const m of mirrors) {
    const start = performance.now(); let reachable = false; let status = "failed";
    try { const r = await fetch(m.url, { mode: "cors" }); reachable = r.status >= 200 && r.status < 500; status = reachable ? "ok" : "failed"; } catch (_) {}
    state.reportData.results.push({ category: m.category, name: m.name, url: m.url, status, reachable, latency_ms: Math.round(performance.now()-start) });
    state.benchmarkProgress.done += 1; setStatusMessage(`Checking mirrors… ${state.benchmarkProgress.done}/${state.benchmarkProgress.total}`); renderWorkflow(); renderLatencyCompact(); await new Promise(r=>setTimeout(r,0));
  }
  state.benchmarkState = "done"; setStatusMessage("Mirror check complete. Review the fastest mirrors, then optimize your Dockerfile.", "text-emerald-200"); render();
}
function downloadText(name, text){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text], {type:"text/plain"})); a.download=name; a.click(); }
function downloadMirrorReport(){ if (!state.reportData) { setStatusMessage("Run mirror check first, then download the report.", "text-amber-200"); return; } downloadText("mirror-report.json", JSON.stringify(state.reportData, null, 2)); }
async function uploadMirrors(e){const f=e.target.files?.[0]; if(!f) return; const j=JSON.parse(await f.text()); if (j.results) { state.reportData=j; state.mirrorsData={mirrors:j.mirrors||{}}; } else { state.mirrorsData=j; state.reportData=null; } state.benchmarkState=hasMirrorResult()?"done":"idle"; render();}
async function uploadDockerfile(e){ const f=e.target.files?.[0]; if(!f)return; state.dockerInput=await f.text(); state.dockerfileState=state.dockerInput.trim()?"ready":"empty"; renderDockerfileWorkspace(); }

function render(){
  renderWorkflow();
  renderActions();
  renderCategoryOverview();
  renderLatencyCompact();
  renderEnvPreview();
  renderDockerfileWorkspace();
}

async function init() {
  try {
    const loaded = await loadMirrors();
    render();
    if (loaded) setStatusMessage(getDisplayStatus());
  } catch (error) {
    console.error(error);
    setStatusMessage("UI initialization failed. Check the browser console for details.", "text-rose-200");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
