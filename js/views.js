import { MEIOS, CORES_CARTAO, meioOf } from './config.js';
import { S, catOf, cartaoOf, cartoesAtivos } from './store.js';
import { calc, recInMonth, faturaPeriodo, vencimentoData, infoCartao } from './finance.js';
import { $, esc, fmt, todayISO, thisMonth, addM, diffM, mLabel, dLabel, sum, normTxt, diasEntre, addDias, valIn } from './util.js';

// estado da interface (não é salvo)
export const ui = {tab:'inicio', mes:thisMonth(), draft:{tipo:'gasto', cat:null, meio:'cartao', parcelado:false},
  editId:null, editG:null, busca:{q:'', cat:'', meio:''}};

const ymBR = k => mLabel(k,true)+'/'+k.slice(2,4);
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const chip = (on, act, id, txt) => `<button class="chip ${on?'on':''}" aria-pressed="${on}" data-act="${act}" data-id="${esc(id)}">${txt}</button>`;
const banner = t => `<div class="banner" style="margin-bottom:12px">${t}</div>`;
const emDias = n => n===0 ? 'hoje' : n===1 ? 'amanhã' : `em ${n} dias`;
// meio de pagamento para exibir: com mais de um cartão, mostra o nome do cartão
export const meioLabel = x => x.meio==='cartao' && S.cartoes.length>1 ? cartaoOf(x.cartao).nome : meioOf(x.meio);

