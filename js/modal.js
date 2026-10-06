// Janela de diálogo simples (<dialog>) para pedir valores e senhas.
// ask() resolve com {botao, valores} ou null se a pessoa cancelar.
import { $, esc } from './util.js';

export function ask({titulo, texto='', campos=[], botoes=[{id:'ok', rotulo:'OK'}], cancelar='Cancelar', validar}){
  const dlg = $('#dlg');
  dlg.innerHTML = `<h2>${esc(titulo)}</h2>${texto?`<p class="note">${texto}</p>`:''}
    ${campos.map(c=>`<label for="dlg-${c.id}">${esc(c.rotulo)}</label><input id="dlg-${c.id}" type="${c.tipo||'text'}" ${c.tipo==='password'?'autocomplete="new-password"':'autocomplete="off"'} ${c.inputmode?`inputmode="${c.inputmode}"`:''} placeholder="${esc(c.placeholder||'')}">`).join('')}
    <p class="dlg-erro neg sm" hidden></p>
    ${botoes.map((b,i)=>`<button class="btn ${i?'sec':''}" data-dlg="${b.id}">${esc(b.rotulo)}</button>`).join('')}
    <button class="btn sec" data-dlg="">${esc(cancelar)}</button>`;
  return new Promise(resolve=>{
    const fim = r => { dlg.onclick = dlg.onkeydown = dlg.oncancel = null; if(dlg.open) dlg.close(); resolve(r); };
    const enviar = botao => {
      const valores = Object.fromEntries(campos.map(c=>[c.id, $('#dlg-'+c.id).value]));
      const erro = validar ? validar(botao, valores) : '';
      if(erro){ const p = dlg.querySelector('.dlg-erro'); p.textContent = erro; p.hidden = false; return; }
      fim({botao, valores});
    };
    dlg.onclick = e=>{ const b = e.target.closest('[data-dlg]'); if(!b) return; b.dataset.dlg ? enviar(b.dataset.dlg) : fim(null); };
    dlg.onkeydown = e=>{ if(e.key==='Enter' && e.target.tagName==='INPUT'){ e.preventDefault(); enviar(botoes[0].id); } };
    dlg.oncancel = e=>{ e.preventDefault(); fim(null); };
    dlg.showModal();
    const first = dlg.querySelector('input'); if(first) first.focus();
  });
}
