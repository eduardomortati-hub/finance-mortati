import { save, loadError } from './store.js';
import * as nuvem from './nuvem.js';
import { ui, render, renderLista, totalParcelado, sugestoesCat, catPeloNome, statusTexto } from './views.js';
import { A, depoisDeEntrar } from './actions.js';
import { initImports } from './import.js';
import { $, toast, discreto, setDiscreto } from './util.js';

document.addEventListener('click', e=>{ const b=e.target.closest('[data-act]'); if(!b) return; e.preventDefault(); const f=A[b.dataset.act]; if(f) f(b.dataset,b); });
document.addEventListener('keydown', e=>{
  if((e.key==='Enter' || e.key===' ') && e.target.matches?.('[role="button"][data-act]')){ e.preventDefault(); return e.target.click(); }
  if(e.key==='Enter' && e.target.id==='nCat'){ e.preventDefault(); return A.addCat(); }
  if(e.key==='Enter' && ui.tela && e.target.tagName==='INPUT'){ e.preventDefault(); return document.querySelector('.auth-box .btn')?.click(); }
  if(e.key==='Enter' && ui.tab==='lancar' && e.target.tagName==='INPUT' && !e.target.closest('dialog')) A.saveG();
});
// busca e filtros do Início: atualiza só a lista, sem perder o foco
document.addEventListener('input', e=>{
  if(e.target.id==='gValor' || e.target.id==='gParc') return totalParcelado();
  if(e.target.id==='nCat') return sugestoesCat();
  if(e.target.id==='gDesc') return catPeloNome();
  const f = e.target.dataset?.filtro; if(!f) return; ui.busca[f] = e.target.value; renderLista();
});
// caixa de sugestões de categoria: abre ao tocar no campo e fecha ao sair dele
document.addEventListener('focusin', e=>{ if(e.target.id==='nCat') sugestoesCat(); });
document.addEventListener('focusout', e=>{ if(e.target.id==='nCat') setTimeout(()=>{ if(document.activeElement?.id!=='nCat') sugestoesCat(false); }, 200); });
document.addEventListener('pointerdown', e=>{ if(e.target.closest('#catSug')) e.preventDefault(); });   // tocar na lista não tira o foco do campo
// lembra quais seções recolhíveis estão abertas, para continuarem assim depois de salvar algo
document.addEventListener('toggle', e=>{ const id = e.target.dataset?.fold; if(!id) return; if(e.target.open) ui.abertos.add(id); else ui.abertos.delete(id); }, true);
// sem zoom de pinça (o Safari do iPhone ignora user-scalable=no)
for(const t of ['gesturestart','gesturechange']) document.addEventListener(t, e=>e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e=>{ if(e.touches.length>1) e.preventDefault(); }, {passive:false});
setDiscreto(discreto.on);
initImports();
save();

/* ---------- conta: link do e-mail, tela de entrar e sincronização ---------- */
nuvem.aoMudar(
  ()=>{ const el = $('#syncStatus'); if(el) el.textContent = statusTexto(); },
  ()=>{ if(!nuvem.sessao()){ ui.tela = 'entrar'; render(); return; }      // sessão expirou
        if(!ui.tela && ui.tab!=='lancar') render(); });                    // chegaram dados de outro aparelho (não atrapalha quem está lançando)
nuvem.iniciarSync();
let link = null;
try{ link = await nuvem.lerLinkDoEmail(); }catch(e){ link = {erro:e.message}; }
if(link==='recovery') ui.tela = 'novaSenha';
else if(!nuvem.sessao() && !nuvem.semConta()) ui.tela = 'entrar';
render();
if(link?.erro) toast(link.erro);
if(link && !link.erro && link!=='recovery') depoisDeEntrar().catch(e=>toast(e.message));   // confirmou o e-mail: já entra
else if(nuvem.sessao() && ui.tela!=='novaSenha') nuvem.sincronizar();
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