let lastTab = null;
export function render(){
  document.querySelectorAll('nav button').forEach(b=>{
    const on = b.dataset.t===ui.tab;
    b.classList.toggle('on', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $('#mesBox').style.visibility = ui.tab==='inicio' ? 'visible' : 'hidden';
  $('#mesLbl').textContent = mLabel(ui.mes);
  $('#view').innerHTML = ({inicio:vInicio, lancar:vLancar, fixos:vFixos, metas:vMetas, ajustes:vAjustes})[ui.tab]();
  if(ui.tab==='inicio') renderLista();
  if(ui.tab==='lancar'){ const v=$('#gValor'); if(v && !v.value) setTimeout(()=>v.focus(),50); }
  if(ui.tab!==lastTab) window.scrollTo(0,0);   // só volta ao topo ao trocar de aba
  lastTab = ui.tab;
}

/* ---------- avisos ---------- */
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const instalado = () => navigator.standalone===true || matchMedia('(display-mode: standalone)').matches;
const temDados = () => S.gastos.length + S.entradas.length + S.recorrentes.length + S.metas.length > 0;
export const diasSemBackup = () => S.config.ultimoBackup ? diasEntre(S.config.ultimoBackup, todayISO()) : null;

function avisos(){
  let h = '';
  if(isIOS() && !instalado()) h += banner(`<b>Instale o app no iPhone:</b> toque em Compartilhar → <b>Adicionar à Tela de Início</b>. Aberto só no Safari, o iPhone pode apagar seus dados depois de 7 dias sem uso.`);
  if(!S.config.configurado) h += banner(`Antes de tudo: confira sua renda e seus <b>cartões</b> (dia de fechamento e de vencimento). <a data-act="tab" data-t="ajustes">Ir para Ajustes</a>`);
  const d = diasSemBackup();
  if(temDados() && (d===null || d>=15)) h += banner(`${d===null ? 'Você ainda não fez nenhum backup.' : `Seu último backup foi há ${d} dias.`} Seus dados existem só neste aparelho. <a data-act="export">Fazer backup agora</a>`);
  return h;
}

/* ---------- Início ---------- */
// valor com os centavos em destaque menor (como num extrato)
export const valorHTML = v => { const s = fmt(v), i = s.lastIndexOf(','); return i<0 ? esc(s) : `${esc(s.slice(0,i))}<span class="cents">${esc(s.slice(i))}</span>`; };
const inicial = s => esc((String(s).trim()[0] || '?').toUpperCase());
const corCartao = k => 'cc-' + (CORES_CARTAO.includes(k.cor) ? k.cor : CORES_CARTAO[0]);
const secH = (titulo, lado='', id='') => `<div class="sec-h"><h2${id?` id="${id}"`:''}>${titulo}</h2><span class="sm">${lado}</span></div>`;
const ICON = {
  gasto:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  entrada:'<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  csv:'<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  backup:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>'
};

// sobra do mês: número grande + barra mostrando para onde vai o que entra
function vHero(c){
  const receita = c.renda + c.entradas;
  const partes = [
    ['Cartões', c.fatura, 'var(--lav)'],
    ['Fixos', c.fixosFora, 'var(--blue)'],
    ['Pix e débito', c.avulsos, 'var(--amb)'],
    ['Metas', Math.max(0, c.guardado), '#5fd4b4'],
    ['Sobra', Math.max(0, c.sobra), 'var(--accent)']
  ];
  const base = Math.max(1, sum(partes, p=>p[1]));
  const sub = receita ? `de ${fmt(receita)} que entram no mês` : 'Lance suas entradas no + ou defina sua renda em Ajustes';
  return `<div class="card hero">
    <div class="lbl">${c.sobra>=0 ? 'Sobra prevista' : 'Vai faltar'}</div>
    <div class="big ${c.sobra>=0?'':'neg'}">${valorHTML(c.sobra)}</div>
    <div class="sub">${sub}</div>
    <div class="stack" aria-hidden="true">${partes.filter(p=>p[1]>0).map(p=>`<i style="flex:${p[1]/base};background:${p[2]}"></i>`).join('')}</div>
    <div class="legend">
      ${partes.slice(0,4).filter(p=>p[1]>0 || p[0]!=='Metas').map(p=>`<div><span><i class="dot" style="background:${p[2]}"></i>${p[0]}</span><b>${fmt(p[1])}</b></div>`).join('')}
      ${c.guardado<0 ? `<div><span>Retirado de metas</span><b class="pos">+ ${fmt(-c.guardado)}</b></div>` : ''}
    </div>
  </div>
  <div class="acts">
    <button data-act="novo" data-v="gasto">${ICON.gasto}Gasto</button>
    <button data-act="novo" data-v="entrada">${ICON.entrada}Entrada</button>
    <button data-act="pickCsv">${ICON.csv}Fatura CSV</button>
    <button data-act="export">${ICON.backup}Backup</button>
  </div>`;
}

// os cartões como cartões físicos: quanto pagar, quando vence e o melhor dia de compra
function vCarteira(){
  const hoje = todayISO(), ativos = cartoesAtivos();
  const cols = ativos.map(k=>{
    const i = infoCartao(k, hoje), fechada = i.prox!==i.aberta;
    const topo = fechada
      ? `<small>A pagar até ${dLabel(i.proxVence)}, ${emDias(i.diasProx)}</small><b>${valorHTML(i.valorProx)}</b>`
      : `<small>Fatura atual, vence ${dLabel(i.pagaHoje)}</small><b>${valorHTML(i.valorAberta)}</b>`;
    const rodape = fechada
      ? `<div><span>Próxima fatura</span><br><b>${fmt(i.valorAberta)}</b></div><div style="text-align:right"><span>Fecha</span><br><b>${dLabel(i.fechaEm)}</b></div>`
      : `<div><span>Fecha</span><br><b>${dLabel(i.fechaEm)}</b></div><div style="text-align:right"><span>Faltam</span><br><b>${i.diasFecha} dia${i.diasFecha===1?'':'s'}</b></div>`;
    const dica = i.hojeEhMelhor
      ? `<b class="hoje">Hoje é o melhor dia de compra.</b> O que comprar hoje só vence em ${dLabel(i.pagaHoje)}: ${i.diasHoje} dias para pagar.`
      : `Comprando hoje, você paga em ${dLabel(i.pagaHoje)} (${i.diasHoje} dias). <b>Melhor dia de compra: ${dLabel(i.melhorDia)}</b>, que só vence em ${dLabel(i.pagaMelhor)} (${i.diasMelhor} dias).`;
    return `<div class="cc-col">
      <div class="ccard ${corCartao(k)}">
        <div class="top"><span class="nome">${esc(k.nome)}</span><span class="dias">fecha dia ${k.fechamento}<br>vence dia ${k.vencimento}</span></div>
        <div class="val">${topo}</div>
        <div class="bottom">${rodape}</div>
      </div>
      <p class="cc-dica">${dica}</p>
    </div>`;
  });
  return secH(ativos.length>1 ? 'Seus cartões' : 'Seu cartão', ativos.length>1 ? 'deslize para ver os outros' : '')
    + `<div class="carteira ${ativos.length>1?'':'um'}">${cols.join('')}</div>`;
}

// faturas que vencem no mês escolhido, por cartão
function vFaturasMes(c){
  const faturas = c.porCartao.filter(x=>!x.cartao.arquivado || x.total);
  const linhas = faturas.map(x=>{
    const p = faturaPeriodo(ui.mes, x.cartao);
    return `<div class="row"><div class="lanc"><span class="ico ${corCartao(x.cartao)}">${inicial(x.cartao.nome)}</span><div class="t"><div>${esc(x.cartao.nome)}</div><small>vence ${dLabel(vencimentoData(ui.mes, x.cartao))}, compras de ${dLabel(p.ini)} a ${dLabel(p.fim)}</small></div></div><b>${fmt(x.total)}</b></div>`;
  }).join('');
  const receita = c.renda + c.entradas, pct = receita ? Math.round(c.fatura/receita*100) : 0;
  return secH(faturas.length>1 ? 'Faturas do mês' : 'Fatura do mês', fmt(c.fatura))
    + `<div class="card">${linhas}
      <p class="note">${c.faturaFixos ? `Inclui ${fmt(c.faturaFixos)} de parcelas e fixos no cartão. ` : ''}${receita ? `${pct}% do que entra no mês vai para o cartão.` : ''}</p></div>`;
}

function vHistorico(){
  const meses = [...Array(6)].map((_,i)=>addM(ui.mes, i-5));
  const vals = meses.map(k=>calc(k).saidas), mx = Math.max(1,...vals);
  const comDados = vals.filter(v=>v>0), media = comDados.length ? sum(comDados,x=>x)/comDados.length : 0;
  const curto = v => v>=10000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil' : Math.round(v).toLocaleString('pt-BR');
  return secH('Últimos 6 meses', media ? `média de ${fmt(media)}` : '')
    + `<div class="card"><div class="pills">${meses.map((k,i)=>`<div class="${k===ui.mes?'atual':''}"><span class="v">${curto(vals[i])}</span><i style="height:${Math.max(6, vals[i]/mx*100)}%"></i><span class="m">${mLabel(k,true)}</span></div>`).join('')}</div>
      <p class="note">Tudo o que saiu: faturas, fixos fora do cartão e pix, débito e dinheiro.</p></div>`;
}

function vCategorias(c){
  const ant = addM(ui.mes,-1), prev = calc(ant).porCat, antLbl = mLabel(ant,true);
  const cats = Object.entries(c.porCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const maxV = Math.max(1, ...cats.map(x=>x[1]), ...Object.values(S.limites).map(Number));
  let h = secH('Para onde foi', mLabel(ui.mes)) + `<div class="card">`;
  if(!cats.length) h += `<div class="empty">Nenhum gasto neste mês ainda.</div>`;
  cats.forEach(([id,v])=>{
    const ct = catOf(id), lim = Number(S.limites[id])||0, p0 = prev[id]||0;
    let cor = ct.c, extra = '', delta = '';
    if(lim){ const p=v/lim; cor = p>1?'var(--neg)':p>.8?'var(--amb)':ct.c; extra = `<div class="sm mut" style="text-align:right">de ${fmt(lim)}${p>1?' <span class="neg">estourou</span>':p>.8?' <span class="amb">perto do limite</span>':''}</div>`; }
    if(p0>0){ const pct = Math.round((v-p0)/p0*100); if(pct) delta = `<span class="delta ${pct>0?'neg':'pos'}">${pct>0?'▲':'▼'} ${Math.abs(pct)}% vs ${antLbl}</span>`; }
    const w = lim ? Math.min(100, v/lim*100) : v/maxV*100;
    h += `<div class="cat"><div class="top"><span>${dot(ct.c)}${esc(ct.n)}${delta}</span><span><b>${fmt(v)}</b>${extra}</span></div><div class="bar"><i style="width:${w}%;background:${cor}"></i></div></div>`;
  });
  return h + `</div>`;
}

function vInicio(){
  const c = calc(ui.mes);
  let h = avisos() + vHero(c);
  if(ui.mes===thisMonth()) h += vCarteira();
  h += vFaturasMes(c) + vHistorico() + vCategorias(c);
  const meiosF = MEIOS.filter(m=>m.id!=='boleto');
  h += secH('', '', 'listaTit') + `<div class="card">
    <input data-filtro="q" type="search" placeholder="Buscar em todos os meses" value="${esc(ui.busca.q)}" autocomplete="off" aria-label="Buscar lançamentos">
    <div class="two-in" style="margin-top:8px">
      <select data-filtro="cat" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${S.cats.map(c=>`<option value="${esc(c.id)}" ${ui.busca.cat===c.id?'selected':''}>${esc(c.n)}</option>`).join('')}</select>
      <select data-filtro="meio" aria-label="Filtrar por meio de pagamento"><option value="">Todos os meios</option>${meiosF.map(m=>`<option value="${m.id}" ${ui.busca.meio===m.id?'selected':''}>${m.n}</option>`).join('')}<option value="entrada" ${ui.busca.meio==='entrada'?'selected':''}>Só entradas</option></select>
    </div>
    <div id="lista" style="margin-top:6px"></div></div>`;
  return h;
}

const MAX_LISTA = 300;
// atualiza só a lista (para a busca não perder o foco do campo enquanto digita)
export function renderLista(){
  const el = $('#lista'); if(!el) return;
  const {q, cat, meio} = ui.busca, nq = normTxt(q.trim()), filtrando = !!(nq || cat || meio);
  let itens = [...S.gastos.map(x=>({k:'gasto', x})), ...S.entradas.map(x=>({k:'entrada', x}))];
  if(!filtrando) itens = itens.filter(i=>i.x.data.slice(0,7)===ui.mes);
  else itens = itens.filter(({k,x})=>{
    if(meio==='entrada' ? k!=='entrada' : meio && (k!=='gasto' || x.meio!==meio)) return false;
    if(cat && (k!=='gasto' || x.cat!==cat)) return false;
    if(nq){ const txt = k==='gasto' ? x.desc+' '+catOf(x.cat).n+' '+meioLabel(x) : x.desc+' entrada'; if(!normTxt(txt).includes(nq)) return false; }
    return true;
  });
  itens.sort((a,b)=>b.x.data.localeCompare(a.x.data) || b.x.criado-a.x.criado);
  $('#listaTit').textContent = filtrando ? `Resultados da busca (${itens.length})` : `Lançamentos do mês (${itens.length})`;
  let h = '';
  if(filtrando && itens.length){
    const g = sum(itens.filter(i=>i.k==='gasto'), i=>i.x.valor), e = sum(itens.filter(i=>i.k==='entrada'), i=>i.x.valor);
    h += `<p class="note" style="margin:0 0 4px">${[g?`Gastos: <b>${fmt(g)}</b>`:'', e?`Entradas: <b>${fmt(e)}</b>`:''].filter(Boolean).join(', ')}</p>`;
  }
  if(!itens.length) h += `<div class="empty">${filtrando ? 'Nada encontrado.' : 'Toque no + para lançar um gasto ou uma entrada.'}</div>`;
  itens.slice(0, MAX_LISTA).forEach(({k,x})=>{
    const data = filtrando ? dLabel(x.data)+'/'+x.data.slice(2,4) : dLabel(x.data);
    const btns = `<button class="x" data-act="editL" data-k="${k}" data-id="${esc(x.id)}" aria-label="Editar">✎&#xFE0E;</button><button class="x" data-act="delL" data-k="${k}" data-id="${esc(x.id)}" aria-label="Apagar">×</button>`;
    if(k==='gasto'){
      const ct = catOf(x.cat);
      h += `<div class="row"><div class="lanc"><span class="ico" style="background:${ct.c}">${inicial(ct.n)}</span><div class="t"><div>${esc(x.desc||ct.n)}</div><small>${data}, ${esc(meioLabel(x))}</small></div></div><span style="white-space:nowrap"><b>${fmt(x.valor)}</b>${btns}</span></div>`;
    } else {
      h += `<div class="row"><div class="lanc"><span class="ico" style="background:var(--accent);color:var(--on-accent)">+</span><div class="t"><div>${esc(x.desc||'Entrada')}</div><small>${data}, entrada</small></div></div><span style="white-space:nowrap"><b class="pos">+ ${fmt(x.valor)}</b>${btns}</span></div>`;
    }
  });
  if(itens.length > MAX_LISTA) h += `<p class="note">Mostrando ${MAX_LISTA} de ${itens.length}. Refine a busca.</p>`;
  el.innerHTML = h;
}

/* ---------- Lançar ---------- */
// categorias mais usadas nos últimos 90 dias primeiro
function catsOrdenadas(){
  const desde = addDias(todayISO(), -90), cont = {};
  S.gastos.forEach(g=>{ if(g.data >= desde) cont[g.cat] = (cont[g.cat]||0) + 1; });
  return S.cats.map((c,i)=>({c, i, n:cont[c.id]||0})).sort((a,b)=>b.n-a.n || a.i-b.i).map(x=>x.c);
}
// cartão do gasto mais recente feito no cartão (para já vir selecionado)
function ultimoCartao(){
  const g = S.gastos.filter(g=>g.meio==='cartao' && cartoesAtivos().some(k=>k.id===g.cartao)).sort((a,b)=>b.criado-a.criado)[0];
  return g?.cartao;
}
// últimos gastos diferentes entre si, para repetir com um toque
function recentes(){
  const vistos = new Set(), out = [];
  for(const g of S.gastos.slice().sort((a,b)=>b.criado-a.criado || b.data.localeCompare(a.data))){
    const k = [g.cat, g.meio, g.desc.toUpperCase(), g.valor].join('|');
    if(vistos.has(k)) continue;
    vistos.add(k); out.push(g);
    if(out.length===4) break;
  }
  return out;
}

function vLancar(){
  const d = ui.draft;
  const ed = ui.editG && (ui.editG.k==='gasto' ? S.gastos : S.entradas).find(x=>x.id===ui.editG.id);
  if(ui.editG && !ed) ui.editG = null;
  const tipo = ed ? ui.editG.k : d.tipo;
  const cats = catsOrdenadas();
  if(!S.cats.some(c=>c.id===d.cat)) d.cat = cats[0].id;
  const ativos = cartoesAtivos();
  if(!S.cartoes.some(k=>k.id===d.cartao) || (!ed && !ativos.some(k=>k.id===d.cartao))) d.cartao = ultimoCartao() || ativos[0].id;
  let h = `<div class="card">`;
  if(!ed) h += `<div class="seg"><button class="chip ${tipo==='gasto'?'on':''}" aria-pressed="${tipo==='gasto'}" data-act="dTipo" data-v="gasto">Gasto</button><button class="chip ${tipo==='entrada'?'on':''}" aria-pressed="${tipo==='entrada'}" data-act="dTipo" data-v="entrada">Entrada</button></div>`;
  if(ed) h += `<h2>${tipo==='gasto'?'Editar gasto':'Editar entrada'}</h2>`;
  h += `
    <input id="gValor" class="valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" aria-label="Valor" value="${ed ? valIn(ed.valor) : ''}">`;
  if(tipo==='gasto'){
    h += `<label>Categoria</label><div class="chips">${cats.map(c=>chip(d.cat===c.id, 'dCat', c.id, esc(c.n))).join('')}</div>
      <label>Pagou com</label><div class="chips">${MEIOS.filter(m=>m.id!=='boleto').map(m=>chip(d.meio===m.id, 'dMeio', m.id, m.n)).join('')}</div>`;
    if(d.meio==='cartao' && ativos.length>1){
      const opcoes = ativos.some(k=>k.id===d.cartao) ? ativos : [...ativos, cartaoOf(d.cartao)];   // editando gasto de cartão removido
      h += `<label>Qual cartão?</label><div class="chips">${opcoes.map(k=>chip(d.cartao===k.id, 'dCartao', k.id, esc(k.nome))).join('')}</div>`;
    }
    if(!ed && d.meio==='cartao'){
      h += `<label>Parcelado?</label><div class="chips"><button class="chip ${!d.parcelado?'on':''}" aria-pressed="${!d.parcelado}" data-act="dParc" data-v="0">À vista</button><button class="chip ${d.parcelado?'on':''}" aria-pressed="${d.parcelado}" data-act="dParc" data-v="1">Parcelado</button></div>`;
      if(d.parcelado) h += `<label for="gParc">Número de parcelas (o valor acima é o total)</label><input id="gParc" inputmode="numeric" placeholder="ex: 6">`;
    }
  }
  h += `<div class="two-in">
      <div><label for="gData">Data</label><input id="gData" type="date" value="${ed ? ed.data : todayISO()}"></div>
      <div><label for="gDesc">Descrição (opcional)</label><input id="gDesc" value="${esc(ed?.desc||'')}" placeholder="${tipo==='gasto'?'ex: pizza sexta':'ex: cliente X, freela'}"></div>
    </div>
    <button class="btn" data-act="saveG">${ed ? 'Salvar alterações' : tipo==='gasto' ? 'Salvar gasto' : 'Salvar entrada'}</button>
    ${ed ? '<button class="btn sec" data-act="cancelG">Cancelar edição</button>' : ''}
  </div>`;
  if(!ed && tipo==='gasto'){
    const rec = recentes();
    if(rec.length) h += `<div class="card" style="margin-top:12px"><h2>Repetir um gasto recente</h2><div class="chips">${rec.map(g=>`<button class="chip" data-act="repG" data-id="${esc(g.id)}">↺ ${esc(g.desc||catOf(g.cat).n)} · ${fmt(g.valor)}</button>`).join('')}</div></div>`;
  }
  return h;
}

/* ---------- Fixos ---------- */
function vFixos(){
  const hoje = thisMonth();
  const encerrado = r => r.fim && diffM(r.fim, hoje) > 0;
  const ativos = S.recorrentes.filter(r=>!encerrado(r)), enc = S.recorrentes.filter(encerrado);
  const fix = ativos.filter(r=>r.tipo==='fixo'), par = ativos.filter(r=>r.tipo==='parcela');
  const line = r => {
    const ct = catOf(r.cat);
    let sub = esc(meioLabel(r));
    // último mês efetivo: fim das parcelas ou data de encerramento, o que vier antes
    let ult = r.tipo==='parcela' ? addM(r.inicio, r.parcelas-1) : null;
    if(r.fim && (!ult || diffM(r.fim, ult) > 0)) ult = r.fim;
    if(encerrado(r)) sub += ` · ${ymBR(r.inicio)} a ${ymBR(r.fim)} · <span class="mut">encerrado</span>`;
    else if(r.tipo==='parcela'){
      const i = diffM(r.inicio, hoje);
      if(i<0) sub += ` · começa em ${mLabel(r.inicio,true)}`;
      else if(diffM(ult, hoje) > 0) sub += ` · <span class="pos">quitado</span>`;
      else sub += ` · ${i+1}/${r.parcelas} · termina ${ymBR(ult)} · faltam ${fmt(diffM(hoje, ult)*r.valor)}`;
    } else {
      if(diffM(r.inicio, hoje) < 0) sub += ` · começa em ${ymBR(r.inicio)}`;
      if(r.fim) sub += ` · último mês ${ymBR(r.fim)}`;
    }
    const x = encerrado(r) ? `<button class="x" data-act="delR" data-id="${esc(r.id)}" aria-label="Apagar de vez">×</button>`
                           : `<button class="x" data-act="endR" data-id="${esc(r.id)}" aria-label="Encerrar">×</button>`;
    return `<div class="row"><span class="l">${dot(ct.c)}${esc(r.nome)}<br><span class="mut sm">${sub}</span></span><span style="white-space:nowrap"><b>${fmt(r.valor)}</b><button class="x" data-act="editR" data-id="${esc(r.id)}" aria-label="Editar">✎&#xFE0E;</button>${x}</span></div>`;
  };
  // projeção 6 meses
  const meses = [...Array(6)].map((_,i)=>addM(hoje,i));
  const vals = meses.map(k=>sum(S.recorrentes.map(r=>recInMonth(r,k)?r.valor:0), x=>x));
  const mx = Math.max(1,...vals);
  let h = `<div class="card"><h2>Já comprometido nos próximos meses</h2>
    <div class="proj">${meses.map((k,i)=>`<div><b>${Math.round(vals[i])}</b><i style="height:${vals[i]/mx*85}%"></i>${mLabel(k,true)}</div>`).join('')}</div>
    <p class="note">Soma de fixos + parcelas. Cada parcela que termina libera espaço no mês seguinte.</p></div>`;
  h += `<div class="grid two" style="margin-top:12px">
    <div class="card"><h2>Parcelamentos</h2>${par.length?par.map(line).join(''):'<div class="empty">Nenhum.</div>'}</div>
    <div class="card"><h2>Fixos mensais</h2>${fix.length?fix.map(line).join(''):'<div class="empty">Nenhum.</div>'}</div>
  </div>`;
  if(enc.length) h += `<div class="card" style="margin-top:12px"><h2>Encerrados (${enc.length})</h2>
    <p class="note" style="margin:0 0 6px">Continuam contando nos meses em que estavam ativos. O × apaga de vez, inclusive do histórico.</p>${enc.map(line).join('')}</div>`;

  const e = S.recorrentes.find(r=>r.id===ui.editId) || null;
  h += `<div class="card" style="margin-top:12px"><h2>${e?'Editar':'Adicionar'} fixo ou parcela</h2>
    <label for="rNome">Nome</label><input id="rNome" value="${esc(e?.nome||'')}" placeholder="ex: Academia">
    <div class="two-in">
      <div><label for="rValor">Valor por mês</label><input id="rValor" inputmode="decimal" value="${e?valIn(e.valor)||'0':''}" placeholder="0,00"></div>
      <div><label for="rTipo">Tipo</label><select id="rTipo"><option value="fixo" ${e?.tipo==='fixo'?'selected':''}>Fixo (todo mês)</option><option value="parcela" ${e?.tipo==='parcela'?'selected':''}>Parcelado</option></select></div>
      <div><label for="rParc">Nº de parcelas (se parcelado)</label><input id="rParc" inputmode="numeric" value="${e?.parcelas||''}" placeholder="ex: 10"></div>
      <div><label for="rIni">1ª fatura / 1º pagamento</label><input id="rIni" type="month" value="${e?.inicio||hoje}"></div>
      <div><label for="rMeio">Pago com</label><select id="rMeio">${MEIOS.map(m=>`<option value="${m.id}" ${(e?.meio||'cartao')===m.id?'selected':''}>${m.n}</option>`).join('')}</select></div>
      ${S.cartoes.length>1 ? `<div><label for="rCartao">Cartão (se pago no cartão)</label><select id="rCartao">${S.cartoes.filter(k=>!k.arquivado || k.id===e?.cartao).map(k=>`<option value="${esc(k.id)}" ${e?.cartao===k.id?'selected':''}>${esc(k.nome)}</option>`).join('')}</select></div>` : ''}
      <div><label for="rCat">Categoria</label><select id="rCat">${S.cats.map(c=>`<option value="${esc(c.id)}" ${(e?.cat||'outros')===c.id?'selected':''}>${esc(c.n)}</option>`).join('')}</select></div>
      <div><label for="rFim">Último mês (opcional)</label><input id="rFim" type="month" value="${e?.fim||''}"></div>
      ${e && e.tipo==='fixo' ? `<div><label for="rVig">Se mudou o valor, vale a partir de</label><input id="rVig" type="month" value="${hoje}"></div>` : ''}
    </div>
    ${e && e.tipo==='fixo' ? '<p class="note">Reajuste: o valor antigo continua nos meses anteriores ao escolhido acima.</p>' : ''}
    <button class="btn" data-act="saveR">${e?'Salvar alterações':'Adicionar'}</button>
    ${e ? `<button class="btn sec" data-act="cancelR">Cancelar edição</button><button class="btn dng" data-act="delR" data-id="${esc(e.id)}">Apagar de vez (também dos meses passados)</button>` : ''}
  </div>`;
  return h;
}

/* ---------- Metas ---------- */
function vMetas(){
  const metas = S.metas.filter(m=>!m.arquivada);
  let h = `<div class="grid two">`;
  metas.forEach(m=>{
    const p = m.alvo ? Math.min(100, m.atual/m.alvo*100) : 0;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start"><h2>${esc(m.nome)}</h2><button class="x" data-act="arqM" data-id="${esc(m.id)}" aria-label="Remover meta">×</button></div>
      <div class="big">${fmt(m.atual)}</div><div class="mut sm">de ${fmt(m.alvo)} · faltam ${fmt(Math.max(0,m.alvo-m.atual))}</div>
      <div class="bar" style="height:10px;margin-top:10px"><i style="width:${p}%"></i></div>
      <div class="btns"><button class="btn sec" data-act="movM" data-id="${esc(m.id)}" data-s="1">+ Guardar</button><button class="btn sec" data-act="movM" data-id="${esc(m.id)}" data-s="-1">− Retirar</button></div>
    </div>`;
  });
  h += `</div>`;
  if(metas.length) h += `<p class="note" style="margin:8px 4px 0">O que você guarda sai da sobra do mês; o que retira volta para ela.</p>`;
  h += `<div class="card" style="margin-top:12px"><h2>Nova meta</h2>
    <div class="two-in"><div><label for="mNome">Nome</label><input id="mNome" placeholder="ex: Viagem"></div><div><label for="mAlvo">Valor alvo</label><input id="mAlvo" inputmode="decimal" placeholder="0,00"></div></div>
    <button class="btn" data-act="saveM">Criar meta</button></div>`;
  h += `<div class="card" style="margin-top:12px"><h2>Limite por categoria (por mês)</h2>
    <p class="note" style="margin:0 0 6px">Deixe vazio para não ter limite. No Início a barra fica amarela perto do limite e vermelha quando estoura.</p>
    ${S.cats.map(c=>`<div class="row"><span class="l">${dot(c.c)}${esc(c.n)}</span><input data-lim="${esc(c.id)}" inputmode="decimal" aria-label="Limite para ${esc(c.n)}" style="width:120px;padding:8px 10px;font-size:15px" value="${valIn(S.limites[c.id])}" placeholder="—"></div>`).join('')}
    <button class="btn" data-act="saveLim">Salvar limites</button></div>`;
  return h;
}

/* ---------- Ajustes ---------- */
const diasCartao = (af, av, k) => `<div class="two-in"><div><label>Dia de fechamento</label><input ${af} inputmode="numeric" value="${k?.fechamento ?? ''}" placeholder="ex: 5"></div><div><label>Dia de vencimento</label><input ${av} inputmode="numeric" value="${k?.vencimento ?? ''}" placeholder="ex: 12"></div></div>`;
function vCartoesAjustes(){
  const ativos = cartoesAtivos(), removidos = S.cartoes.filter(k=>k.arquivado);
  return `<div class="card" style="margin-top:12px"><h2>Cartões</h2>
    <p class="note" style="margin:0 0 4px">Os dias de fechamento e vencimento estão no app do banco, na tela da fatura. Eles decidem em qual fatura cada compra cai e qual é o melhor dia de compra.</p>
    ${ativos.map(k=>`<div class="cartao-ed"><div class="row catrow"><input data-kn="${esc(k.id)}" value="${esc(k.nome)}" maxlength="40" aria-label="Nome do cartão">${ativos.length>1 ? `<button class="x" data-act="delCartao" data-id="${esc(k.id)}" aria-label="Remover cartão ${esc(k.nome)}">×</button>` : ''}</div>${diasCartao(`data-kf="${esc(k.id)}"`, `data-kv="${esc(k.id)}"`, k)}<div class="cores" role="group" aria-label="Cor do cartão ${esc(k.nome)}">${CORES_CARTAO.map(c=>`<button class="cc-${c} ${k.cor===c?'on':''}" aria-pressed="${k.cor===c}" data-act="corCartao" data-id="${esc(k.id)}" data-v="${c}" aria-label="${c}"></button>`).join('')}</div></div>`).join('')}
    <button class="btn" data-act="saveCartoes">Salvar cartões</button>
    <div class="cartao-ed" style="margin-top:16px"><label for="nKn">Adicionar cartão</label><input id="nKn" maxlength="40" placeholder="ex: Nubank, Inter, Itaú…">${diasCartao('id="nKf"', 'id="nKv"', null)}</div>
    <button class="btn sec" data-act="addCartao">Adicionar cartão</button>
    ${removidos.length ? `<p class="note">Removidos (continuam nas faturas passadas): ${removidos.map(k=>esc(k.nome)).join(', ')}.</p>` : ''}
  </div>`;
}

function vAjustes(){
  const c = S.config, d = diasSemBackup();
  const ultimo = d===null ? 'Nenhum backup feito ainda.' : `Último backup: ${dLabel(c.ultimoBackup)}/${c.ultimoBackup.slice(0,4)} (${d===0?'hoje':d===1?'ontem':`há ${d} dias`}).`;
  return `<div class="card"><h2>Renda</h2>
    <label for="cRenda">Renda fixa mensal (salário, pró-labore)</label><input id="cRenda" inputmode="decimal" value="${valIn(c.renda)||'0'}">
    <p class="note">Recebe valores que mudam todo mês (MEI, freelas, extras)? Lance cada recebimento como <b>Entrada</b> no botão +. Se toda a sua renda varia, deixe 0 aqui.</p>
    <button class="btn" data-act="saveCfg">Salvar</button></div>

  ${vCartoesAjustes()}

  <div class="card" style="margin-top:12px"><h2>Categorias</h2>
    <p class="note" style="margin:0 0 6px">Mude nome e cor, apague ou crie categorias. Ao apagar, os lançamentos dela vão para "Outros".</p>
    ${S.cats.map(k=>`<div class="row catrow"><input type="color" data-catc="${esc(k.id)}" value="${k.c}" aria-label="Cor de ${esc(k.n)}"><input data-catn="${esc(k.id)}" value="${esc(k.n)}" maxlength="40" aria-label="Nome da categoria">${k.id==='outros' ? '<span class="xph"></span>' : `<button class="x" data-act="delCat" data-id="${esc(k.id)}" aria-label="Apagar categoria ${esc(k.n)}">×</button>`}</div>`).join('')}
    <div class="row catrow"><input type="color" id="nCatC" value="#0ea5e9" aria-label="Cor da nova categoria"><input id="nCat" maxlength="40" placeholder="Nova categoria" aria-label="Nome da nova categoria"><button class="x" data-act="addCat" aria-label="Adicionar categoria">+</button></div>
    <button class="btn" data-act="saveCats">Salvar categorias</button></div>

  <div class="card" style="margin-top:12px"><h2>Importar extrato do cartão (CSV)</h2>
    <p class="note" style="margin-top:0">Baixe a fatura em CSV pelo internet banking e importe aqui. O app tenta achar data, descrição e valor sozinho, categoriza pelo nome do estabelecimento (iFood, posto, mercado…) e ignora linhas repetidas, estornos e o pagamento da fatura.</p>
    <button class="btn sec" data-act="pickCsv">Escolher arquivo CSV</button></div>

  <div class="card" style="margin-top:12px"><h2>Seus dados</h2>
    <p class="note" style="margin-top:0">Tudo fica salvo só neste aparelho. Nada é enviado para lugar nenhum. Por isso, <b>exporte um backup de vez em quando</b> — e use o mesmo arquivo para passar os dados do PC para o celular (ou vice-versa).</p>
    <p class="note"><b>${ultimo}</b></p>
    <div class="btns"><button class="btn" data-act="export">Exportar backup</button><button class="btn sec" data-act="pickJson">Importar backup</button></div>
    <p class="note">${S.gastos.length} gastos · ${S.entradas.length} entradas · ${S.recorrentes.length} fixos/parcelas · ${S.metas.filter(m=>!m.arquivada).length} metas</p>
    <button class="btn dng" data-act="reset">Apagar tudo e começar do zero</button></div>`;
}
