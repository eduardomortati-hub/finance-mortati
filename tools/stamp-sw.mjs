// Atualiza VERSION no sw.js com um hash dos arquivos do app.
// Qualquer mudança em qualquer arquivo gera uma versão nova, e o app instalado oferece a atualização.
// Roda sozinho no pre-commit (tools/install-hooks.mjs). Uso manual: `node tools/stamp-sw.mjs [--check]`
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const swUrl = new URL('sw.js', root);
const sw = readFileSync(swUrl, 'utf8');
const files = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);

export function computeVersion(){
  const h = createHash('sha256');
  for(const f of files){
    const path = f==='./' ? 'index.html' : f.replace(/^\.\//,'');
    h.update(path + '\0'); h.update(readFileSync(new URL(path, root))); h.update('\0');
  }
  // o próprio sw.js também conta, menos a linha da versão
  h.update(sw.replace(/const VERSION = '[^']*';/, ''));
  return h.digest('hex').slice(0, 12);
}

if(process.argv[1]?.replace(/\\/g,'/').endsWith('tools/stamp-sw.mjs')){
  const v = computeVersion(), atual = sw.match(/const VERSION = '([^']*)';/)[1];
  if(process.argv.includes('--check')){
    if(v !== atual){ console.error(`sw.js desatualizado: VERSION é '${atual}', deveria ser '${v}'. Rode: node tools/stamp-sw.mjs`); process.exit(1); }
    console.log('sw.js em dia:', v);
  } else if(v !== atual){
    writeFileSync(swUrl, sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${v}';`));
    console.log('sw.js VERSION →', v);
  }
}
