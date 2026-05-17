const CATEGORY_ORDER = ["all", "docker", "pypi", "npm", "maven", "ubuntu", "debian", "alpine", "golang", "composer", "nuget"];
const MIRROR_SOURCES = ["./mirrors.json", "../mirrors.json", "/mirrors.json"];

let mirrorsData = null;
let reportData = null;
let selectedCategory = "all";

function setStatusMessage(message, type = "info") {
  const el = document.getElementById("statusMessage");
  const tone = {
    info: "text-slate-300",
    success: "text-emerald-200",
    warning: "text-amber-200",
    danger: "text-rose-200"
  }[type] || "text-slate-300";
  el.className = `mt-3 text-sm ${tone}`;
  el.textContent = message;
}

async function loadMirrors() {
  for (const path of MIRROR_SOURCES) {
    try {
      const r = await fetch(path);
      if (r.ok) {
        mirrorsData = await r.json();
        setStatusMessage(`Loaded mirrors.json from ${path}`, "success");
        return;
      }
    } catch (_) {}
  }

  const sample = await fetch("./sample-report.json").then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (sample) {
    mirrorsData = { version: 2, mirrors: sample.mirrors };
    reportData = sample;
    setStatusMessage("Could not load mirrors.json. Showing sample report until you upload a file.", "warning");
    return;
  }

  setStatusMessage("mirrors.json not loaded. Upload mirrors.json to continue.", "warning");
}

function optimizeDockerfile(input) {
  const lines = input.split("\n");
  const out = [];
  const seen = new Set();
  let inStage = false;

  for (const line of lines) {
    if (/^\s*FROM\s+/i.test(line)) {
      inStage = true;
      out.push(line);
      ["PIP_INDEX_URL", "NPM_CONFIG_REGISTRY", "MAVEN_MIRROR_URL", "APT_UBUNTU_MIRROR", "APT_UBUNTU_SECURITY_MIRROR", "APT_DEBIAN_MIRROR", "APT_DEBIAN_SECURITY_MIRROR"].forEach(arg => out.push(`ARG ${arg}`));
      continue;
    }

    if (!inStage && /^\s*ENV\s+/i.test(line)) continue;
    if (seen.has(line.trim()) && line.trim() !== "") continue;

    seen.add(line.trim());
    out.push(line);
  }

  let text = out.join("\n");
  if (text.includes("# mirror-toolkit: enable-apt-rewrite") && !text.includes("mirror-toolkit apt rewrite block")) {
    text += "\n# mirror-toolkit apt rewrite block\nRUN echo \"apt rewrite enabled\"";
  }
  if (text.includes("# mirror-toolkit: enable-maven-mirror") && !text.includes("mirror-toolkit maven active block")) {
    text += "\n# mirror-toolkit maven active block\nRUN echo \"maven mirror enabled\"";
  }
  return text;
}

async function benchmark() {
  if (!mirrorsData?.mirrors) {
    setStatusMessage("No mirrors loaded yet. Upload mirrors.json first.", "warning");
    return;
  }

  const results = [];
  setStatusMessage("Running browser benchmark...", "info");

  for (const [category, list] of Object.entries(mirrorsData.mirrors)) {
    for (const mirror of list) {
      const start = performance.now();
      let reachable = false;
      let status = "failed";
      try {
        const r = await fetch(mirror.url, { mode: "cors" });
        reachable = r.status >= 200 && r.status < 500;
        status = reachable ? "ok" : "failed";
      } catch (_) {
        try {
          await fetch(mirror.url, { mode: "no-cors" });
          reachable = true;
          status = "reachable-ish";
        } catch (_) {}
      }
      const latency = Math.round(performance.now() - start);
      results.push({ category, name: mirror.name, url: mirror.url, kind: mirror.kind || "unknown", region: mirror.region || "global", status, reachable, latency_ms: latency });
    }
  }

  reportData = { generated_at: new Date().toISOString(), mirrors: mirrorsData.mirrors, results };
  setStatusMessage(`Benchmark completed at ${new Date(reportData.generated_at).toLocaleString()}.`, "success");
  render();
}

