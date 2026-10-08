import { CATS, MEIOS, RULES, CORES_CARTAO, TIPOS_INV, tipoInv, meioOf } from './config.js';
import { S, catOf, catsAtivas, cartaoOf, cartoesAtivos } from './store.js';
import { sessao, status as syncStatus, pendente } from './nuvem.js';
import { calc, recInMonth, faturaMonth, faturaPeriodo, vencimentoData, infoCartao, rendimentoNoMes, contasAtivas, contaPadrao, saldoConta, movimentosConta, previsaoFimDoMes } from './finance.js';
import { $, esc, fmt, todayISO, thisMonth, addM, diffM, mLabel, dLabel, sum, normTxt, diasEntre, addDias, valIn, parseNum, fmtReal, discreto, round2 } from './util.js';

// estado da interface (não é salvo)
export const ui = {tab:'inicio', mes:thisMonth(), draft:{tipo:'gasto', cat:null, meio:'cartao', parcelado:false},
  editId:null, editG:null, contaEd:null, cartaoEd:null, cartaoCor:null, invEd:null, invNovoTipo:'cdb', invNovoJa:true, busca:{q:'', cat:'', meio:''}, buscaAberta:false,
  dlg:null,   // janela aberta que acompanha as mudanças: {tipo:'fatura'|'conta'|'cat', id, m}
  abertos:new Set(), tela:null, authMsg:''};   // tela: entrar | criar | esqueci | novaSenha | aviso (antes de entrar no app)   // seções recolhíveis que a pessoa abriu (data-fold)

const ymBR = k => mLabel(k,true)+'/'+k.slice(2,4);
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const chip = (on, act, id, txt) => `<button class="chip ${on?'on':''}" aria-pressed="${on}" data-act="${act}" data-id="${esc(id)}">${txt}</button>`;
const banner = t => `<div class="banner" style="margin-bottom:12px">${t}</div>`;
// seção recolhível (fechada por padrão, para a tela ficar limpa); `abrir` força aberta
const fold = (id, titulo, lado, corpo, abrir=false) => `<details class="card fold" data-fold="${id}" ${abrir || ui.abertos.has(id) ? 'open' : ''}><summary><span>${titulo}</span>${lado ? `<span class="sm">${lado}</span>` : ''}</summary><div class="fold-c">${corpo}</div></details>`;
const emDias = n => n===0 ? 'hoje' : n===1 ? 'amanhã' : `em ${n} dias`;
// meio de pagamento para exibir: com mais de um cartão, mostra o nome do cartão
export const meioLabel = x => x.meio==='cartao' ? (S.cartoes.length>1 ? cartaoOf(x.cartao).nome : meioOf(x.meio))
  : meioOf(x.meio) + (contasAtivas().length>1 ? ' · ' + nomeConta(x.conta) : '');

