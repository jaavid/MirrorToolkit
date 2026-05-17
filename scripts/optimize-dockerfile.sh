#!/usr/bin/env bash
set -Eeuo pipefail

profile="conservative"
report_file=""
env_file=".env.mirrors"

usage(){
  cat >&2 <<USAGE
Usage: $0 [--profile conservative|production|restricted-network|ci] [--report output.json] [--env-file .env.mirrors] input.Dockerfile output.Dockerfile
USAGE
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) profile="${2:-}"; shift 2 ;;
    --report) report_file="${2:-}"; shift 2 ;;
    --env-file) env_file="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    --*) echo "Unknown option: $1" >&2; usage ;;
    *) break ;;
  esac
done

[[ $# -eq 2 ]] || usage
[[ "$profile" =~ ^(conservative|production|restricted-network|ci)$ ]] || { echo "Invalid profile: $profile" >&2; exit 1; }
in="$1"; out="$2"
[[ -f "$in" ]] || { echo "Input not found: $in" >&2; exit 1; }

python3 - "$in" "$out" "$profile" "$report_file" "$env_file" <<'PY'
import json,re,sys
from pathlib import Path
inp, outp, profile, report_file, env_file = sys.argv[1:6]
text = Path(inp).read_text()
lines = text.splitlines()

def parse_env_file(path):
    vals={}
    p=Path(path)
    if not p.exists(): return vals
    for ln in p.read_text().splitlines():
        if not ln or ln.startswith('#') or '=' not in ln: continue
        k,v=ln.split('=',1); vals[k.strip()]=v.strip().strip('"').strip("'")
    return vals

envvals=parse_env_file(env_file)
report={"profile":profile,"detected":{"languages":[],"package_managers":[],"base_images":[],"stages":[]},"changes":[],"warnings":[],"skipped":[]}

stages=[]; cur=None
for i,l in enumerate(lines):
    m=re.match(r'^\s*FROM\s+([^\s]+)',l,re.I)
    if m:
        if cur: stages.append(cur)
        cur={"from":m.group(1),"start":i,"end":len(lines)-1}
    if cur: cur["end"]=i
if cur: stages.append(cur)

full='\n'.join(lines).lower()
if 'node' in full or 'npm ' in full or 'package.json' in full: report['detected']['languages'].append('node')
if 'python' in full or 'pip ' in full or 'requirements.txt' in full: report['detected']['languages'].append('python')
if any(x in full for x in ['maven','openjdk','temurin','mvn '] ): report['detected']['languages'].append('java')
for pm,kws in [('npm',['npm ci','npm install','package-lock.json']),('pnpm',['pnpm ','pnpm-lock.yaml']),('yarn',['yarn ','yarn.lock']),('pip',['pip install','requirements.txt']),('poetry',['poetry install','poetry.lock']),('uv',['uv pip','uv.lock']),('maven',['mvn ','pom.xml']),('gradle',['gradle','build.gradle'])]:
    if any(k in full for k in kws): report['detected']['package_managers'].append(pm)

report['detected']['base_images']=[s['from'] for s in stages]

out=[]
inserted_global=False
if stages and profile!='conservative':
    if any('node' in s['from'].lower() for s in stages): out.append('ARG NODE_IMAGE=node:20-alpine')
    if any('python' in s['from'].lower() for s in stages): out.append('ARG PYTHON_IMAGE=python:3.12-slim')
    if any(any(x in s['from'].lower() for x in ['maven','openjdk','temurin']) for s in stages): out.append('ARG JAVA_IMAGE=eclipse-temurin:21-jre')
    if out: inserted_global=True; report['changes'].append('Inserted global base-image ARG defaults for non-conservative profile.')

stage_idx=-1
seen_by_stage=[]
for idx,l in enumerate(lines):
    fm=re.match(r'^(\s*FROM\s+)',l,re.I)
    if fm:
        stage_idx+=1
        out.append(l)
        frag=[]
        stext='\n'.join(lines[stages[stage_idx]['start']:stages[stage_idx]['end']+1]).lower() if stage_idx < len(stages) else ''
        is_node=any(x in stext for x in [' node', 'npm ', 'pnpm ', 'yarn ', 'package.json']) or 'node' in l.lower()
        is_py=any(x in stext for x in [' python', 'pip ', 'requirements.txt', 'pyproject.toml']) or 'python' in l.lower()
        is_java=any(x in stext for x in ['mvn ','maven','pom.xml']) or any(x in l.lower() for x in ['maven','openjdk','temurin'])
        if is_node: frag += ['ARG NPM_CONFIG_REGISTRY','ARG PNPM_REGISTRY','ARG YARN_NPM_REGISTRY_SERVER']
        if is_py: frag += ['ARG PIP_INDEX_URL','ARG PIP_EXTRA_INDEX_URL']
        if is_java: frag += ['ARG MAVEN_MIRROR_URL']
        if '# mirror-toolkit: enable-apt-rewrite' in text and any(x in l.lower() for x in ['debian','ubuntu']):
            frag += ['ARG APT_UBUNTU_MIRROR','ARG APT_UBUNTU_SECURITY_MIRROR','ARG APT_DEBIAN_MIRROR','ARG APT_DEBIAN_SECURITY_MIRROR']
        for a in frag:
            out.append(a)
        if frag: report['changes'].append(f"Injected stage ARGs for stage {stage_idx+1}: {', '.join(frag)}")
        seen_by_stage.append(set(x.split()[1] for x in frag))
        continue

    nl=l
    if profile in ('production','restricted-network','ci'):
        m=re.match(r'^\s*ENV\s+NPM_CONFIG_REGISTRY=(https?://\S+)',l)
        if m:
            val=m.group(1)
            out.append(f'ARG NPM_CONFIG_REGISTRY={val}')
            out.append('ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}')
            report['changes'].append('Normalized hardcoded NPM_CONFIG_REGISTRY ENV to ARG-based form.')
            continue
        m2=re.search(r'npm\s+config\s+set\s+registry\s+(https?://\S+)',l)
        if m2:
            nl=re.sub(r'npm\s+config\s+set\s+registry\s+https?://\S+','npm config set registry "${NPM_CONFIG_REGISTRY}"',l)
            report['changes'].append('Rewrote hardcoded npm config registry command to build-arg variable.')
        if 'pip install' in l and '--index-url ' in l and re.search(r'--index-url\s+https?://\S+',l):
            nl=re.sub(r'--index-url\s+https?://\S+','--index-url "${PIP_INDEX_URL}"',nl)
            report['changes'].append('Rewrote hardcoded pip --index-url to ${PIP_INDEX_URL}.')
    out.append(nl)

# dedupe exact repeated injected ARG/ENV lines while preserving others
final=[]; seen=set()
managed={"NODE_IMAGE","PYTHON_IMAGE","JAVA_IMAGE","NPM_CONFIG_REGISTRY","PNPM_REGISTRY","YARN_NPM_REGISTRY_SERVER","PIP_INDEX_URL","PIP_EXTRA_INDEX_URL","MAVEN_MIRROR_URL","APT_UBUNTU_MIRROR","APT_UBUNTU_SECURITY_MIRROR","APT_DEBIAN_MIRROR","APT_DEBIAN_SECURITY_MIRROR"}
for l in out:
    key=l.strip()
    m=re.match(r'^ARG\s+([A-Z0-9_]+)(=.*)?$',key)
    managed_line = (m and m.group(1) in managed) or key in ('ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}','ENV PIP_INDEX_URL=${PIP_INDEX_URL}')
    if managed_line:
        if key in seen: continue
        seen.add(key)
    final.append(l)

Path(outp).write_text('\n'.join(final)+'\n')
if report_file:
    Path(report_file).write_text(json.dumps(report,indent=2)+"\n")
print(f"Optimized Dockerfile written to {outp}")
if report_file: print(f"Report written to {report_file}")
PY