function renderSummary() {
  const container = document.getElementById("summary");
  if (!mirrorsData?.mirrors) {
    container.innerHTML = `<div class="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-amber-200">Upload mirrors.json to see summary metrics.</div>`;
    return;
  }
  const results = reportData?.results || [];
  const total = Object.values(mirrorsData.mirrors).reduce((a, b) => a + b.length, 0);
  const reachable = results.filter(r => r.reachable).length;
  const failed = results.length ? results.length - reachable : 0;
  const fastest = [...results.filter(r => r.reachable)].sort((a, b) => a.latency_ms - b.latency_ms)[0];
  const cards = [
    ["🧩 Total mirrors", total],
    ["✅ Reachable", reachable],
    ["❌ Failed", failed],
    ["⚡ Fastest overall", fastest ? `${fastest.name} (${fastest.latency_ms} ms)` : "n/a"],
    ["📚 Categories", Object.keys(mirrorsData.mirrors).length]
  ];
  container.innerHTML = cards.map(([k, v]) => `<article class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow"><p class="text-sm text-slate-300">${k}</p><p class="mt-1 text-lg font-semibold">${v}</p></article>`).join("");
}

function renderCategoryFilters() {
  const el = document.getElementById("categoryFilters");
  el.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow"><p class="mb-3 text-sm text-slate-300">Filter by category</p><div class="flex flex-wrap gap-2">${CATEGORY_ORDER.map(cat => `<button data-category="${cat}" class="category-pill rounded-full px-3 py-1 text-sm ${selectedCategory === cat ? "bg-cyan-400 text-slate-950" : "bg-white/10 hover:bg-white/15"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">${cat}</button>`).join("")}</div></div>`;
  el.querySelectorAll(".category-pill").forEach(btn => btn.onclick = () => { selectedCategory = btn.dataset.category; renderLatencyTable(); renderCategoryFilters(); });
}

function renderLatencyTable() {
  const el = document.getElementById("latencySection");
  if (!mirrorsData?.mirrors) {
    el.innerHTML = `<div class="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-amber-200">mirrors.json not loaded. Upload mirrors.json to benchmark.</div>`;
    return;
  }

  const results = reportData?.results || [];
  const hasBenchmark = results.length > 0;
  const categories = Object.keys(mirrorsData.mirrors).filter(c => selectedCategory === "all" || selectedCategory === c);
  const allFailed = hasBenchmark && results.every(r => !r.reachable);

  let html = `<div class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow"><h2 class="text-xl font-semibold">Latency results</h2>`;
  if (!hasBenchmark) {
    html += `<p class="mt-2 text-slate-300">Benchmark not run yet. Showing mirrors as pending.</p>`;
  }
  if (allFailed) {
    html += `<div class="mt-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-amber-200">All mirrors failed in this browser run. Try CLI benchmark for authoritative results.</div>`;
  }

  for (const cat of categories) {
    const configured = mirrorsData.mirrors[cat] || [];
    const catResults = hasBenchmark
      ? results.filter(r => r.category === cat)
      : configured.map(m => ({ category: cat, name: m.name, url: m.url, kind: m.kind || "unknown", region: m.region || "global", status: "pending", reachable: false, latency_ms: 0 }));
    const reachable = catResults.filter(r => r.reachable);
    const min = reachable.length ? Math.min(...reachable.map(r => r.latency_ms)) : 0;
    const max = reachable.length ? Math.max(...reachable.map(r => r.latency_ms)) : 1;

    html += `<h3 class="mt-5 text-lg font-medium capitalize">${cat}</h3><p class="text-xs text-slate-400">Reachable: ${reachable.length} | Failed: ${catResults.length - reachable.length} ${reachable.length ? `| Fastest: ${reachable.sort((a,b)=>a.latency_ms-b.latency_ms)[0].name}` : ""}</p><div class="mt-2 space-y-2">`;
    for (const r of catResults) {
      const fastest = r.reachable && r.latency_ms === min;
      const width = r.reachable ? (max === min ? 100 : Math.max(15, Math.round(((max - r.latency_ms) / (max - min)) * 100))) : 10;
      const statusClass = r.reachable ? "bg-emerald-500/15 text-emerald-200" : (r.status === "pending" ? "bg-amber-500/15 text-amber-200" : "bg-rose-500/15 text-rose-200");
      html += `<article class="rounded-xl border ${fastest ? "border-emerald-400/50" : "border-white/10"} bg-slate-900/70 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2"><p class="font-medium">${r.name}</p><div class="flex gap-2 text-xs"><span class="rounded-full bg-white/10 px-2 py-1">${r.region}</span><span class="rounded-full bg-white/10 px-2 py-1">${r.kind}</span>${fastest ? '<span class="rounded-full bg-cyan-400 px-2 py-1 text-slate-950">fastest</span>' : ''}</div></div>
        <p class="mt-1 break-all text-sm text-slate-300">${r.url}</p>
        <div class="mt-2 grid gap-2 text-sm md:grid-cols-[220px_1fr]"><span class="inline-flex w-fit items-center rounded-full px-2 py-1 ${statusClass}">status: ${r.status}</span><div class="flex items-center gap-2"><span class="w-16">${r.reachable ? `${r.latency_ms} ms` : "failed"}</span><div class="h-2 flex-1 rounded-full bg-white/10"><div class="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style="width:${width}%"></div></div></div></div>
      </article>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

function envFromReport() {
  if (!reportData?.results) return "# Run benchmark to generate environment variables.";
  const pick = cat => reportData.results.filter(r => r.category === cat && r.reachable).sort((a, b) => a.latency_ms - b.latency_ms)[0];
  const map = {docker:"DOCKER_REGISTRY_MIRROR",pypi:"PIP_INDEX_URL",npm:"NPM_CONFIG_REGISTRY",maven:"MAVEN_MIRROR_URL",ubuntu:"APT_UBUNTU_MIRROR",debian:"APT_DEBIAN_MIRROR",alpine:"ALPINE_MIRROR",golang:"GOPROXY",composer:"COMPOSER_REPO",nuget:"NUGET_SOURCE"};
  return Object.entries(map).map(([cat,key]) => `${key}=${(pick(cat)||{}).url || ""}`).join("\n");
}

function renderEnvOutput() {
  document.getElementById("envOutput").value = envFromReport();
}

function renderDockerfileOptimizer() {
  const el = document.getElementById("dockerfileSection");
  el.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
    <h2 class="text-xl font-semibold">Dockerfile optimizer</h2>
    <p class="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Browser optimizer is preview-only and may differ from CLI. Use CLI as authoritative output.</p>
    <div class="mt-3"><label class="text-sm text-slate-300">Profile</label><select id="dockerProfile" class="ml-2 rounded border border-white/10 bg-slate-900 px-2 py-1"><option>conservative</option><option>production</option><option>restricted-network</option><option>ci</option></select></div>
    <div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div><label for="dockerfileInput" class="mb-2 block text-sm text-slate-300">Dockerfile input</label><textarea id="dockerfileInput" rows="14" placeholder="Paste Dockerfile" class="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2"></textarea></div>
      <div><label for="dockerfileOutput" class="mb-2 block text-sm text-slate-300">Optimized output</label><textarea id="dockerfileOutput" rows="14" readonly placeholder="Optimized Dockerfile output appears here." class="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-slate-200"></textarea></div>
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <button id="optimizeDockerfile" class="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Optimize Dockerfile</button>
      <a id="downloadOptimized" class="hidden rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Download optimized Dockerfile</a><a id="downloadDockerReport" class="hidden rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">Download report JSON</a>
      <button id="clearDockerfile" class="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Clear</button>
    </div>
  </div>`;

  document.getElementById("optimizeDockerfile").onclick = () => {
    const profile=document.getElementById("dockerProfile").value;
    const out = optimizeDockerfile(document.getElementById("dockerfileInput").value || "");
    const report={profile,detected:{},changes:["preview-only browser transformation"],warnings:["CLI optimizer is authoritative"],skipped:[]};
    document.getElementById("dockerfileOutput").value = out || "Optimized Dockerfile output appears here.";
    const a = document.getElementById("downloadOptimized");
    a.href = URL.createObjectURL(new Blob([out], { type: "text/plain" }));
    a.download = "Dockerfile.optimized";
    a.classList.remove("hidden");
    const ar=document.getElementById("downloadDockerReport"); ar.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"})); ar.download="dockerfile-report.json"; ar.classList.remove("hidden");
  };

  document.getElementById("clearDockerfile").onclick = () => {
    document.getElementById("dockerfileInput").value = "";
    document.getElementById("dockerfileOutput").value = "";
    document.getElementById("downloadOptimized").classList.add("hidden");
    document.getElementById("downloadDockerReport").classList.add("hidden");
  };
}

function render() {
  renderSummary();
  renderCategoryFilters();
  renderLatencyTable();
  renderEnvOutput();
  renderDockerfileOptimizer();
}

document.getElementById("runBenchmark").onclick = benchmark;
document.getElementById("copyEnv").onclick = () => navigator.clipboard.writeText(envFromReport());
document.getElementById("copyEnvInline").onclick = () => navigator.clipboard.writeText(document.getElementById("envOutput").value || "");
document.getElementById("downloadReport").onclick = () => {
  const blob = new Blob([JSON.stringify(reportData || {}, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mirror-report.json";
  a.click();
};
document.getElementById("mirrorsFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  mirrorsData = JSON.parse(await f.text());
  reportData = null;
  selectedCategory = "all";
  setStatusMessage(`Loaded ${f.name}. Ready to benchmark.`, "success");
  render();
};
document.getElementById("dockerfileUpload").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const input = document.getElementById("dockerfileInput");
  if (input) input.value = await f.text();
};

loadMirrors().then(render);
