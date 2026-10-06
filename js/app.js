import { save } from './store.js';
import { ui, render } from './views.js';
import { A } from './actions.js';
import { initImports } from './import.js';
import { $ } from './util.js';

document.addEventListener('click', e=>{ const b=e.target.closest('[data-act]'); if(!b) return; e.preventDefault(); const f=A[b.dataset.act]; if(f) f(b.dataset,b); });
document.addEventListener('keydown', e=>{ if(e.key==='Enter' && ui.tab==='lancar' && e.target.tagName==='INPUT') A.saveG(); });
initImports();
save();
render();

// pede ao navegador para não apagar os dados quando faltar espaço
navigator.storage?.persist?.().catch(()=>{});

/* ---------- PWA: offline + aviso de nova versão ---------- */
if('serviceWorker' in navigator){
  // recarrega só quando a pessoa tocou em "Atualizar" (na primeira instalação o SW também assume a página, sem precisar recarregar)
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(!updating) return; updating = false; location.reload(); });
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    const offer = w => {
      $('#upd').hidden = false;
      $('#updBtn').onclick = () => { updating = true; w.postMessage('skipWaiting'); };
    };
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', ()=>{
      const w = reg.installing;
      w.addEventListener('statechange', ()=>{ if(w.state==='installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(()=>{});
}
