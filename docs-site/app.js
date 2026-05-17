let mirrorsData=null; let reportData=null;
const sources=['./mirrors.json','../mirrors.json','/mirrors.json'];

async function loadMirrors(){
  for(const p of sources){ try{ const r=await fetch(p); if(r.ok){ mirrorsData=await r.json(); return; } }catch{} }
  const sample=await fetch('./sample-report.json').then(r=>r.json()).catch(()=>null);
  if(sample){ mirrorsData={version:2,mirrors:sample.mirrors}; reportData=sample; render(); }
}

function optimizeDockerfile(input){const lines=input.split('\n');const out=[];let seen=new Set();let inStage=false;for(const line of lines){if(/^\s*FROM\s+/i.test(line)){inStage=true;out.push(line);['PIP_INDEX_URL','NPM_CONFIG_REGISTRY','MAVEN_MIRROR_URL','APT_UBUNTU_MIRROR','APT_UBUNTU_SECURITY_MIRROR','APT_DEBIAN_MIRROR','APT_DEBIAN_SECURITY_MIRROR'].forEach(a=>out.push(`ARG ${a}`));continue;}if(!inStage&&/^\s*ENV\s+/i.test(line))continue;if(seen.has(line.trim())&&line.trim()!=='')continue;seen.add(line.trim());out.push(line);}let t=out.join('\n');if(t.includes('# mirror-toolkit: enable-apt-rewrite')&&!t.includes('mirror-toolkit apt rewrite block'))t+='\n# mirror-toolkit apt rewrite block\nRUN echo "apt rewrite enabled"';if(t.includes('# mirror-toolkit: enable-maven-mirror')&&!t.includes('mirror-toolkit maven active block'))t+='\n# mirror-toolkit maven active block\nRUN echo "maven mirror enabled"';return t;}

async function benchmark(){
  const results=[];
  for(const [category,list] of Object.entries(mirrorsData.mirrors)){
    for(const m of list){const start=performance.now();let reachable=false;let status='failed';try{let r=await fetch(m.url,{mode:'cors'});reachable=r.status>=200&&r.status<500;status=reachable?'ok':'failed';}catch{try{await fetch(m.url,{mode:'no-cors'});reachable=true;status='reachable-ish';}catch{}}const latency=Math.round(performance.now()-start);results.push({category,name:m.name,url:m.url,status,reachable,latency_ms:latency});}
  }
  reportData={generated_at:new Date().toISOString(),mirrors:mirrorsData.mirrors,results};
  render();
}

function render(){if(!mirrorsData)return;const c=document.getElementById('mirrorsContainer');const s=document.getElementById('summary');const results=reportData?.results||[];const byCat={};results.forEach(r=>(byCat[r.category]??=[]).push(r));const total=Object.values(mirrorsData.mirrors).reduce((a,b)=>a+b.length,0);const reach=results.filter(r=>r.reachable).length;const fastest=[...results.filter(r=>r.reachable)].sort((a,b)=>a.latency_ms-b.latency_ms)[0];s.innerHTML=`<div class='card'>Total mirrors: ${total}</div><div class='card'>Reachable: ${reach}</div><div class='card'>Fastest overall: ${fastest?fastest.name:'n/a'}</div><div class='card'>Categories: ${Object.keys(mirrorsData.mirrors).length}</div>`;c.innerHTML='';for(const [cat,list] of Object.entries(mirrorsData.mirrors)){const catResults=byCat[cat]||list.map(m=>({name:m.name,url:m.url,status:'pending',reachable:false,latency_ms:0}));const reachables=catResults.filter(x=>x.reachable);const min=reachables.length?Math.min(...reachables.map(x=>x.latency_ms)):0;const max=reachables.length?Math.max(...reachables.map(x=>x.latency_ms)):1;let html=`<section class='category'><h3>${cat}</h3>`;for(const r of catResults){let width=18;if(r.reachable){width=max===min?100:Math.max(15,Math.round((max-r.latency_ms)/(max-min)*100));}html+=`<div class='row ${!r.reachable?'failed':''} ${r.reachable&&r.latency_ms===min?'fastest':''}'><div>${r.name}</div><div>${r.url}</div><div>${r.status}</div><div class='bar'><div class='fill' style='width:${width}%'></div></div><div>${r.reachable?r.latency_ms+' ms':'failed'}</div></div>`;}html+='</section>';c.innerHTML+=html;}}

function envFromReport(){if(!reportData)return'';const pick=(cat)=>reportData.results.filter(r=>r.category===cat&&r.reachable).sort((a,b)=>a.latency_ms-b.latency_ms)[0];const d=pick('docker')||{};const p=pick('pypi')||{};const n=pick('npm')||{};return `DOCKER_REGISTRY_MIRROR=${d.url||''}\nPIP_INDEX_URL=${p.url||''}\nNPM_CONFIG_REGISTRY=${n.url||''}`;}

document.getElementById('runBenchmark').onclick=benchmark;
document.getElementById('copyEnv').onclick=()=>navigator.clipboard.writeText(envFromReport());
document.getElementById('downloadReport').onclick=()=>{const blob=new Blob([JSON.stringify(reportData||{},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mirror-report.json';a.click();};
document.getElementById('mirrorsFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;mirrorsData=JSON.parse(await f.text());reportData=null;render();};
document.getElementById('dockerfileUpload').onchange=async e=>{const f=e.target.files[0];if(f)document.getElementById('dockerfileInput').value=await f.text();};
document.getElementById('optimizeDockerfile').onclick=()=>{const out=optimizeDockerfile(document.getElementById('dockerfileInput').value||'');document.getElementById('dockerfileOutput').textContent=out;const a=document.getElementById('downloadOptimized');a.href=URL.createObjectURL(new Blob([out],{type:'text/plain'}));a.download='Dockerfile.optimized';a.style.display='inline-block';};
loadMirrors().then(render);
