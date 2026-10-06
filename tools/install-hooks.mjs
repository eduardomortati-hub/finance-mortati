// Instala o pre-commit que atualiza VERSION do sw.js: `node tools/install-hooks.mjs` (roda também no `npm install`)
import { writeFileSync, existsSync, chmodSync } from 'node:fs';

const hook = new URL('../.git/hooks/pre-commit', import.meta.url);
if(!existsSync(new URL('../.git/hooks/', import.meta.url))){ console.log('sem .git, nada a instalar'); process.exit(0); }
writeFileSync(hook, `#!/bin/sh
# gerado por tools/install-hooks.mjs
node tools/stamp-sw.mjs && git add sw.js
`);
try{ chmodSync(hook, 0o755); }catch(e){}
console.log('pre-commit instalado');
