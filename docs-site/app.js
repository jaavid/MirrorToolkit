function optimizeDockerfile(input){
  const original = input || '';
  const lines=original.split('\n');
  const args=["PIP_INDEX_URL","NPM_CONFIG_REGISTRY","MAVEN_MIRROR_URL","APT_UBUNTU_MIRROR","APT_UBUNTU_SECURITY_MIRROR","APT_DEBIAN_MIRROR","APT_DEBIAN_SECURITY_MIRROR"];
  const py=/^\s*FROM\s+.*python/im.test(original)||/pip|requirements\.txt|pyproject\.toml/i.test(original);
  const nd=/^\s*FROM\s+.*node/im.test(original)||/npm|pnpm|yarn|package\.json/i.test(original);
  const jv=/^\s*FROM\s+.*(maven|gradle|openjdk|eclipse-temurin|amazoncorretto|zulu)/im.test(original)||/(^|\s)(mvn|gradle)(\s|$)|pom\.xml|build\.gradle/i.test(original);
  const out=[]; let stage=[]; let inStage=false;
  function flush(){
    if(!inStage) return;
    const filtered=stage.filter(l=>!/^\s*ARG\s+(PIP_INDEX_URL|NPM_CONFIG_REGISTRY|MAVEN_MIRROR_URL|APT_UBUNTU_MIRROR|APT_UBUNTU_SECURITY_MIRROR|APT_DEBIAN_MIRROR|APT_DEBIAN_SECURITY_MIRROR)(\s*=.*)?\s*$/i.test(l)&&l.trim()!=="ENV PIP_INDEX_URL=${PIP_INDEX_URL}"&&l.trim()!=="ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}");
    args.forEach(a=>out.push(`ARG ${a}`));
    if(py) out.push('ENV PIP_INDEX_URL=${PIP_INDEX_URL}');
    if(nd) out.push('ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}');
    out.push(...filtered); stage=[];
  }
  for(const l of lines){ if(/^\s*FROM\s+/i.test(l)){ flush(); out.push(l); inStage=true; continue; } if(!inStage) out.push(l); else stage.push(l); }
  flush();
  let t=out.join('\n');
  if(jv && !t.includes('mirror-toolkit: maven-mirror-snippet')) t+='\n\n# mirror-toolkit: maven-mirror-snippet\n# Optional Maven mirror snippet:\n# RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<\'XML\'\n# <settings><mirrors><mirror><id>mirror</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>\n# XML\n';
  if(jv && t.includes('# mirror-toolkit: enable-maven-mirror')&&!t.includes('mirror-toolkit maven active block')) t+='\n# mirror-toolkit maven active block\nRUN set -eu; \\\n    mkdir -p /root/.m2; \\\n    cat > /root/.m2/settings.xml <<\'XML\'\n<settings><mirrors><mirror><id>mirror-toolkit</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>\nXML\n';
  if(t.includes('# mirror-toolkit: enable-apt-rewrite')&&!t.includes('mirror-toolkit apt rewrite block')) t+='\n# mirror-toolkit apt rewrite block\n# This only changes apt sources inside the Docker image build; host APT is never modified.\nRUN set -eu; \\\n    [ -f /etc/os-release ] && . /etc/os-release || true; \\\n    [ -f /etc/apt/sources.list ] && cp /etc/apt/sources.list /etc/apt/sources.list.bak || true; \\\n    [ -f /etc/apt/sources.list.d/debian.sources ] && cp /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources.bak || true; \\\n    [ -f /etc/apt/sources.list.d/ubuntu.sources ] && cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak || true; \\\n    if [ "${ID:-}" = "debian" ] || [ "${ID_LIKE:-}" = "debian" ]; then \\\n      [ -n "${APT_DEBIAN_MIRROR:-}" ] && [ -f /etc/apt/sources.list ] && sed -i "s|http://deb.debian.org/debian|${APT_DEBIAN_MIRROR}|g; s|http://security.debian.org/debian-security|${APT_DEBIAN_SECURITY_MIRROR:-$APT_DEBIAN_MIRROR}|g" /etc/apt/sources.list || true; \\\n    elif [ "${ID:-}" = "ubuntu" ] || [ "${ID_LIKE:-}" = "ubuntu" ] || [ "${ID_LIKE:-}" = "debian ubuntu" ]; then \\\n      [ -n "${APT_UBUNTU_MIRROR:-}" ] && [ -f /etc/apt/sources.list ] && sed -i "s|http://archive.ubuntu.com/ubuntu|${APT_UBUNTU_MIRROR}|g; s|http://security.ubuntu.com/ubuntu|${APT_UBUNTU_SECURITY_MIRROR:-$APT_UBUNTU_MIRROR}|g" /etc/apt/sources.list || true; \\\n    fi\n';
  return t;
}
let current='';
document.getElementById('file').addEventListener('change', async e=>{const f=e.target.files[0];if(f){current=await f.text();document.getElementById('paste').value=current;}});
document.getElementById('opt').addEventListener('click', ()=>{const raw=document.getElementById('paste').value||current||'';const o=optimizeDockerfile(raw);document.getElementById('preview').textContent=o;const blob=new Blob([o],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.getElementById('download');a.href=url;a.download='Dockerfile.optimized';a.style.display='inline-block';});
