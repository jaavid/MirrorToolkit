function optimizeDockerfile(input){
  const lines=input.split('\n');
  const args=["PIP_INDEX_URL","NPM_CONFIG_REGISTRY","MAVEN_MIRROR_URL","APT_UBUNTU_MIRROR","APT_UBUNTU_SECURITY_MIRROR","APT_DEBIAN_MIRROR","APT_DEBIAN_SECURITY_MIRROR"];
  const py=/^\s*FROM\s+.*python/im.test(input)||/pip|requirements\.txt|pyproject\.toml/i.test(input);
  const nd=/^\s*FROM\s+.*node/im.test(input)||/npm|pnpm|yarn|package\.json/i.test(input);
  const out=[]; let stage=[]; let inStage=false;
  function flush(){
    if(!inStage) return;
    const filtered=stage.filter(l=>!/^\s*ARG\s+(PIP_INDEX_URL|NPM_CONFIG_REGISTRY|MAVEN_MIRROR_URL|APT_UBUNTU_MIRROR|APT_UBUNTU_SECURITY_MIRROR|APT_DEBIAN_MIRROR|APT_DEBIAN_SECURITY_MIRROR)(\s*=.*)?\s*$/i.test(l)&&l.trim()!=="ENV PIP_INDEX_URL=${PIP_INDEX_URL}"&&l.trim()!=="ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}");
    args.forEach(a=>out.push(`ARG ${a}`));
    if(py) out.push('ENV PIP_INDEX_URL=${PIP_INDEX_URL}');
    if(nd) out.push('ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}');
    out.push(...filtered); stage=[];
  }
  for(const l of lines){
    if(/^\s*FROM\s+/i.test(l)){ flush(); out.push(l); inStage=true; continue; }
    if(!inStage) out.push(l); else stage.push(l);
  }
  flush();
  let t=out.join('\n');
  if(/maven|gradle|openjdk|temurin/i.test(t)&&!t.includes('mirror-toolkit: maven-mirror-snippet')) t+='\n\n# mirror-toolkit: maven-mirror-snippet\n# Optional Maven mirror snippet:\n# RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<\'XML\'\n# <settings><mirrors><mirror><id>mirror</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>\n# XML\n';
  if(t.includes('# mirror-toolkit: enable-maven-mirror')&&!t.includes('mirror-toolkit maven active block')) t+='\n# mirror-toolkit maven active block\nRUN set -eu; mkdir -p /root/.m2; cat > /root/.m2/settings.xml <<\'XML\'\n<settings><mirrors><mirror><id>mirror-toolkit</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>\nXML\n';
  if(t.includes('# mirror-toolkit: enable-apt-rewrite')&&!t.includes('mirror-toolkit apt rewrite block')) t+='\n# mirror-toolkit apt rewrite block\n# This only changes apt sources inside Docker build; host APT is never modified.\nRUN set -eu; [ -f /etc/os-release ] && . /etc/os-release || true\n';
  return t;
}
let current='';
document.getElementById('file').addEventListener('change', async e=>{const f=e.target.files[0];if(f) current=await f.text();});
document.getElementById('opt').addEventListener('click', ()=>{const o=optimizeDockerfile(current||'');document.getElementById('preview').textContent=o;const blob=new Blob([o],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.getElementById('download');a.href=url;a.download='Dockerfile.optimized';a.style.display='inline-block';});
