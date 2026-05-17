function optimizeDockerfile(input){
  let t=input;
  const args=["PIP_INDEX_URL","NPM_CONFIG_REGISTRY","MAVEN_MIRROR_URL","APT_UBUNTU_MIRROR","APT_UBUNTU_SECURITY_MIRROR","APT_DEBIAN_MIRROR","APT_DEBIAN_SECURITY_MIRROR"];
  const lines=t.split('\n');
  const fromIdx=lines.findIndex(l=>l.startsWith('FROM '));
  args.forEach(a=>{if(!new RegExp('^ARG '+a+'(=|$)','m').test(t)){lines.splice(Math.max(0,fromIdx),0,'ARG '+a);}});
  t=lines.join('\n');
  if(/python/i.test(t)&&!/^ENV PIP_INDEX_URL=/m.test(t)) t=t.replace(/^ARG PIP_INDEX_URL.*$/m, m=>m+'\nENV PIP_INDEX_URL=${PIP_INDEX_URL}');
  if(/node|npm|yarn|pnpm/i.test(t)&&!/^ENV NPM_CONFIG_REGISTRY=/m.test(t)) t=t.replace(/^ARG NPM_CONFIG_REGISTRY.*$/m, m=>m+'\nENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}');
  if(/maven|gradle|openjdk|temurin/i.test(t)&&!t.includes('mirror-toolkit: maven-mirror-snippet')) t+='\n\n# mirror-toolkit: maven-mirror-snippet\n# Optional Maven mirror snippet using MAVEN_MIRROR_URL\n';
  if(t.includes('# mirror-toolkit: enable-apt-rewrite')&&!t.includes('mirror-toolkit apt rewrite block')) t+='\n\n# mirror-toolkit apt rewrite block\n# Safe apt rewrite logic can be inserted during image build.\n';
  return t;
}
let current='';
document.getElementById('file').addEventListener('change', async e=>{const f=e.target.files[0];if(f) current=await f.text();});
document.getElementById('opt').addEventListener('click', ()=>{const o=optimizeDockerfile(current||'');document.getElementById('preview').textContent=o;const blob=new Blob([o],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.getElementById('download');a.href=url;a.download='Dockerfile.optimized';a.style.display='inline-block';});
