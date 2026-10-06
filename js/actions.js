import { catOf } from './config.js';
import { S, save, setS, empty } from './store.js';
import { faturaMonth } from './finance.js';
import { ui, render } from './views.js';
import { $, uid, fmt, round2, parseNum, todayISO, thisMonth, addM, toast } from './util.js';

export const A = {
  tab(d){ ui.tab=d.t; ui.editId=null; render(); },
  mes(d){ ui.mes=addM(ui.mes, Number(d.d)); render(); },
  dCat(d){ ui.draft.cat=d.id; keepDraft(); },
  dMeio(d){ ui.draft.meio=d.id; if(d.id!=='cartao') ui.draft.parcelado=false; keepDraft(); },
  dParc(d){ ui.draft.parcelado = d.v==='1'; keepDraft(); },
  saveG(){
    const v = parseNum($('#gValor').value);
    if(!(v>0)) return toast('Digite um valor');
    const data = $('#gData').value || todayISO();
    const desc = $('#gDesc').value.trim();
    if(ui.draft.meio==='cartao' && ui.draft.parcelado){
      const n = parseInt($('#gParc')?.value,10);
      if(!(n>=2)) return toast('Informe o número de parcelas');
      S.recorrentes.push({id:uid(), nome:desc||catOf(ui.draft.cat).n, valor:round2(v/n), tipo:'parcela', parcelas:n, meio:'cartao', inicio:faturaMonth(data), cat:ui.draft.cat});
      save(); toast(`Parcelado em ${n}x de ${fmt(v/n)} — está em Fixos`);
    } else {
      S.gastos.push({id:uid(), data, valor:round2(v), cat:ui.draft.cat, meio:ui.draft.meio, desc, criado:Date.now()});
      save(); toast('Gasto salvo ✓');
    }
    ui.draft.parcelado=false;
    render();
  },
  delG(d){ if(!confirm('Apagar este lançamento?')) return; S.gastos=S.gastos.filter(g=>g.id!==d.id); save(); render(); },
  editR(d){ ui.editId=d.id; render(); setTimeout(()=>$('#rNome').scrollIntoView({behavior:'smooth',block:'center'}),50); },
  cancelR(){ ui.editId=null; render(); },
  saveR(){
    const nome=$('#rNome').value.trim(), valor=parseNum($('#rValor').value), tipo=$('#rTipo').value, parcelas=parseInt($('#rParc').value,10);
    if(!nome) return toast('Dê um nome');
    if(!(valor>=0)) return toast('Valor inválido');
    if(tipo==='parcela' && !(parcelas>=2)) return toast('Informe o nº de parcelas');
    const obj={nome, valor:round2(valor), tipo, meio:$('#rMeio').value, inicio:$('#rIni').value||thisMonth(), cat:$('#rCat').value};
    if(tipo==='parcela') obj.parcelas=parcelas;
    if(ui.editId){ const r=S.recorrentes.find(x=>x.id===ui.editId); Object.assign(r,obj); if(tipo==='fixo') delete r.parcelas; }
    else S.recorrentes.push({id:uid(),...obj});
    ui.editId=null; save(); toast('Salvo ✓'); render();
  },
  delR(d){ if(!confirm('Apagar este item?')) return; S.recorrentes=S.recorrentes.filter(r=>r.id!==d.id); if(ui.editId===d.id) ui.editId=null; save(); render(); },
  saveM(){ const nome=$('#mNome').value.trim(), alvo=parseNum($('#mAlvo').value); if(!nome||!(alvo>0)) return toast('Preencha nome e valor'); S.metas.push({id:uid(),nome,alvo:round2(alvo),atual:0}); save(); render(); },
  delM(d){ if(!confirm('Apagar esta meta?')) return; S.metas=S.metas.filter(m=>m.id!==d.id); save(); render(); },
  movM(d){
    const m=S.metas.find(x=>x.id===d.id); const s=Number(d.s);
    const v=parseNum(prompt(s>0?`Quanto guardou em "${m.nome}"?`:`Quanto retirou de "${m.nome}"?`,''));
    if(!(v>0)) return;
    m.atual=round2(Math.max(0, m.atual + s*v)); save(); toast(s>0?'Boa! 💪':'Retirada registrada'); render();
  },
  saveLim(){ document.querySelectorAll('[data-lim]').forEach(i=>{ const v=parseNum(i.value); if(v>0) S.limites[i.dataset.lim]=round2(v); else delete S.limites[i.dataset.lim]; }); save(); toast('Limites salvos ✓'); },
  saveCfg(){
    const r=parseNum($('#cRenda').value), f=parseInt($('#cFech').value,10), v=parseInt($('#cVenc').value,10);
    if(!(r>=0)||!(f>=1&&f<=31)||!(v>=1&&v<=31)) return toast('Confira os valores');
    Object.assign(S.config,{renda:round2(r),fechamento:f,vencimento:v,configurado:true}); save(); toast('Ajustes salvos ✓');
  },
  export(){
    const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`meu-caixa-backup-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  },
  pickJson(){ $('#fileJson').click(); },
  pickCsv(){ $('#fileCsv').click(); },
  reset(){ if(!confirm('Apagar TODOS os dados deste aparelho? Exporte um backup antes se quiser guardar.')) return; setS(empty()); ui.tab='inicio'; render(); }
};

function keepDraft(){ // re-renderiza mantendo o que já foi digitado
  const keep={v:$('#gValor')?.value, d:$('#gData')?.value, s:$('#gDesc')?.value, p:$('#gParc')?.value};
  render();
  if(keep.v) $('#gValor').value=keep.v; if(keep.d) $('#gData').value=keep.d; if(keep.s) $('#gDesc').value=keep.s; if(keep.p&&$('#gParc')) $('#gParc').value=keep.p;
}