let lastTab = null;
export function render(){
  document.body.classList.toggle('auth', !!ui.tela);
  if(ui.tela){ $('#view').innerHTML = vAuth(); lastTab = null; return; }
  if(ui.tab!=='ajustes'){ ui.cartaoEd = null; ui.contaEd = null; }
  if(ui.tab!=='metas') ui.invEd = null;   // sair de Ajustes descarta a edição de cartão pela metade
  document.querySelectorAll('nav button').forEach(b=>{
    const on = b.dataset.t===ui.tab;
    b.classList.toggle('on', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $('#mesBox').style.visibility = ui.tab==='inicio' ? 'visible' : 'hidden';
  $('#mesLbl').textContent = mLabel(ui.mes);
  $('#temaBtn').setAttribute('aria-label', document.documentElement.dataset.theme==='light' ? 'Ativar modo escuro' : 'Ativar modo claro');
  $('#view').innerHTML = ({inicio:vInicio, lancar:vLancar, fixos:vFixos, metas:vMetas, ajustes:vAjustes})[ui.tab]();
  if(ui.tab==='inicio'){
    renderLista();
    // deixa o mês escolhido visível na faixa (sem rolar a página)
    const f = $('#meses'), on = f?.querySelector('.on');
    if(on) f.scrollLeft = on.offsetLeft - f.clientWidth/2 + on.offsetWidth/2;
  }
  if(ui.tab==='lancar'){ const v=$('#gValor'); if(v && !v.value) setTimeout(()=>v.focus(),50); }
  const dlg = $('#dlg');
  if(dlg.open && ui.dlg) dlg.innerHTML = ui.dlg.tipo==='fatura' ? vFatura(ui.dlg.id, ui.dlg.m) : ui.dlg.tipo==='cat' ? vCategoria(ui.dlg.id, ui.dlg.m) : vExtrato(ui.dlg.id);
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
  if(!sessao() && temDados() && (d===null || d>=15)) h += banner(`${d===null ? 'Você ainda não fez nenhum backup.' : `Seu último backup foi há ${d} dias.`} Seus dados existem só neste aparelho. <a data-act="export">Fazer backup agora</a>`);
  return h;
}

/* ---------- Início ---------- */
// valor com os centavos em destaque menor (como num extrato)
export const valorHTML = v => { const s = fmt(v), i = s.lastIndexOf(','); return i<0 ? esc(s) : `${esc(s.slice(0,i))}<span class="cents">${esc(s.slice(i))}</span>`; };
const inicial = s => esc((String(s).trim()[0] || '?').toUpperCase());
const corCartao = k => 'cc-' + (CORES_CARTAO.includes(k.cor) ? k.cor : CORES_CARTAO[0]);
const secH = (titulo, lado='', id='') => `<div class="sec-h"><h2${id?` id="${id}"`:''}>${titulo}</h2><span class="sm">${lado}</span></div>`;
const OLHO = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_X = '<svg viewBox="0 0 24 24"><path d="M3.5 3.5l17 17M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const BUSCA = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

// sobra do mês: número grande + barra mostrando para onde vai o que entra; o resto abre em "Detalhes"
function vHero(c){
  const receita = c.renda + c.entradas;
  const partes = [
    ['Cartões', c.fatura, 'var(--lav)'],
    ['Fixos', c.fixosFora, 'var(--blue)'],
    ['Pix e débito', c.avulsos, 'var(--amb)'],
    ['Guardado', Math.max(0, c.guardado), '#5fd4b4'],
    ['Sobra', Math.max(0, c.sobra), 'var(--accent)']
  ];
  const base = Math.max(1, sum(partes, p=>p[1]));
  const sub = receita ? `de ${fmt(receita)} que entram no mês` : 'Lance suas entradas no + ou defina sua renda em Ajustes';
  // no mês atual: a sobra dividida pelos dias que faltam (contando hoje)
  const hoje = todayISO(), [ano, mes] = ui.mes.split('-').map(Number);
  const diasRest = new Date(ano, mes, 0).getDate() - Number(hoje.slice(8)) + 1;
  const porDia = ui.mes===thisMonth() && c.sobra>0 ? `<div class="pordia">Dá para gastar <b>${fmt(c.sobra/diasRest)}</b> por dia até o fim do mês</div>` : '';
  // faturas que vencem no mês escolhido, por cartão
  const faturas = c.porCartao.filter(x=>!x.cartao.arquivado || x.total);
  const linhas = faturas.map(x=>{
    const p = faturaPeriodo(ui.mes, x.cartao);
    return `<div class="row clicavel" role="button" tabindex="0" data-act="verFatura" data-id="${esc(x.cartao.id)}" data-m="${ui.mes}"><div class="lanc"><span class="ico ${corCartao(x.cartao)}">${inicial(x.cartao.nome)}</span><div class="t"><div>${esc(x.cartao.nome)}${(x.cartao.pagas||[]).includes(ui.mes) ? '<span class="tag pos">paga</span>' : ''}</div><small>vence ${dLabel(vencimentoData(ui.mes, x.cartao))}, compras de ${dLabel(p.ini)} a ${dLabel(p.fim)}</small></div></div><b>${fmt(x.total)}</b></div>`;
  }).join('');
  return `<details class="card hero" data-fold="hero" ${ui.abertos.has('hero')?'open':''}><summary>
    <div class="hero-top"><div class="lbl">${c.sobra>=0 ? 'Sobra prevista' : 'Vai faltar'}</div><button class="olho" data-act="olho" aria-pressed="${discreto.on}" aria-label="${discreto.on ? 'Mostrar valores' : 'Esconder valores'}">${discreto.on ? OLHO_X : OLHO}</button></div>
    <div class="big ${c.sobra>=0?'':'neg'}">${valorHTML(c.sobra)}</div>
    <div class="sub">${sub}</div>
    ${porDia}
    <div class="stack" aria-hidden="true">${partes.filter(p=>p[1]>0).map(p=>`<i style="flex:${p[1]/base};background:${p[2]}"></i>`).join('')}</div>
    <div class="mais">Detalhes</div></summary>
    <div class="det">
      <div class="legend">
        ${partes.slice(0,4).filter(p=>p[1]>0 || p[0]!=='Guardado').map(p=>`<div><span><i class="dot" style="background:${p[2]}"></i>${p[0]}</span><b>${fmt(p[1])}</b></div>`).join('')}
        ${c.guardado<0 ? `<div><span>Resgatado</span><b class="pos">+ ${fmt(-c.guardado)}</b></div>` : ''}
      </div>
      ${linhas ? `<div style="margin-top:10px">${linhas}</div>` : ''}
      ${c.faturaFixos ? `<p class="note">A fatura inclui ${fmt(c.faturaFixos)} de parcelas e fixos no cartão.</p>` : ''}
    </div>
  </details>`;
}

// os cartões como cartões físicos: quanto pagar, quando vence e o melhor dia de compra
function vCarteira(){
  const hoje = todayISO(), ativos = cartoesAtivos();
  const cols = ativos.map(k=>{
    const i = infoCartao(k, hoje), temFechada = i.prox!==i.aberta, paga = (k.pagas||[]).includes(i.prox);
    const fechada = temFechada && !paga;   // fatura fechada esperando pagamento; depois de paga, o cartão mostra a fatura atual
    const topo = fechada
      ? `<small>A pagar até ${dLabel(i.proxVence)}, ${emDias(i.diasProx)}</small><b>${valorHTML(i.valorProx)}</b>`
      : `<small>Fatura atual, vence ${dLabel(i.pagaHoje)}</small><b>${valorHTML(i.valorAberta)}</b>`;
    const rodape = fechada
      ? `<div><span>Próxima fatura</span><br><b>${fmt(i.valorAberta)}</b></div><div style="text-align:right"><span>Fecha</span><br><b>${dLabel(i.fechaEm)}</b></div>`
      : `<div><span>Fecha</span><br><b>${dLabel(i.fechaEm)}</b></div><div style="text-align:right"><span>Faltam</span><br><b>${i.diasFecha} dia${i.diasFecha===1?'':'s'}</b></div>`;
    const dica = i.hojeEhMelhor
      ? `<b class="hoje">Hoje é o melhor dia de compra</b> · ${i.diasHoje} dias para pagar`
      : `Melhor dia de compra: <b>${dLabel(i.melhorDia)}</b> · ${i.diasMelhor} dias para pagar`;
    return `<div class="cc-col">
      <div class="ccard ${corCartao(k)}" role="button" tabindex="0" data-act="verFatura" data-id="${esc(k.id)}" data-m="${fechada ? i.prox : i.aberta}" aria-label="Ver as compras da fatura do ${esc(k.nome)}">
        <div class="top"><span class="nome">${esc(k.nome)}</span><span class="dias">fecha dia ${k.fechamento}<br>vence dia ${k.vencimento}</span></div>
        <div class="val">${topo}</div>
        <div class="bottom">${rodape}</div>
      </div>
      <p class="cc-dica">${dica}</p>
      ${temFechada && i.valorProx>0 ? `<button class="cc-paga ${paga?'on':''}" data-act="pagaFat" data-id="${esc(k.id)}" data-m="${i.prox}" aria-pressed="${paga}">${paga ? `✓ Fatura de ${mLabel(i.prox,true)} paga · desfazer` : `Marcar fatura de ${mLabel(i.prox,true)} como paga`}</button>` : ''}
    </div>`;
  });
  return secH(ativos.length>1 ? 'Seus cartões' : 'Seu cartão', ativos.length>1 ? 'deslize →' : '')
    + `<div class="carteira ${ativos.length>1?'':'um'}">${cols.join('')}</div>`;
}

function vHistorico(){
  const meses = [...Array(6)].map((_,i)=>addM(ui.mes, i-5));
  const vals = meses.map(k=>calc(k).saidas), mx = Math.max(1,...vals);
  const comDados = vals.filter(v=>v>0), media = comDados.length ? sum(comDados,x=>x)/comDados.length : 0;
  const curto = v => v>=10000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil' : Math.round(v).toLocaleString('pt-BR');
  return fold('hist', 'Últimos 6 meses', media ? `média ${fmt(media)}` : '', `<div class="pills">${meses.map((k,i)=>`<div class="${k===ui.mes?'atual':''}"><span class="v">${curto(vals[i])}</span><i style="height:${Math.max(6, vals[i]/mx*100)}%"></i><span class="m">${mLabel(k,true)}</span></div>`).join('')}</div>
      <p class="note">Tudo o que saiu: faturas, fixos fora do cartão e pix, débito e dinheiro.</p>`);
}

function vCategorias(c){
  const ant = addM(ui.mes,-1), prev = calc(ant).porCat, antLbl = mLabel(ant,true);
  const cats = Object.entries(c.porCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const maxV = Math.max(1, ...cats.map(x=>x[1]), ...Object.values(S.limites).map(Number));
  let h = '';
  if(!cats.length) h += `<div class="empty">Nenhum gasto neste mês ainda.</div>`;
  cats.forEach(([id,v])=>{
    const ct = catOf(id), lim = Number(S.limites[id])||0, p0 = prev[id]||0;
    let cor = ct.c, extra = '', delta = '';
    if(lim){ const p=v/lim; cor = p>1?'var(--neg)':p>.8?'var(--amb)':ct.c; extra = `<div class="sm mut" style="text-align:right">de ${fmt(lim)}${p>1?' <span class="neg">estourou</span>':p>.8?' <span class="amb">perto do limite</span>':''}</div>`; }
    if(p0>0){ const pct = Math.round((v-p0)/p0*100); if(pct) delta = `<span class="delta ${pct>0?'neg':'pos'}">${pct>0?'▲':'▼'} ${Math.abs(pct)}% vs ${antLbl}</span>`; }
    const w = lim ? Math.min(100, v/lim*100) : v/maxV*100;
    h += `<div class="cat clicavel" role="button" tabindex="0" data-act="verCat" data-id="${esc(id)}" data-m="${ui.mes}" aria-label="Ver os gastos de ${esc(ct.n)}"><div class="top"><span>${dot(ct.c)}${esc(ct.n)}${delta}</span><span><b>${fmt(v)}</b>${extra}</span></div><div class="bar"><i style="width:${w}%;background:${cor}"></i></div></div>`;
  });
  return fold('cats', 'Para onde foi', cats.length ? fmt(sum(cats, x=>x[1])) : '', h);
}

// faixa de meses no topo do Início: a sobra de cada mês (6 para trás e 3 de previsão); tocar troca o mês da tela
function vMeses(){
  const hoje = thisMonth();
  let ini = addM(hoje, -6), fim = addM(hoje, 3);
  if(diffM(ui.mes, ini) > 0) ini = ui.mes;            // mês escolhido pelas setas, fora da faixa
  if(diffM(fim, ui.mes) > 0) fim = ui.mes;
  const curto = v => { if(discreto.on) return '•••'; const a = Math.abs(v), s = v<0 ? '−' : '';
    return s + (a>=1000 ? (a/1000).toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' mil' : Math.round(a).toLocaleString('pt-BR')); };
  const chips = [];
  for(let k=ini; diffM(k, fim)>=0; k=addM(k,1)){
    const c = calc(k), vazio = !(c.renda || c.entradas || c.saidas || c.guardado);
    const ano = k.slice(0,4)!==hoje.slice(0,4) ? '/'+k.slice(2,4) : '';
    chips.push(`<button class="mes-chip ${k===ui.mes?'on':''} ${diffM(hoje,k)>0?'fut':''}" data-act="irMes" data-m="${k}" aria-pressed="${k===ui.mes}" aria-label="${mLabel(k)}: sobra ${vazio ? 'sem dados' : fmt(c.sobra)}">
      <span>${mLabel(k,true)}${ano}</span><b class="${!vazio && c.sobra<0 ? 'neg' : ''}">${vazio ? '—' : curto(c.sobra)}</b></button>`);
  }
  return `<div class="meses" id="meses">${chips.join('')}</div>`;
}

function vInicio(){
  const c = calc(ui.mes);
  let h = vMeses() + avisos() + vHero(c);
  if(ui.mes===thisMonth()) h += vContasInicio() + vCarteira();
  h += `<div style="margin-top:22px">${vCategorias(c)}${vHistorico()}</div>`;
  // lista do mês; a busca e os filtros só aparecem pela lupa
  const meiosF = MEIOS.filter(m=>m.id!=='boleto'), {q, cat, meio} = ui.busca;
  const buscando = ui.buscaAberta || !!(q || cat || meio);
  h += `<div class="sec-h"><h2 id="listaTit"></h2><button class="ib ${buscando?'on':''}" data-act="busca" aria-label="Buscar lançamentos" aria-expanded="${buscando}">${BUSCA}</button></div>`;
  if(buscando) h += `<div class="busca">
    <input data-filtro="q" type="search" placeholder="Buscar em todos os meses" value="${esc(q)}" autocomplete="off" aria-label="Buscar lançamentos">
    <div class="two-in" style="margin-top:8px">
      <select data-filtro="cat" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${S.cats.filter(c=>!c.oculta || c.id===cat).map(c=>`<option value="${esc(c.id)}" ${cat===c.id?'selected':''}>${esc(c.n)}</option>`).join('')}</select>
      <select data-filtro="meio" aria-label="Filtrar por meio de pagamento"><option value="">Todos os meios</option>${meiosF.map(m=>`<option value="${m.id}" ${meio===m.id?'selected':''}>${m.n}</option>`).join('')}<option value="entrada" ${meio==='entrada'?'selected':''}>Só entradas</option></select>
    </div></div>`;
  h += `<div class="card" style="padding-top:6px;padding-bottom:6px"><div id="lista"></div></div>`;
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
  if(!filtrando){
    const deFora = S.gastos.filter(g=>g.meio==='cartao' && g.data.slice(0,7)!==ui.mes && faturaMonth(g.data, cartaoOf(g.cartao))===ui.mes);
    if(deFora.length){
      const meses = [...new Set(deFora.map(g=>g.data.slice(0,7)))].sort().map(k=>mLabel(k).replace(/ de \d{4}$/,'')).join(' e ');
      h += `<p class="note fora">As faturas deste mês têm <b>${fmt(sum(deFora))}</b> em compras de ${meses}. Toque no cartão para ver.</p>`;
    }
  }
  el.innerHTML = h;
}


/* ---------- contas bancárias ---------- */
const nomeConta = id => (S.contas.find(c=>c.id===id) || contaPadrao())?.nome || '';
// chips "de qual conta" (só aparecem com mais de uma conta)
function chipsConta(rotulo, sel){
  const ativas = contasAtivas(); if(ativas.length<2) return '';
  const opcoes = ativas.some(c=>c.id===sel) ? ativas : [...ativas, S.contas.find(c=>c.id===sel)].filter(Boolean);
  return `<label>${rotulo}</label><div class="chips">${opcoes.map(c=>chip(sel===c.id, 'dConta', c.id, esc(c.nome))).join('')}</div>`;
}
// select de conta para formulários (renda, fixos)
const selectConta = (id, sel) => contasAtivas().length<2 ? '' :
  `<select id="${id}">${contasAtivas().map(c=>`<option value="${esc(c.id)}" ${(sel||contaPadrao()?.id)===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select>`;

// card "Nas contas" do Início (mês atual): saldo de agora e quanto deve sobrar no fim do mês
function vContasInicio(){
  const ativas = contasAtivas();
  if(!ativas.length) return `<div class="card contas-vazio"><div><b>Saldo das contas</b><p class="note" style="margin:2px 0 0">Informe o saldo uma vez e o app vai atualizando sozinho.</p></div><button class="btn sec" data-act="novaConta">Adicionar</button></div>`;
  const total = sum(ativas, c=>saldoConta(c)), fim = previsaoFimDoMes();
  return `<div class="card contas">
    <div class="contas-top"><div><div class="lbl">Nas contas agora</div><div class="saldo ${total<0?'neg':''}">${valorHTML(total)}</div></div>
      <div class="fim"><span>Fim do mês ≈</span><b class="${fim<0?'neg':''}">${fmt(fim)}</b></div></div>
    ${ativas.map(c=>{ const s = saldoConta(c);
      return `<div class="row clicavel" role="button" tabindex="0" data-act="verConta" data-id="${esc(c.id)}"><div class="lanc"><span class="ico conta-ico">${inicial(c.nome)}</span><div class="t"><div>${esc(c.nome)}</div><small>toque para ver o extrato</small></div></div><b class="${s<0?'neg':''}">${fmt(s)}</b></div>`; }).join('')}
  </div>`;
}

// extrato da conta (janela): saldo informado e cada movimento, do mais recente para o mais antigo
export function vExtrato(id){
  const c = S.contas.find(x=>x.id===id); if(!c) return '';
  const hoje = todayISO(), movs = movimentosConta(c, hoje).reverse(), futuros = movimentosConta(c, '9999-12-31').filter(m=>m.data>hoje);
  const linha = m => `<div class="row"><div class="t"><div>${esc(m.desc)}</div><small>${dLabel(m.data)}${m.tipo==='renda'?' · renda fixa':m.tipo==='fixo'?' · fixo':m.tipo==='fatura'?' · fatura paga':''}</small></div><b class="${m.valor<0?'':'pos'}">${m.valor<0?'−':'+'} ${fmt(Math.abs(m.valor))}</b></div>`;
  return `<h2>${esc(c.nome)}</h2>
    <div class="saldo ${saldoConta(c)<0?'neg':''}" style="margin:4px 0 2px">${valorHTML(saldoConta(c))}</div>
    <p class="note" style="margin-top:0">Saldo informado em ${dLabel(c.desde)}: ${fmt(c.saldo)}</p>
    <div class="fat-lista">
      ${futuros.length ? `<p class="sm mut" style="margin:10px 0 0">Ainda vai acontecer</p>${futuros.slice(0,8).map(linha).join('')}<p class="sm mut" style="margin:12px 0 0">Já aconteceu</p>` : ''}
      ${movs.length ? movs.slice(0,60).map(linha).join('') : '<div class="empty">Nenhum movimento desde o saldo informado.</div>'}
    </div>
    <button class="btn" data-act="corrigirSaldo" data-id="${esc(c.id)}">Corrigir saldo</button>
    <button class="btn sec" data-act="fecharDlg">Fechar</button>`;
}

// Ajustes: uma linha por conta; tocar abre o editor (nome e saldo de agora)
function vContaEditor(c){
  const novo = !c;
  return `<div class="kc-ed">
    <div class="kc-ed-h"><span class="mini conta-ico">${novo ? '+' : inicial(c.nome)}</span><b>${novo ? 'Nova conta' : 'Editar conta'}</b></div>
    <label for="cNome">Nome da conta</label><input id="cNome" maxlength="40" value="${esc(c?.nome||'')}" placeholder="ex: Nubank, Itaú, Dinheiro" autocomplete="off">
    <label for="cSaldo">Saldo de agora</label><input id="cSaldo" inputmode="decimal" value="${c ? valIn(round2(saldoConta(c))) : ''}" placeholder="0,00" autocomplete="off">
    <p class="note">Veja no app do banco. A partir daqui o app vai descontando sozinho.</p>
    <div class="btns"><button class="btn sec" data-act="cancelConta">Cancelar</button><button class="btn" data-act="salvarConta">${novo ? 'Adicionar' : 'Salvar'}</button></div>
    ${!novo ? `<button class="kc-del" data-act="delConta" data-id="${esc(c.id)}">Remover esta conta</button>` : ''}
  </div>`;
}
function vContasAjustes(){
  const ativas = contasAtivas();
  const linha = c => ui.contaEd===c.id ? vContaEditor(c)
    : `<button class="kc-row" data-act="edConta" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nome)}"><span class="mini conta-ico">${inicial(c.nome)}</span><span class="kc-t"><b>${esc(c.nome)}${c===ativas[0] && ativas.length>1 ? ' <span class="tag">principal</span>' : ''}</b><small>saldo ${fmt(saldoConta(c))}</small></span><span class="kc-ir">Editar</span></button>`;
  return fold('contas', 'Contas', ativas.length ? fmt(sum(ativas, c=>saldoConta(c))) : 'nenhuma', `
    <p class="note" style="margin:0 0 8px">Informe o saldo e o app desconta sozinho: pix, débito e dinheiro, entradas, a renda fixa, os fixos fora do cartão e as faturas marcadas como pagas.</p>
    ${ativas.map(linha).join('')}
    ${ui.contaEd==='novo' ? vContaEditor(null) : ui.contaEd ? '' : `<button class="btn sec" data-act="edConta" data-id="novo" style="margin-top:12px">+ Nova conta</button>`}`, ui.contaEd==='novo');
}

// compras e fixos que caem na fatura do cartão `id` que vence no mês `m` (janela aberta ao tocar no cartão)
export function vFatura(id, m){
  const k = S.cartoes.find(x=>x.id===id); if(!k) return '';
  const p = faturaPeriodo(m, k), mesmo = c => cartaoOf(c)===k;
  const compras = S.gastos.filter(g=>g.meio==='cartao' && mesmo(g.cartao) && faturaMonth(g.data, k)===m).sort((a,b)=>b.data.localeCompare(a.data) || b.criado-a.criado);
  const fixos = S.recorrentes.filter(r=>r.meio==='cartao' && mesmo(r.cartao) && recInMonth(r, m));
  const total = sum(compras) + sum(fixos, r=>r.valor), paga = (k.pagas||[]).includes(m);
  let h = `<h2>${esc(k.nome)} · vence ${dLabel(vencimentoData(m, k))}${paga ? ' <span class="tag pos">paga</span>' : ''}</h2>
    <p class="note" style="margin-top:2px">Compras de ${dLabel(p.ini)} a ${dLabel(p.fim)}</p><div class="fat-lista">`;
  if(!compras.length && !fixos.length) h += `<div class="empty">Nenhuma compra nesta fatura.</div>`;
  compras.forEach(g=>{ const ct = catOf(g.cat);
    h += `<div class="row"><div class="lanc"><span class="ico" style="background:${ct.c}">${inicial(ct.n)}</span><div class="t"><div>${esc(g.desc||ct.n)}</div><small>${dLabel(g.data)}/${g.data.slice(2,4)}, ${esc(ct.n)}</small></div></div><span style="white-space:nowrap"><b>${fmt(g.valor)}</b><button class="x" data-act="editL" data-k="gasto" data-id="${esc(g.id)}" aria-label="Editar">✎&#xFE0E;</button><button class="x" data-act="delL" data-k="gasto" data-id="${esc(g.id)}" aria-label="Apagar">×</button></span></div>`; });
  fixos.forEach(r=>{ const ct = catOf(r.cat), info = recInMonth(r, m);
    h += `<div class="row"><div class="lanc"><span class="ico" style="background:${ct.c}">${inicial(ct.n)}</span><div class="t"><div>${esc(r.nome)}</div><small>${r.tipo==='parcela' ? `parcela ${info.n}/${r.parcelas}` : 'fixo mensal'} · muda em Fixos</small></div></div><span style="white-space:nowrap"><b>${fmt(r.valor)}</b><button class="x" data-act="irFixo" data-id="${esc(r.id)}" aria-label="Editar, encerrar ou apagar em Fixos">✎&#xFE0E;</button></span></div>`; });
  return h + `</div><div class="row fat-total"><b>Total</b><b>${fmt(total)}</b></div>
    <button class="btn sec" data-act="fecharDlg">Fechar</button>`;
}

// gastos e fixos da categoria `id` no mês `m`, do maior para o menor (janela aberta ao tocar na categoria em "Para onde foi")
export function vCategoria(id, m){
  const ct = catOf(id);
  const itens = [
    ...S.gastos.filter(g=>g.cat===id && g.data.slice(0,7)===m).map(g=>({g, valor:g.valor})),
    ...S.recorrentes.filter(r=>r.cat===id).map(r=>({r, info:recInMonth(r, m), valor:r.valor})).filter(x=>x.info)
  ].sort((a,b)=>b.valor-a.valor);
  let h = `<h2>${esc(ct.n)} · ${mLabel(m)}</h2>
    <p class="note" style="margin-top:2px">Do maior para o menor</p><div class="fat-lista">`;
  if(!itens.length) h += `<div class="empty">Nenhum gasto nesta categoria no mês.</div>`;
  itens.forEach(({g, r, info})=>{
    if(g) h += `<div class="row"><div class="lanc"><span class="ico" style="background:${ct.c}">${inicial(ct.n)}</span><div class="t"><div>${esc(g.desc||ct.n)}</div><small>${dLabel(g.data)}/${g.data.slice(2,4)}, ${esc(meioLabel(g))}</small></div></div><span style="white-space:nowrap"><b>${fmt(g.valor)}</b><button class="x" data-act="editL" data-k="gasto" data-id="${esc(g.id)}" aria-label="Editar">✎&#xFE0E;</button><button class="x" data-act="delL" data-k="gasto" data-id="${esc(g.id)}" aria-label="Apagar">×</button></span></div>`;
    else h += `<div class="row"><div class="lanc"><span class="ico" style="background:${ct.c}">${inicial(ct.n)}</span><div class="t"><div>${esc(r.nome)}</div><small>${r.tipo==='parcela' ? `parcela ${info.n}/${r.parcelas}` : 'fixo mensal'} · muda em Fixos</small></div></div><span style="white-space:nowrap"><b>${fmt(r.valor)}</b><button class="x" data-act="irFixo" data-id="${esc(r.id)}" aria-label="Editar, encerrar ou apagar em Fixos">✎&#xFE0E;</button></span></div>`;
  });
  return h + `</div><div class="row fat-total"><b>Total</b><b>${fmt(sum(itens, x=>x.valor))}</b></div>
    <button class="btn sec" data-act="fecharDlg">Fechar</button>`;
}

/* ---------- Lançar ---------- */
// categorias mais usadas nos últimos 90 dias primeiro
function catsOrdenadas(){
  const desde = addDias(todayISO(), -90), cont = {};
  S.gastos.forEach(g=>{ if(g.data >= desde) cont[g.cat] = (cont[g.cat]||0) + 1; });
  return S.cats.filter(c=>!c.oculta || c.id===ui.draft.cat).map((c,i)=>({c, i, n:cont[c.id]||0})).sort((a,b)=>b.n-a.n || a.i-b.i).map(x=>x.c);
}
// conta do último lançamento parecido (mesmo meio de pagamento, ou a última entrada), para já vir selecionada
function ultimaConta(tipo, meio){
  const ok = x => x.conta && contasAtivas().some(c=>c.id===x.conta);
  const lista = tipo==='entrada' ? S.entradas.filter(ok) : S.gastos.filter(g=>g.meio===meio && ok(g));
  return lista.sort((a,b)=>b.criado-a.criado)[0]?.conta;
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
  if(!cats.some(c=>c.id===d.cat)) d.cat = cats[0].id;
  const ativos = cartoesAtivos();
  if(!S.cartoes.some(k=>k.id===d.cartao) || (!ed && !ativos.some(k=>k.id===d.cartao))) d.cartao = ultimoCartao() || ativos[0].id;
  if(!(S.contas||[]).some(c=>c.id===d.conta) || (!ed && !contasAtivas().some(c=>c.id===d.conta))) d.conta = ultimaConta(tipo, d.meio) || contaPadrao()?.id;
  let h = `<div class="card">`;
  if(!ed) h += `<div class="seg"><button class="chip ${tipo==='gasto'?'on':''}" aria-pressed="${tipo==='gasto'}" data-act="dTipo" data-v="gasto">Gasto</button><button class="chip ${tipo==='entrada'?'on':''}" aria-pressed="${tipo==='entrada'}" data-act="dTipo" data-v="entrada">Entrada</button></div>`;
  if(ed) h += `<h2>${tipo==='gasto'?'Editar gasto':'Editar entrada'}</h2>`;
  const parc = !ed && tipo==='gasto' && d.meio==='cartao' && d.parcelado;
  h += `${parc ? '<div class="valor-lbl">Valor de cada parcela</div>' : ''}
    <input id="gValor" class="valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" aria-label="${parc ? 'Valor de cada parcela' : 'Valor'}" value="${ed ? valIn(ed.valor) : ''}">
    <label for="gDesc">${tipo==='gasto' ? 'O que comprou?' : 'De onde veio?'}</label>
    <input id="gDesc" maxlength="80" value="${esc(ed?.desc||'')}" placeholder="${tipo==='gasto' ? 'ex: tênis, pizza, presente da mãe' : 'ex: salário, cliente X, freela'}" autocomplete="off">`;
  if(tipo==='gasto'){
    h += `<label>Categoria</label><div class="chips">${cats.map(c=>chip(d.cat===c.id, 'dCat', c.id, esc(c.n))).join('')}</div>
      <label>Pagou com</label><div class="chips">${MEIOS.filter(m=>m.id!=='boleto').map(m=>chip(d.meio===m.id, 'dMeio', m.id, m.n)).join('')}</div>`;
    if(d.meio==='cartao' && ativos.length>1){
      const opcoes = ativos.some(k=>k.id===d.cartao) ? ativos : [...ativos, cartaoOf(d.cartao)];   // editando gasto de cartão removido
      h += `<label>Qual cartão?</label><div class="chips">${opcoes.map(k=>chip(d.cartao===k.id, 'dCartao', k.id, esc(k.nome))).join('')}</div>`;
    }
    if(d.meio!=='cartao') h += chipsConta('Saiu de qual conta?', d.conta);
    if(!ed && d.meio==='cartao'){
      h += `<label>Parcelado?</label><div class="chips"><button class="chip ${!d.parcelado?'on':''}" aria-pressed="${!d.parcelado}" data-act="dParc" data-v="0">À vista</button><button class="chip ${d.parcelado?'on':''}" aria-pressed="${d.parcelado}" data-act="dParc" data-v="1">Parcelado</button></div>`;
      if(d.parcelado) h += `<label for="gParc">Em quantas vezes?</label><input id="gParc" inputmode="numeric" placeholder="ex: 6"><p class="note" id="gTotal">Digite o valor de cada parcela e quantas vezes.</p>`;
    }
  }
  if(tipo==='entrada') h += chipsConta('Entrou em qual conta?', d.conta);
  h += `<label for="gData">${parc ? 'Data da compra' : 'Data'}</label><input id="gData" type="date" value="${ed ? ed.data : todayISO()}">
    <button class="btn" data-act="saveG">${ed ? 'Salvar alterações' : tipo==='gasto' ? 'Salvar gasto' : 'Salvar entrada'}</button>
    ${ed ? '<button class="btn sec" data-act="cancelG">Cancelar edição</button>' : ''}
  </div>`;
  if(!ed && tipo==='gasto'){
    const rec = recentes();
    if(rec.length) h += `<div class="card" style="margin-top:12px"><h2>Repetir um gasto recente</h2><div class="chips">${rec.map(g=>`<button class="chip" data-act="repG" data-id="${esc(g.id)}">↺ ${esc(g.desc||catOf(g.cat).n)} · ${fmt(g.valor)}</button>`).join('')}</div></div>`;
  }
  return h;
}

// total do parcelado, atualizado enquanto digita
export function totalParcelado(){
  const el = $('#gTotal'); if(!el) return;
  const v = parseNum($('#gValor').value), n = parseInt($('#gParc').value, 10);
  el.innerHTML = v>0 && n>=2 ? `${n}x de ${esc(fmtReal(v))} = <b>${esc(fmtReal(v*n))}</b> no total` : 'Digite o valor de cada parcela e quantas vezes.';
}

// categoria automática pelo nome: a do último gasto com o mesmo nome; sem histórico, as regras da importação (iFood, posto…).
// Se a pessoa já escolheu a categoria na mão, não mexe.
export function catPeloNome(){
  const d = ui.draft, inp = $('#gDesc');
  if(!inp || ui.editG || d.tipo!=='gasto' || d.catManual) return;
  const txt = inp.value.trim(), q = normTxt(txt); if(q.length<2) return;
  const visivel = id => S.cats.some(c=>c.id===id && !c.oculta);
  const g = S.gastos.filter(g=>normTxt(g.desc.trim())===q && visivel(g.cat)).sort((a,b)=>b.criado-a.criado || b.data.localeCompare(a.data))[0];
  const cat = g?.cat || RULES.find(([re,c])=>re.test(txt) && visivel(c))?.[1];
  if(!cat || cat===d.cat) return;
  d.cat = cat;
  document.querySelectorAll('[data-act="dCat"]').forEach(b=>{ const on = b.dataset.id===cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}

/* ---------- Fixos ---------- */
function vFixos(){
  const hoje = thisMonth();
  const encerrado = r => r.fim && diffM(r.fim, hoje) > 0;
  const ativos = S.recorrentes.filter(r=>!encerrado(r)), enc = S.recorrentes.filter(encerrado);
  const fix = ativos.filter(r=>r.tipo==='fixo'), par = ativos.filter(r=>r.tipo==='parcela');
  const line = r => {
    const ct = catOf(r.cat);
    let sub = esc(meioLabel(r)) + (r.meio!=='cartao' ? ` · dia ${r.dia||10}` : '');
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
  if(enc.length) h += fold('enc', `Encerrados (${enc.length})`, '',
    `<p class="note" style="margin:0 0 6px">Continuam contando nos meses em que estavam ativos. O × apaga de vez, inclusive do histórico.</p>${enc.map(line).join('')}`);

  const e = S.recorrentes.find(r=>r.id===ui.editId) || null;
  h += fold('addR', `${e?'Editar':'Adicionar'} fixo ou parcela`, '', `
    <label for="rNome" style="margin-top:0">Nome</label><input id="rNome" value="${esc(e?.nome||'')}" placeholder="ex: Academia">
    <div class="two-in">
      <div><label for="rValor">Valor por mês</label><input id="rValor" inputmode="decimal" value="${e?valIn(e.valor)||'0':''}" placeholder="0,00"></div>
      <div><label for="rTipo">Tipo</label><select id="rTipo"><option value="fixo" ${e?.tipo==='fixo'?'selected':''}>Fixo (todo mês)</option><option value="parcela" ${e?.tipo==='parcela'?'selected':''}>Parcelado</option></select></div>
      <div><label for="rParc">Nº de parcelas (se parcelado)</label><input id="rParc" inputmode="numeric" value="${e?.parcelas||''}" placeholder="ex: 10"></div>
      <div><label for="rIni">1ª fatura / 1º pagamento</label><input id="rIni" type="month" value="${e?.inicio||hoje}"></div>
      <div><label for="rMeio">Pago com</label><select id="rMeio">${MEIOS.map(m=>`<option value="${m.id}" ${(e?.meio||'cartao')===m.id?'selected':''}>${m.n}</option>`).join('')}</select></div>
      ${S.cartoes.length>1 ? `<div><label for="rCartao">Cartão (se pago no cartão)</label><select id="rCartao">${S.cartoes.filter(k=>!k.arquivado || k.id===e?.cartao).map(k=>`<option value="${esc(k.id)}" ${e?.cartao===k.id?'selected':''}>${esc(k.nome)}</option>`).join('')}</select></div>` : ''}
      <div><label for="rDia">Dia do pagamento (fora do cartão)</label><input id="rDia" inputmode="numeric" value="${e?.dia||''}" placeholder="ex: 10"></div>
      ${contasAtivas().length>1 ? `<div><label for="rConta">Sai de qual conta</label>${selectConta('rConta', e?.conta)}</div>` : ''}
      <div><label for="rCat">Categoria</label><select id="rCat">${S.cats.filter(c=>!c.oculta || c.id===e?.cat).map(c=>`<option value="${esc(c.id)}" ${(e?.cat||'outros')===c.id?'selected':''}>${esc(c.n)}</option>`).join('')}</select></div>
      <div><label for="rFim">Último mês (opcional)</label><input id="rFim" type="month" value="${e?.fim||''}"></div>
      ${e && e.tipo==='fixo' ? `<div><label for="rVig">Se mudou o valor, vale a partir de</label><input id="rVig" type="month" value="${hoje}"></div>` : ''}
    </div>
    ${e && e.tipo==='fixo' ? '<p class="note">Reajuste: o valor antigo continua nos meses anteriores ao escolhido acima.</p>' : ''}
    <button class="btn" data-act="saveR">${e?'Salvar alterações':'Adicionar'}</button>
    ${e ? `<button class="btn sec" data-act="cancelR">Cancelar edição</button><button class="btn dng" data-act="delR" data-id="${esc(e.id)}">Apagar de vez (também dos meses passados)</button>` : ''}`, !!e);
  return h;
}

/* ---------- Guardado: investimentos e metas ---------- */
const INV_ICON = {
  ap:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  rs:'<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  at:'<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>'
};
function vInvestimentos(){
  const invs = S.investimentos.filter(i=>!i.arquivado);
  const total = sum(invs, i=>i.saldo), rend = rendimentoNoMes(thisMonth());
  let h = '';
  if(invs.length){
    const porTipo = TIPOS_INV.map(t=>({t, v:sum(invs.filter(i=>i.tipo===t.id), i=>i.saldo)})).filter(x=>x.v>0);
    const fixa = sum(porTipo.filter(x=>x.t.fixa), x=>x.v), base = Math.max(1, total);
    h += `<div class="card hero inv-hero">
      <div class="lbl">Total investido</div>
      <div class="big">${valorHTML(total)}</div>
      <div class="sub">${rend ? `<span class="${rend>0?'pos':'neg'}">${rend>0?'+':'−'} ${fmt(Math.abs(rend))}</span> de rendimento este mês` : 'Atualize os saldos para acompanhar o rendimento'}</div>
      <div class="stack" aria-hidden="true">${porTipo.map(x=>`<i style="flex:${x.v/base};background:${x.t.c}"></i>`).join('')}</div>
      <div class="legend">${porTipo.map(x=>`<div><span><i class="dot" style="background:${x.t.c}"></i>${x.t.n}</span><b>${Math.round(x.v/base*100)}%</b></div>`).join('')}</div>
      ${total ? `<p class="note">Renda fixa ${Math.round(fixa/base*100)}% · renda variável ${100-Math.round(fixa/base*100)}%</p>` : ''}
    </div>`;
    h += secH('Seus investimentos', `${invs.length}`);
    h += `<div class="card inv-lista">${invs.map(i=>{
      const t = tipoInv(i.tipo), aberto = ui.invEd===i.id;
      return `<div class="inv ${aberto?'on':''}">
        <button class="inv-row" data-act="invEd" data-id="${esc(i.id)}" aria-expanded="${aberto}"><span class="ico" style="background:${t.c};color:#15210a">${esc(t.n[0])}</span><span class="kc-t"><b>${esc(i.nome)}</b><small>${t.n}</small></span><b class="inv-v">${fmt(i.saldo)}</b></button>
        ${aberto ? `<div class="inv-acoes">
          <button data-act="invMov" data-id="${esc(i.id)}" data-s="1">${INV_ICON.ap}Aplicar</button>
          <button data-act="invMov" data-id="${esc(i.id)}" data-s="-1">${INV_ICON.rs}Resgatar</button>
          <button data-act="invSaldo" data-id="${esc(i.id)}">${INV_ICON.at}Atualizar saldo</button>
        </div>
        <button class="kc-del" data-act="invArq" data-id="${esc(i.id)}">Remover investimento</button>` : ''}
      </div>`;
    }).join('')}</div>
    <p class="note" style="margin:8px 4px 0">Aplicar sai da sobra do mês e resgatar volta para ela. Atualizar saldo registra o rendimento, sem mexer na sobra.</p>`;
  }
  const tipoSel = ui.invNovoTipo;
  h += fold('novoInv', invs.length ? 'Novo investimento' : 'Adicionar investimento', '', `
    <label for="iNome" style="margin-top:0">Nome</label><input id="iNome" maxlength="60" placeholder="ex: CDB Nubank, Tesouro Selic 2029" autocomplete="off">
    <label>Tipo</label><div class="chips">${TIPOS_INV.map(t=>`<button class="chip ${tipoSel===t.id?'on':''}" aria-pressed="${tipoSel===t.id}" data-act="invTipo" data-v="${t.id}">${t.n}</button>`).join('')}</div>
    <label for="iSaldo">Quanto tem aplicado</label><input id="iSaldo" inputmode="decimal" placeholder="0,00" autocomplete="off">
    <label>Esse dinheiro…</label><div class="chips">
      <button class="chip ${ui.invNovoJa?'on':''}" aria-pressed="${ui.invNovoJa}" data-act="invJa" data-v="1">Já estava guardado</button>
      <button class="chip ${!ui.invNovoJa?'on':''}" aria-pressed="${!ui.invNovoJa}" data-act="invJa" data-v="0">Estou aplicando agora</button></div>
    <p class="note">${ui.invNovoJa ? 'Não mexe na sobra deste mês.' : 'Sai da sobra deste mês.'}</p>
    <button class="btn" data-act="saveInv">Adicionar investimento</button>`, !invs.length);
  return h;
}

function vMetas(){
  const metas = S.metas.filter(m=>!m.arquivada);
  let h = vInvestimentos() + secH('Metas', '');
  h += metas.length ? `<div class="grid two" style="margin-bottom:2px">` : `<div>`;
  metas.forEach(m=>{
    const p = m.alvo ? Math.min(100, m.atual/m.alvo*100) : 0;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start"><h2>${esc(m.nome)}</h2><button class="x" data-act="arqM" data-id="${esc(m.id)}" aria-label="Remover meta">×</button></div>
      <div class="big">${fmt(m.atual)}</div><div class="mut sm">de ${fmt(m.alvo)} · faltam ${fmt(Math.max(0,m.alvo-m.atual))}</div>
      <div class="bar" style="height:10px;margin-top:10px"><i style="width:${p}%"></i></div>
      <div class="btns"><button class="btn sec" data-act="movM" data-id="${esc(m.id)}" data-s="1">+ Guardar</button><button class="btn sec" data-act="movM" data-id="${esc(m.id)}" data-s="-1">− Retirar</button></div>
    </div>`;
  });
  h += `</div>`;
  if(metas.length) h += `<p class="note" style="margin:8px 4px 0">O que você guarda numa meta sai da sobra do mês; o que retira volta para ela.</p>`;
  h += fold('novaM', 'Nova meta', '', `
    <div class="two-in"><div><label for="mNome">Nome</label><input id="mNome" placeholder="ex: Viagem"></div><div><label for="mAlvo">Valor alvo</label><input id="mAlvo" inputmode="decimal" placeholder="0,00"></div></div>
    <button class="btn" data-act="saveM">Criar meta</button>`, !metas.length);
  h += fold('lim', 'Limite por categoria', `${Object.keys(S.limites).length || 'nenhum'} por mês`, `
    <p class="note" style="margin:0 0 6px">Deixe vazio para não ter limite. No Início a barra fica amarela perto do limite e vermelha quando estoura.</p>
    ${catsAtivas().map(c=>`<div class="row"><span class="l">${dot(c.c)}${esc(c.n)}</span><input data-lim="${esc(c.id)}" inputmode="decimal" aria-label="Limite para ${esc(c.n)}" style="width:120px;padding:8px 10px" value="${valIn(S.limites[c.id])}" placeholder="—"></div>`).join('')}
    <button class="btn" data-act="saveLim">Salvar limites</button>`);
  return h;
}

/* ---------- Ajustes ---------- */
// cartões: uma linha por cartão; tocar abre o editor ali mesmo (um de cada vez). "Novo cartão" abre o mesmo editor vazio.
function vCartaoEditor(k){
  const novo = !k, cor = ui.cartaoCor;
  return `<div class="kc-ed">
    <div class="kc-ed-h"><span class="mini cc-${cor}" id="kMini"></span><b>${novo ? 'Novo cartão' : 'Editar cartão'}</b></div>
    <label for="kNome">Nome do cartão</label><input id="kNome" maxlength="40" value="${esc(k?.nome||'')}" placeholder="ex: Nubank, Inter, Itaú…">
    <div class="two-in">
      <div><label for="kF">Dia que fecha</label><input id="kF" inputmode="numeric" value="${k?.fechamento ?? ''}" placeholder="ex: 5"></div>
      <div><label for="kV">Dia que vence</label><input id="kV" inputmode="numeric" value="${k?.vencimento ?? ''}" placeholder="ex: 12"></div>
    </div>
    <label>Cor</label><div class="cores" role="group" aria-label="Cor do cartão">${CORES_CARTAO.map(c=>`<button class="cc-${c} ${cor===c?'on':''}" aria-pressed="${cor===c}" data-act="corCartao" data-v="${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="btns"><button class="btn sec" data-act="cancelCartao">Cancelar</button><button class="btn" data-act="salvarCartao">${novo ? 'Adicionar' : 'Salvar'}</button></div>
    ${!novo && cartoesAtivos().length>1 ? `<button class="kc-del" data-act="delCartao" data-id="${esc(k.id)}">Remover este cartão</button>` : ''}
  </div>`;
}
function vCartoesAjustes(){
  const ativos = cartoesAtivos(), removidos = S.cartoes.filter(k=>k.arquivado);
  const linha = k => ui.cartaoEd===k.id ? vCartaoEditor(k)
    : `<button class="kc-row" data-act="edCartao" data-id="${esc(k.id)}" aria-label="Editar ${esc(k.nome)}"><span class="mini ${corCartao(k)}"></span><span class="kc-t"><b>${esc(k.nome)}</b><small>fecha dia ${k.fechamento} · vence dia ${k.vencimento}</small></span><span class="kc-ir">Editar</span></button>`;
  return fold('cartoes', 'Cartões', ativos.length>1 ? `${ativos.length} cartões` : esc(ativos[0]?.nome||''), `
    <p class="note" style="margin:0 0 8px">Os dias que a fatura fecha e vence estão no app do banco. Toque num cartão para mudar.</p>
    ${ativos.map(linha).join('')}
    ${ui.cartaoEd==='novo' ? vCartaoEditor(null) : ui.cartaoEd ? '' : `<button class="btn sec" data-act="edCartao" data-id="novo" style="margin-top:12px">+ Novo cartão</button>`}
    ${removidos.length ? `<p class="note">Removidos (continuam nas faturas passadas): ${removidos.map(k=>esc(k.nome)).join(', ')}.</p>` : ''}`, !S.config.configurado);
}

// escondidas + padrão que não existem mais (apagadas em versões antigas do app)
const catsGuardadas = () => [...S.cats.filter(c=>c.oculta), ...CATS.filter(d=>!S.cats.some(c=>c.id===d.id))];

// caixa de sugestões do campo "Adicionar categoria": aparece só com o campo em foco e filtra enquanto digita
export function sugestoesCat(aberta=true){
  const box = $('#catSug'), inp = $('#nCat'); if(!box || !inp) return;
  const txt = inp.value.trim(), q = normTxt(txt);
  const itens = catsGuardadas().filter(k=>!q || normTxt(k.n).includes(q));
  let h = itens.map(k=>`<button class="sug" role="option" data-act="voltaCat" data-id="${esc(k.id)}">${dot(k.c)}${esc(k.n)}</button>`).join('');
  if(q && !S.cats.some(c=>!c.oculta && normTxt(c.n)===q) && !itens.some(k=>normTxt(k.n)===q)) h += `<button class="sug novo" role="option" data-act="addCat">+ Criar "${esc(txt)}"</button>`;
  if(!h) h = `<div class="sug vazio">${q ? 'Essa categoria já está na lista' : 'Digite o nome da nova categoria'}</div>`;
  box.innerHTML = h;
  box.hidden = !aberta;
  inp.setAttribute('aria-expanded', String(aberta));
}

/* ---------- conta ---------- */
const campo = (id, rotulo, tipo, auto, extra='') => `<label for="${id}">${rotulo}</label><input id="${id}" type="${tipo}" autocomplete="${auto}" ${extra}>`;
function vAuth(){
  const t = ui.tela, link = (v, txt) => `<button class="link" data-act="authTela" data-v="${v}">${txt}</button>`;
  const topo = (titulo, sub) => `<div class="auth-top"><h2>${titulo}</h2>${sub ? `<p class="note">${sub}</p>` : ''}</div>`;
  let h = '';
  if(t==='entrar') h = topo('Entre na sua conta', 'Seus dados ficam iguais no celular e no computador.')
    + campo('aEmail','E-mail','email','email','inputmode="email" autocapitalize="off"') + campo('aSenha','Senha','password','current-password')
    + `<p class="auth-erro neg sm" hidden></p><button class="btn" data-act="authEntrar">Entrar</button>
      <div class="auth-links">${link('esqueci','Esqueci a senha')}${link('criar','Criar conta')}</div>`;
  else if(t==='criar') h = topo('Criar conta', 'Cada pessoa tem a sua conta, e uma não vê os dados da outra.')
    + campo('aNome','Seu nome (opcional)','text','name','maxlength="40"') + campo('aEmail','E-mail','email','email','inputmode="email" autocapitalize="off"')
    + campo('aSenha','Senha (pelo menos 6 caracteres)','password','new-password') + campo('aSenha2','Repita a senha','password','new-password')
    + `<p class="auth-erro neg sm" hidden></p><button class="btn" data-act="authCriar">Criar conta</button>
      <div class="auth-links">${link('entrar','Já tenho conta')}</div>`;
  else if(t==='esqueci') h = topo('Esqueci a senha', 'Enviamos um link para o seu e-mail para criar uma senha nova. Seus dados continuam na conta.')
    + campo('aEmail','E-mail','email','email','inputmode="email" autocapitalize="off"')
    + `<p class="auth-erro neg sm" hidden></p><button class="btn" data-act="authEsqueci">Enviar link</button>
      <div class="auth-links">${link('entrar','Voltar')}</div>`;
  else if(t==='novaSenha') h = topo('Crie uma senha nova', esc(sessao()?.user.email || ''))
    + campo('aSenha','Senha nova (pelo menos 6 caracteres)','password','new-password') + campo('aSenha2','Repita a senha','password','new-password')
    + `<p class="auth-erro neg sm" hidden></p><button class="btn" data-act="authNovaSenha">Salvar senha nova</button>`;
  else h = topo('Veja seu e-mail', ui.authMsg) + `<button class="btn sec" data-act="authTela" data-v="entrar">Voltar para entrar</button>`;
  if(t==='entrar' || t==='criar') h += `<button class="link sem-conta" data-act="authSemConta">Usar sem conta, só neste aparelho</button>`;
  return `<div class="auth-box card">${h}</div>`;
}
export function statusTexto(){
  if(!sessao()) return 'Sem conta: os dados ficam só neste aparelho.';
  const f = syncStatus.fase, hora = syncStatus.quando?.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  if(f==='enviando') return 'Sincronizando…';
  if(f==='offline') return pendente() ? 'Sem internet: as alterações ficam guardadas e vão quando a conexão voltar.' : 'Sem internet no momento.';
  if(f==='erro') return syncStatus.msg || 'Não consegui sincronizar.';
  return hora ? `Sincronizado às ${hora}.` : 'Conectado.';
}
function vConta(){
  const s = sessao();
  if(!s) return fold('conta', 'Conta', 'sem conta', `
    <p class="note" style="margin-top:0">Você está usando sem conta: os dados ficam só neste aparelho. Com uma conta, eles aparecem iguais no celular e no computador.</p>
    <button class="btn" data-act="contaEntrar">Entrar ou criar conta</button>`);
  return fold('conta', 'Conta', esc(s.user.nome || s.user.email), `
    <div class="row"><span class="l">${s.user.nome ? `<b>${esc(s.user.nome)}</b><br>` : ''}<span class="mut sm">${esc(s.user.email)}</span></span></div>
    <p class="note" id="syncStatus">${statusTexto()}</p>
    <div class="btns"><button class="btn sec" data-act="syncAgora">Sincronizar agora</button><button class="btn sec" data-act="sairConta">Sair da conta</button></div>`);
}

function vAjustes(){
  const c = S.config, d = diasSemBackup();
  const ultimo = d===null ? 'Nenhum backup feito ainda.' : `Último backup: ${dLabel(c.ultimoBackup)}/${c.ultimoBackup.slice(0,4)} (${d===0?'hoje':d===1?'ontem':`há ${d} dias`}).`;
  return `${vConta()}
  ${vContasAjustes()}
  ${fold('renda', 'Renda', fmt(c.renda), `
    <label for="cRenda" style="margin-top:0">Renda fixa mensal (salário, pró-labore)</label><input id="cRenda" inputmode="decimal" value="${valIn(c.renda)||'0'}">
    <div class="two-in"><div><label for="cDia">Dia que cai na conta</label><input id="cDia" inputmode="numeric" value="${c.diaRenda||5}"></div>
      ${contasAtivas().length>1 ? `<div><label for="cConta">Em qual conta</label>${selectConta('cConta', c.contaRenda)}</div>` : ''}</div>
    <p class="note">Recebe valores que mudam todo mês (MEI, freelas, extras)? Lance cada recebimento como <b>Entrada</b> no botão +. Se toda a sua renda varia, deixe 0 aqui.</p>
    <button class="btn" data-act="saveCfg">Salvar</button>`, !S.config.configurado)}

  ${vCartoesAjustes()}

  ${fold('cats-ed', 'Categorias', String(catsAtivas().length), `
    <p class="note" style="margin:0 0 6px">O × tira a categoria das opções. Para trazer de volta, toque em "Adicionar categoria" e escolha na lista.</p>
    ${catsAtivas().map(k=>`<div class="row catrow"><input type="color" data-catc="${esc(k.id)}" value="${k.c}" aria-label="Cor de ${esc(k.n)}"><input data-catn="${esc(k.id)}" value="${esc(k.n)}" maxlength="40" aria-label="Nome da categoria">${k.id==='outros' ? '<span class="xph"></span>' : `<button class="x" data-act="escCat" data-id="${esc(k.id)}" aria-label="Tirar ${esc(k.n)}">×</button>`}</div>`).join('')}
    <div class="cat-add"><div class="row catrow"><input type="color" id="nCatC" value="#0ea5e9" aria-label="Cor da nova categoria"><input id="nCat" maxlength="40" placeholder="Adicionar categoria" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="catSug" aria-label="Adicionar categoria"><button class="x" data-act="addCat" aria-label="Adicionar categoria">+</button></div>
      <div class="sugest" id="catSug" role="listbox" hidden></div></div>
    <button class="btn" data-act="saveCats">Salvar nomes e cores</button>`)}

  ${fold('csv', 'Importar fatura (CSV)', '', `
    <p class="note" style="margin-top:0">Baixe a fatura em CSV pelo internet banking e importe aqui. O app tenta achar data, descrição e valor sozinho, categoriza pelo nome do estabelecimento (iFood, posto, mercado…) e ignora linhas repetidas, estornos e o pagamento da fatura.</p>
    <button class="btn sec" data-act="pickCsv">Escolher arquivo CSV</button>`)}

  ${fold('dados', 'Backup e dados', d===null ? 'sem backup' : d===0 ? 'backup hoje' : `backup há ${d} d`, `
    <p class="note" style="margin-top:0">${sessao() ? 'Seus dados estão na sua conta e também neste aparelho. O backup é uma cópia extra, em arquivo.' : 'Sem conta, tudo fica salvo só neste aparelho. Por isso, <b>exporte um backup de vez em quando</b>.'}</p>
    <p class="note"><b>${ultimo}</b></p>
    <div class="btns"><button class="btn" data-act="export">Exportar backup</button><button class="btn sec" data-act="pickJson">Importar backup</button></div>
    <p class="note">${S.gastos.length} gastos · ${S.entradas.length} entradas · ${S.recorrentes.length} fixos/parcelas · ${S.metas.filter(m=>!m.arquivada).length} metas</p>
    <button class="btn dng" data-act="reset">Apagar tudo e começar do zero</button>`)}`;
}
