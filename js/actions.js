import { S, save, setS, catOf } from './store.js';
import { empty } from './model.js';
import { faturaMonth } from './finance.js';
import { ui, render } from './views.js';
import { ask } from './modal.js';
import { cifrar } from './crypto.js';
import { $, uid, fmt, round2, parseNum, todayISO, thisMonth, addM, diffM, mLabel, valIn, toast } from './util.js';

function download(texto, nome){
  const blob = new Blob([texto], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// aplica nomes e cores editados na lista de categorias (sem salvar)
function lerCats(){
  for(const k of S.cats){
    const n = document.querySelector(`[data-catn="${k.id}"]`), c = document.querySelector(`[data-catc="${k.id}"]`);
    if(n && n.value.trim()) k.n = n.value.trim().slice(0,40);
    if(c && /^#[0-9a-f]{6}$/i.test(c.value)) k.c = c.value.toLowerCase();
  }
}

export const A = {
  tab(d){ ui.tab=d.t; ui.editId=null; ui.editG=null; render(); },
  mes(d){ ui.mes=addM(ui.mes, Number(d.d)); render(); },
  dTipo(d){ ui.draft.tipo=d.v; keepDraft(); },
  dCat(d){ ui.draft.cat=d.id; keepDraft(); },
  dMeio(d){ ui.draft.meio=d.id; if(d.id!=='cartao') ui.draft.parcelado=false; keepDraft(); },
  dParc(d){ ui.draft.parcelado = d.v==='1'; keepDraft(); },

  saveG(){
    const v = parseNum($('#gValor').value);
    if(!(v>0)) return toast('Digite um valor');
    const data = $('#gData').value || todayISO();
    const desc = $('#gDesc').value.trim().slice(0,80);
    const d = ui.draft;
    if(ui.editG){
      const lista = ui.editG.k==='gasto' ? S.gastos : S.entradas;
      const x = lista.find(i=>i.id===ui.editG.id);
      if(x){ Object.assign(x, {valor:round2(v), data, desc}); if(ui.editG.k==='gasto') Object.assign(x, {cat:d.cat, meio:d.meio}); }
      ui.editG = null; ui.tab = 'inicio';
      save(); toast('Alterações salvas ✓');
    } else if(d.tipo==='entrada'){
      S.entradas.push({id:uid(), data, valor:round2(v), desc, criado:Date.now()});
      save(); toast('Entrada salva ✓');
    } else if(d.meio==='cartao' && d.parcelado){
      const n = parseInt($('#gParc')?.value,10);
      if(!(n>=2)) return toast('Informe o número de parcelas');
      S.recorrentes.push({id:uid(), nome:desc||catOf(d.cat).n, valor:round2(v/n), tipo:'parcela', parcelas:n, meio:'cartao', inicio:faturaMonth(data), cat:d.cat});
      save(); toast(`Parcelado em ${n}x de ${fmt(v/n)} — está em Fixos`);
    } else {
      S.gastos.push({id:uid(), data, valor:round2(v), cat:d.cat, meio:d.meio, desc, criado:Date.now()});
      save(); toast('Gasto salvo ✓');
    }
    d.parcelado = false;
    render();
  },
  editL(d){
    const x = (d.k==='gasto' ? S.gastos : S.entradas).find(i=>i.id===d.id); if(!x) return;
    ui.editG = {k:d.k, id:d.id};
    if(d.k==='gasto'){ ui.draft.cat = x.cat; ui.draft.meio = x.meio; }
    ui.tab = 'lancar'; render();
  },
  cancelG(){ ui.editG=null; ui.tab='inicio'; render(); },
  delL(d){
    if(!confirm(d.k==='gasto' ? 'Apagar este gasto?' : 'Apagar esta entrada?')) return;
    if(d.k==='gasto') S.gastos = S.gastos.filter(g=>g.id!==d.id); else S.entradas = S.entradas.filter(e=>e.id!==d.id);
    save(); render();
  },
  repG(d){
    const g = S.gastos.find(x=>x.id===d.id); if(!g) return;
    Object.assign(ui.draft, {tipo:'gasto', cat:g.cat, meio:g.meio, parcelado:false});
    render();
    $('#gValor').value = valIn(g.valor); $('#gDesc').value = g.desc;
    toast('Confira a data e toque em Salvar');
  },

  editR(d){ ui.editId=d.id; render(); setTimeout(()=>$('#rNome').scrollIntoView({behavior:'smooth',block:'center'}),50); },
  cancelR(){ ui.editId=null; render(); },
  saveR(){
    const nome=$('#rNome').value.trim().slice(0,80), valor=parseNum($('#rValor').value), tipo=$('#rTipo').value, parcelas=parseInt($('#rParc').value,10);
    const inicio = $('#rIni').value || thisMonth(), fim = $('#rFim').value || null;
    if(!nome) return toast('Dê um nome');
    if(!(valor>=0)) return toast('Valor inválido');
    if(tipo==='parcela' && !(parcelas>=2)) return toast('Informe o nº de parcelas');
    if(fim && diffM(inicio, fim) < 0) return toast('O último mês não pode ser antes do início');
    const obj = {nome, valor:round2(valor), tipo, meio:$('#rMeio').value, inicio, cat:$('#rCat').value};
    if(tipo==='parcela') obj.parcelas = parcelas;
    const r = ui.editId && S.recorrentes.find(x=>x.id===ui.editId);
    const vig = $('#rVig')?.value;
    if(r && r.tipo==='fixo' && tipo==='fixo' && obj.valor!==r.valor && vig && diffM(inicio, vig) > 0){
      // reajuste: o valor antigo fica até o mês anterior; o novo vale a partir de `vig`
      if(fim && diffM(vig, fim) < 0) return toast('O último mês não pode ser antes do reajuste');
      Object.assign(r, {...obj, valor:r.valor, fim:addM(vig,-1)});
      const novo = {id:uid(), ...obj, inicio:vig}; if(fim) novo.fim = fim;
      S.recorrentes.push(novo);
      toast(`Reajuste salvo: ${fmt(obj.valor)} a partir de ${mLabel(vig)}`);
    } else if(r){
      Object.assign(r, obj); if(tipo==='fixo') delete r.parcelas;
      if(fim) r.fim = fim; else delete r.fim;
      toast('Salvo ✓');
    } else {
      const n = {id:uid(), ...obj}; if(fim) n.fim = fim;
      S.recorrentes.push(n); toast('Salvo ✓');
    }
    ui.editId=null; save(); render();
  },
  // encerrar: continua nos meses passados e sai a partir do próximo
  endR(d){
    const r = S.recorrentes.find(x=>x.id===d.id); if(!r) return;
    const hoje = thisMonth();
    if(diffM(r.inicio, hoje) < 0){   // ainda nem começou: não há histórico a preservar
      if(!confirm(`Apagar "${r.nome}"? Ele ainda não começou.`)) return;
      S.recorrentes = S.recorrentes.filter(x=>x.id!==r.id);
    } else {
      if(!confirm(`Encerrar "${r.nome}"?\n\nEle continua contando até ${mLabel(hoje)} e sai a partir do mês que vem.`)) return;
      r.fim = hoje;
    }
    if(ui.editId===r.id) ui.editId=null;
    save(); toast('Encerrado ✓'); render();
  },
  delR(d){
    if(!confirm('Apagar de vez?\n\nEle some também dos meses passados — a sobra e a fatura desses meses vão mudar. Para só parar de contar daqui pra frente, use Encerrar.')) return;
    S.recorrentes = S.recorrentes.filter(r=>r.id!==d.id); if(ui.editId===d.id) ui.editId=null; save(); render();
  },

  saveM(){ const nome=$('#mNome').value.trim().slice(0,80), alvo=parseNum($('#mAlvo').value); if(!nome||!(alvo>0)) return toast('Preencha nome e valor'); S.metas.push({id:uid(),nome,alvo:round2(alvo),atual:0,movs:[]}); save(); render(); },
  // remover meta: some da lista, mas o que foi guardado continua contando nos meses em que foi guardado
  arqM(d){
    const m = S.metas.find(x=>x.id===d.id); if(!m) return;
    if(!confirm(`Remover a meta "${m.nome}"?\n\nO que você guardou nela continua registrado nos meses em que guardou.`)) return;
    m.arquivada = true; save(); render();
  },
  async movM(d){
    const m = S.metas.find(x=>x.id===d.id), s = Number(d.s); if(!m) return;
    const r = await ask({titulo: s>0 ? `Guardar em "${m.nome}"` : `Retirar de "${m.nome}"`,
      texto: s>0 ? 'Esse valor sai da sobra deste mês.' : 'Esse valor volta para a sobra deste mês.',
      campos:[{id:'v', rotulo:'Valor', inputmode:'decimal', placeholder:'0,00'}],
      botoes:[{id:'ok', rotulo: s>0 ? 'Guardar' : 'Retirar'}],
      validar:(b,v)=> parseNum(v.v)>0 ? '' : 'Digite um valor'});
    if(!r) return;
    const novo = round2(Math.max(0, m.atual + s*parseNum(r.valores.v))), delta = round2(novo - m.atual);
    if(!delta) return toast('A meta já está zerada');
    m.atual = novo; (m.movs ||= []).push({data:todayISO(), valor:delta});
    save(); toast(s>0?'Boa! 💪':'Retirada registrada'); render();
  },
  saveLim(){ document.querySelectorAll('[data-lim]').forEach(i=>{ const v=parseNum(i.value); if(v>0) S.limites[i.dataset.lim]=round2(v); else delete S.limites[i.dataset.lim]; }); save(); toast('Limites salvos ✓'); },

  saveCats(){ lerCats(); save(); toast('Categorias salvas ✓'); render(); },
  addCat(){
    const n = $('#nCat').value.trim().slice(0,40); if(!n) return toast('Digite o nome da categoria');
    lerCats();
    S.cats.push({id:'c'+uid(), n, c:$('#nCatC').value.toLowerCase()});
    save(); toast('Categoria criada ✓'); render();
  },
  delCat(d){
    const k = S.cats.find(c=>c.id===d.id); if(!k || k.id==='outros') return;
    const usos = S.gastos.filter(g=>g.cat===k.id).length + S.recorrentes.filter(r=>r.cat===k.id).length;
    if(!confirm(`Apagar a categoria "${k.n}"?${usos?`\n\n${usos} lançamento(s) e fixo(s) vão para "Outros".`:''}`)) return;
    lerCats();
    S.gastos.forEach(g=>{ if(g.cat===k.id) g.cat='outros'; });
    S.recorrentes.forEach(r=>{ if(r.cat===k.id) r.cat='outros'; });
    delete S.limites[k.id];
    S.cats = S.cats.filter(c=>c.id!==k.id);
    if(ui.draft.cat===k.id) ui.draft.cat = null;
    if(ui.busca.cat===k.id) ui.busca.cat = '';
    save(); render();
  },

  saveCfg(){
    const r=parseNum($('#cRenda').value||'0'), f=parseInt($('#cFech').value,10), v=parseInt($('#cVenc').value,10);
    if(!(r>=0)||!(f>=1&&f<=31)||!(v>=1&&v<=31)) return toast('Confira os valores');
    Object.assign(S.config,{renda:round2(r),fechamento:f,vencimento:v,configurado:true}); save(); toast('Ajustes salvos ✓');
  },
  async export(){
    const r = await ask({titulo:'Exportar backup',
      texto:'Proteja o arquivo com uma senha: ele vai parar em Downloads, e-mail ou WhatsApp, e sem senha quem abrir vê todas as suas finanças. <b>Se esquecer a senha, o backup não abre.</b>',
      campos:[{id:'s1', rotulo:'Senha', tipo:'password'}, {id:'s2', rotulo:'Repita a senha', tipo:'password'}],
      botoes:[{id:'com', rotulo:'Exportar com senha'}, {id:'sem', rotulo:'Exportar sem senha'}],
      validar:(b,v)=> b==='sem' ? '' : v.s1.length<6 ? 'Use pelo menos 6 caracteres' : v.s1!==v.s2 ? 'As senhas não conferem' : ''});
    if(!r) return;
    S.config.ultimoBackup = todayISO();
    let texto = JSON.stringify(S, null, 2);
    if(r.botao==='com'){ toast('Protegendo o backup…'); texto = await cifrar(texto, r.valores.s1); }
    download(texto, `meu-caixa-backup-${todayISO()}${r.botao==='com'?'-protegido':''}.json`);
    save(); render();
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
