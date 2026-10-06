import { MEIOS, meioOf } from './config.js';
import { S, catOf } from './store.js';
import { calc, recInMonth, faturaPeriodo } from './finance.js';
import { $, esc, fmt, todayISO, thisMonth, addM, diffM, mLabel, dLabel, sum, normTxt, diasEntre, addDias, valIn } from './util.js';

// estado da interface (não é salvo)
export const ui = {tab:'inicio', mes:thisMonth(), draft:{tipo:'gasto', cat:null, meio:'cartao', parcelado:false},
  editId:null, editG:null, busca:{q:'', cat:'', meio:''}};

const ymBR = k => mLabel(k,true)+'/'+k.slice(2,4);
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const chip = (on, act, id, txt) => `<button class="chip ${on?'on':''}" aria-pressed="${on}" data-act="${act}" data-id="${esc(id)}">${txt}</button>`;
const banner = t => `<div class="banner" style="margin-bottom:12px">${t}</div>`;

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
  if(!S.config.configurado) h += banner(`Antes de tudo: confira sua renda e o <b>dia de fechamento e vencimento</b> da fatura. <a data-act="tab" data-t="ajustes">Ir para Ajustes →</a>`);
  const d = diasSemBackup();
  if(temDados() && (d===null || d>=15)) h += banner(`${d===null ? 'Você ainda não fez nenhum backup.' : `Seu último backup foi há ${d} dias.`} Seus dados existem só neste aparelho. <a data-act="export">Fazer backup agora →</a>`);
  return h;
}

