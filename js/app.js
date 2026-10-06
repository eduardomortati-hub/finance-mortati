import { save, loadError } from './store.js';
import { ui, render, renderLista, totalParcelado } from './views.js';
import { A } from './actions.js';
import { initImports } from './import.js';
import { $, toast } from './util.js';

document.addEventListener('click', e=>{ const b=e.target.closest('[data-act]'); if(!b) return; e.preventDefault(); const f=A[b.dataset.act]; if(f) f(b.dataset,b); });
document.addEventListener('keydown', e=>{ if(e.key==='Enter' && ui.tab==='lancar' && e.target.tagName==='INPUT' && !e.target.closest('dialog')) A.saveG(); });
// busca e filtros do Início: atualiza só a lista, sem perder o foco
document.addEventListener('input', e=>{
  if(e.target.id==='gValor' || e.target.id==='gParc') return totalParcelado();
  const f = e.target.dataset?.filtro; if(!f) return; ui.busca[f] = e.target.value; renderLista();
});
// lembra quais seções recolhíveis estão abertas, para continuarem assim depois de salvar algo
document.addEventListener('toggle', e=>{ const id = e.target.dataset?.fold; if(!id) return; if(e.target.open) ui.abertos.add(id); else ui.abertos.delete(id); }, true);
// sem zoom de pinça (o Safari do iPhone ignora user-scalable=no)
for(const t of ['gesturestart','gesturechange']) document.addEventListener(t, e=>e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e=>{ if(e.touches.length>1) e.preventDefault(); }, {passive:false});
initImports();
save();
render();
if(loadError) toast("Não consegui ler os dados salvos. Uma cópia foi guardada; restaure um backup em Ajustes.");

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