/* ---------- Início ---------- */
function vInicio(){
  const c = calc(ui.mes), per = faturaPeriodo(ui.mes), receita = c.renda + c.entradas;
  let h = avisos();
  h += `<div class="grid two">
    <div class="card">
      <h2>Sobra prevista no mês</h2>
      <div class="big ${c.sobra>=0?'pos':'neg'}">${fmt(c.sobra)}</div>
      <div style="margin-top:10px">
        <div class="row"><span class="l">Renda fixa</span><b>${fmt(c.renda)}</b></div>
        ${c.entradas || !c.renda ? `<div class="row"><span class="l">Entradas do mês</span><b class="pos">+ ${fmt(c.entradas)}</b></div>` : ''}
        <div class="row"><span class="l">Fatura do cartão <span class="tag">vence dia ${esc(S.config.vencimento)}</span></span><b class="neg">− ${fmt(c.fatura)}</b></div>
        <div class="row"><span class="l">Fixos fora do cartão</span><b class="neg">− ${fmt(c.fixosFora)}</b></div>
        <div class="row"><span class="l">Pix / débito / dinheiro</span><b class="neg">− ${fmt(c.avulsos)}</b></div>
        ${c.guardado ? `<div class="row"><span class="l">${c.guardado>0?'Guardado em metas':'Retirado de metas'}</span><b class="${c.guardado>0?'neg':'pos'}">${c.guardado>0?'−':'+'} ${fmt(Math.abs(c.guardado))}</b></div>` : ''}
      </div>
    </div>
    <div class="card">
      <h2>Fatura que vence neste mês</h2>
      <div class="big">${fmt(c.fatura)}</div>
      <div style="margin-top:10px">
        <div class="row"><span class="l">Parcelas e fixos no cartão</span><b>${fmt(c.faturaFixos)}</b></div>
        <div class="row"><span class="l">Compras lançadas</span><b>${fmt(c.faturaCompras)}</b></div>
        <div class="row"><span class="l mut sm">Compras de ${dLabel(per.ini)} a ${dLabel(per.fim)} caem nesta fatura</span></div>
      </div>
      ${receita ? `<div class="bar" style="margin-top:8px"><i style="width:${Math.min(100,c.fatura/receita*100)}%;background:${c.fatura/receita>.8?'var(--red)':c.fatura/receita>.6?'var(--amb)':'var(--acc)'}"></i></div><p class="note">${Math.round(c.fatura/receita*100)}% da renda vai para o cartão</p>` : ''}
    </div>
  </div>`;

  // histórico
  const meses = [...Array(6)].map((_,i)=>addM(ui.mes, i-5));
  const vals = meses.map(k=>calc(k).saidas), mx = Math.max(1,...vals);
  const comDados = vals.filter(v=>v>0), media = comDados.length ? sum(comDados,x=>x)/comDados.length : 0;
  h += `<div class="card" style="margin-top:12px"><h2>Saídas nos últimos 6 meses</h2>
    <div class="proj">${meses.map((k,i)=>`<div class="${k===ui.mes?'atual':''}"><b>${Math.round(vals[i])}</b><i style="height:${vals[i]/mx*85}%"></i>${mLabel(k,true)}</div>`).join('')}</div>
    <p class="note">Fatura + fixos fora do cartão + pix/débito/dinheiro.${media ? ` Média: ${fmt(media)} por mês.` : ''}</p></div>`;

  // categorias, com comparação com o mês anterior
  const ant = addM(ui.mes,-1), prev = calc(ant).porCat, antLbl = mLabel(ant,true);
  const cats = Object.entries(c.porCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const maxV = Math.max(1, ...cats.map(x=>x[1]), ...Object.values(S.limites).map(Number));
  h += `<div class="card" style="margin-top:12px"><h2>Para onde foi o dinheiro (${esc(mLabel(ui.mes,true))})</h2>`;
  if(!cats.length) h += `<div class="empty">Nenhum gasto neste mês ainda.</div>`;
  cats.forEach(([id,v])=>{
    const ct = catOf(id), lim = Number(S.limites[id])||0, p0 = prev[id]||0;
    let cor = ct.c, extra = '', delta = '';
    if(lim){ const p=v/lim; cor = p>1?'var(--red)':p>.8?'var(--amb)':ct.c; extra = ` <span class="mut sm">de ${fmt(lim)}</span>${p>1?' <span class="neg sm">• estourou</span>':p>.8?' <span class="amb sm">• perto do limite</span>':''}`; }
    if(p0>0){ const pct = Math.round((v-p0)/p0*100); if(pct) delta = ` <span class="${pct>0?'neg':'pos'} sm" style="white-space:nowrap">${pct>0?'▲':'▼'} ${Math.abs(pct)}% vs ${antLbl}</span>`; }
    const w = lim ? Math.min(100, v/lim*100) : v/maxV*100;
    h += `<div class="cat"><div class="top"><span>${dot(ct.c)}${esc(ct.n)}${delta}</span><span><b>${fmt(v)}</b>${extra}</span></div><div class="bar"><i style="width:${w}%;background:${cor}"></i></div></div>`;
  });
  h += `</div>`;

  // lançamentos + busca
  const meiosF = MEIOS.filter(m=>m.id!=='boleto');
  h += `<div class="card" style="margin-top:12px"><h2 id="listaTit"></h2>
    <input data-filtro="q" type="search" placeholder="Buscar em todos os meses…" value="${esc(ui.busca.q)}" autocomplete="off" aria-label="Buscar lançamentos">
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
    if(nq){ const txt = k==='gasto' ? x.desc+' '+catOf(x.cat).n+' '+meioOf(x.meio) : x.desc+' entrada'; if(!normTxt(txt).includes(nq)) return false; }
    return true;
  });
  itens.sort((a,b)=>b.x.data.localeCompare(a.x.data) || b.x.criado-a.x.criado);
  $('#listaTit').textContent = filtrando ? `Resultados da busca (${itens.length})` : `Lançamentos do mês (${itens.length})`;
  let h = '';
  if(filtrando && itens.length){
    const g = sum(itens.filter(i=>i.k==='gasto'), i=>i.x.valor), e = sum(itens.filter(i=>i.k==='entrada'), i=>i.x.valor);
    h += `<p class="note" style="margin:0 0 4px">${[g?`Gastos: <b>${fmt(g)}</b>`:'', e?`Entradas: <b>${fmt(e)}</b>`:''].filter(Boolean).join(' · ')}</p>`;
  }
  if(!itens.length) h += `<div class="empty">${filtrando ? 'Nada encontrado.' : 'Toque no <b>+</b> para lançar um gasto ou uma entrada.'}</div>`;
  itens.slice(0, MAX_LISTA).forEach(({k,x})=>{
    const data = filtrando ? dLabel(x.data)+'/'+x.data.slice(2,4) : dLabel(x.data);
    const btns = `<button class="x" data-act="editL" data-k="${k}" data-id="${esc(x.id)}" aria-label="Editar">✎</button><button class="x" data-act="delL" data-k="${k}" data-id="${esc(x.id)}" aria-label="Apagar">×</button>`;
    if(k==='gasto'){ const ct = catOf(x.cat); h += `<div class="row"><span class="l">${dot(ct.c)}${esc(x.desc||ct.n)} <span class="mut sm">· ${data} · ${esc(meioOf(x.meio))}</span></span><span style="white-space:nowrap"><b>${fmt(x.valor)}</b>${btns}</span></div>`; }
    else h += `<div class="row"><span class="l">${dot('var(--acc)')}${esc(x.desc||'Entrada')} <span class="mut sm">· ${data} · entrada</span></span><span style="white-space:nowrap"><b class="pos">+ ${fmt(x.valor)}</b>${btns}</span></div>`;
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
  let h = `<div class="card">`;
  if(!ed) h += `<div class="chips" style="margin-bottom:14px"><button class="chip ${tipo==='gasto'?'on':''}" aria-pressed="${tipo==='gasto'}" data-act="dTipo" data-v="gasto">Gasto</button><button class="chip ${tipo==='entrada'?'on':''}" aria-pressed="${tipo==='entrada'}" data-act="dTipo" data-v="entrada">Entrada</button></div>`;
  h += `<h2>${ed ? (tipo==='gasto'?'Editar gasto':'Editar entrada') : (tipo==='gasto'?'Novo gasto':'Nova entrada')}</h2>
    <input id="gValor" class="valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" aria-label="Valor" value="${ed ? valIn(ed.valor) : ''}">`;
  if(tipo==='gasto'){
    h += `<label>Categoria</label><div class="chips">${cats.map(c=>chip(d.cat===c.id, 'dCat', c.id, esc(c.n))).join('')}</div>
      <label>Pagou com</label><div class="chips">${MEIOS.filter(m=>m.id!=='boleto').map(m=>chip(d.meio===m.id, 'dMeio', m.id, m.n)).join('')}</div>`;
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
    let sub = esc(meioOf(r.meio));
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
    return `<div class="row"><span class="l">${dot(ct.c)}${esc(r.nome)}<br><span class="mut sm">${sub}</span></span><span style="white-space:nowrap"><b>${fmt(r.valor)}</b><button class="x" data-act="editR" data-id="${esc(r.id)}" aria-label="Editar">✎</button>${x}</span></div>`;
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
function vAjustes(){
  const c = S.config, d = diasSemBackup();
  const ultimo = d===null ? 'Nenhum backup feito ainda.' : `Último backup: ${dLabel(c.ultimoBackup)}/${c.ultimoBackup.slice(0,4)} (${d===0?'hoje':d===1?'ontem':`há ${d} dias`}).`;
  return `<div class="card"><h2>Renda e cartão</h2>
    <label for="cRenda">Renda fixa mensal (salário, pró-labore)</label><input id="cRenda" inputmode="decimal" value="${valIn(c.renda)||'0'}">
    <p class="note">Recebe valores que mudam todo mês (MEI, freelas, extras)? Lance cada recebimento como <b>Entrada</b> no botão +. Se toda a sua renda varia, deixe 0 aqui.</p>
    <div class="two-in">
      <div><label for="cFech">Dia de fechamento da fatura</label><input id="cFech" inputmode="numeric" value="${c.fechamento}"></div>
      <div><label for="cVenc">Dia de vencimento</label><input id="cVenc" inputmode="numeric" value="${c.vencimento}"></div>
    </div>
    <p class="note">Esses dias estão no app do banco, na tela da fatura. Eles decidem em qual fatura cada compra cai.</p>
    <button class="btn" data-act="saveCfg">Salvar</button></div>

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
