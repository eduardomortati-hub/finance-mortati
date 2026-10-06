import { CATS, MEIOS, catOf, meioOf } from './config.js';
import { S } from './store.js';
import { calc, recInMonth } from './finance.js';
import { $, esc, fmt, todayISO, thisMonth, addM, diffM, mLabel, dLabel, sum } from './util.js';

// estado da interface (não é salvo)
export const ui = {tab:'inicio', mes:thisMonth(), draft:{cat:'delivery', meio:'cartao', parcelado:false}, editId:null};

export function render(){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on', b.dataset.t===ui.tab));
  $('#mesBox').style.visibility = ui.tab==='inicio' ? 'visible' : 'hidden';
  $('#mesLbl').textContent = mLabel(ui.mes);
  $('#view').innerHTML = ({inicio:vInicio, lancar:vLancar, fixos:vFixos, metas:vMetas, ajustes:vAjustes})[ui.tab]();
  if(ui.tab==='lancar'){ const v=$('#gValor'); if(v) setTimeout(()=>v.focus(),50); }
  window.scrollTo(0,0);
}

function vInicio(){
  const c = calc(ui.mes);
  const F = S.config.fechamento, V = S.config.vencimento;
  let h = '';
  if(!S.config.configurado) h += `<div class="banner" style="margin-bottom:12px">Antes de tudo: confira sua renda e o <b>dia de fechamento e vencimento</b> da fatura. <a data-act="tab" data-t="ajustes">Ir para Ajustes →</a></div>`;
  h += `<div class="grid two">
    <div class="card">
      <h2>Sobra prevista no mês</h2>
      <div class="big ${c.sobra>=0?'pos':'neg'}">${fmt(c.sobra)}</div>
      <div style="margin-top:10px">
        <div class="row"><span class="l">Renda</span><b>${fmt(c.renda)}</b></div>
        <div class="row"><span class="l">Fatura do cartão <span class="tag">vence dia ${esc(V)}</span></span><b class="neg">− ${fmt(c.fatura)}</b></div>
        <div class="row"><span class="l">Fixos fora do cartão</span><b class="neg">− ${fmt(c.fixosFora)}</b></div>
        <div class="row"><span class="l">Pix / débito / dinheiro</span><b class="neg">− ${fmt(c.avulsos)}</b></div>
      </div>
    </div>
    <div class="card">
      <h2>Fatura que vence neste mês</h2>
      <div class="big">${fmt(c.fatura)}</div>
      <div style="margin-top:10px">
        <div class="row"><span class="l">Parcelas e fixos no cartão</span><b>${fmt(c.faturaFixos)}</b></div>
        <div class="row"><span class="l">Compras lançadas</span><b>${fmt(c.faturaCompras)}</b></div>
        <div class="row"><span class="l mut sm">Compras até o dia ${esc(F-1)} do mês anterior/atual caem aqui conforme o fechamento</span></div>
      </div>
      ${c.renda? `<div class="bar" style="margin-top:8px"><i style="width:${Math.min(100,c.fatura/c.renda*100)}%;background:${c.fatura/c.renda>.8?'var(--red)':c.fatura/c.renda>.6?'var(--amb)':'var(--acc)'}"></i></div><p class="note">${Math.round(c.fatura/c.renda*100)}% da renda vai para o cartão</p>`:''}
    </div>
  </div>`;

  // categorias
  const cats = Object.entries(c.porCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const maxV = Math.max(1, ...cats.map(x=>x[1]), ...Object.values(S.limites||{}).map(Number));
  h += `<div class="card" style="margin-top:12px"><h2>Para onde foi o dinheiro (${esc(mLabel(ui.mes,true))})</h2>`;
  if(!cats.length) h += `<div class="empty">Nenhum gasto neste mês ainda.</div>`;
  cats.forEach(([id,v])=>{
    const ct = catOf(id), lim = Number((S.limites||{})[id])||0;
    let cor = ct.c, extra = '';
    if(lim){ const p=v/lim; cor = p>1?'var(--red)':p>.8?'var(--amb)':ct.c; extra = ` <span class="mut sm">de ${fmt(lim)}</span>${p>1?' <span class="neg sm">• estourou</span>':p>.8?' <span class="amb sm">• perto do limite</span>':''}`; }
    const w = lim ? Math.min(100, v/lim*100) : v/maxV*100;
    h += `<div class="cat"><div class="top"><span><span class="dot" style="background:${ct.c}"></span>${esc(ct.n)}</span><span><b>${fmt(v)}</b>${extra}</span></div><div class="bar"><i style="width:${w}%;background:${cor}"></i></div></div>`;
  });
  h += `</div>`;

  // lançamentos
  const list = c.doMes.slice().sort((a,b)=>b.data.localeCompare(a.data)||b.criado-a.criado);
  h += `<div class="card" style="margin-top:12px"><h2>Lançamentos do mês (${list.length})</h2>`;
  if(!list.length) h += `<div class="empty">Toque no <b>+</b> para lançar um gasto.</div>`;
  list.forEach(g=>{
    const ct=catOf(g.cat);
    h += `<div class="row"><span class="l"><span class="dot" style="background:${ct.c}"></span>${esc(g.desc||ct.n)} <span class="mut sm">· ${dLabel(g.data)} · ${esc(meioOf(g.meio))}</span></span><span style="white-space:nowrap"><b>${fmt(g.valor)}</b><button class="x" data-act="delG" data-id="${g.id}" aria-label="Apagar">×</button></span></div>`;
  });
  h += `</div>`;
  return h;
}

function vLancar(){
  const chipsCat = CATS.map(c=>`<button class="chip ${ui.draft.cat===c.id?'on':''}" data-act="dCat" data-id="${c.id}">${esc(c.n)}</button>`).join('');
  const chipsMeio = MEIOS.filter(m=>m.id!=='boleto').map(m=>`<button class="chip ${ui.draft.meio===m.id?'on':''}" data-act="dMeio" data-id="${m.id}">${m.n}</button>`).join('');
  return `<div class="card">
    <h2>Novo gasto</h2>
    <input id="gValor" class="valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off">
    <label>Categoria</label><div class="chips">${chipsCat}</div>
    <label>Pagou com</label><div class="chips">${chipsMeio}</div>
    ${ui.draft.meio==='cartao'?`<label>Parcelado?</label><div class="chips"><button class="chip ${!ui.draft.parcelado?'on':''}" data-act="dParc" data-v="0">À vista</button><button class="chip ${ui.draft.parcelado?'on':''}" data-act="dParc" data-v="1">Parcelado</button></div>
    ${ui.draft.parcelado?`<label>Número de parcelas (o valor acima é o total)</label><input id="gParc" inputmode="numeric" placeholder="ex: 6">`:''}`:''}
    <div class="two-in">
      <div><label>Data</label><input id="gData" type="date" value="${todayISO()}"></div>
      <div><label>Descrição (opcional)</label><input id="gDesc" placeholder="ex: pizza sexta"></div>
    </div>
    <button class="btn" data-act="saveG">Salvar gasto</button>
  </div>`;
}

function vFixos(){
  const hoje = thisMonth();
  const fix = S.recorrentes.filter(r=>r.tipo==='fixo');
  const par = S.recorrentes.filter(r=>r.tipo==='parcela');
  const line = r => {
    const ct = catOf(r.cat);
    let sub = esc(meioOf(r.meio));
    if(r.tipo==='parcela'){
      const i = diffM(r.inicio,hoje);
      const fim = addM(r.inicio, r.parcelas-1);
      if(i<0) sub += ` · começa em ${mLabel(r.inicio,true)}`;
      else if(i>=r.parcelas) sub += ` · <span class="pos">quitado</span>`;
      else sub += ` · ${i+1}/${r.parcelas} · termina ${mLabel(fim,true)}/${fim.slice(2,4)} · faltam ${fmt((r.parcelas-i-1)*r.valor)}`;
    }
    return `<div class="row"><span class="l"><span class="dot" style="background:${ct.c}"></span>${esc(r.nome)}<br><span class="mut sm">${sub}</span></span><span style="white-space:nowrap"><b>${fmt(r.valor)}</b><button class="x" data-act="editR" data-id="${r.id}" aria-label="Editar">✎</button><button class="x" data-act="delR" data-id="${r.id}" aria-label="Apagar">×</button></span></div>`;
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
  const e = S.recorrentes.find(r=>r.id===ui.editId) || null;
  h += `<div class="card" style="margin-top:12px"><h2>${e?'Editar':'Adicionar'} fixo ou parcela</h2>
    <label>Nome</label><input id="rNome" value="${esc(e?.nome||'')}" placeholder="ex: Academia">
    <div class="two-in">
      <div><label>Valor por mês</label><input id="rValor" inputmode="decimal" value="${e?String(e.valor).replace('.',','):''}" placeholder="0,00"></div>
      <div><label>Tipo</label><select id="rTipo"><option value="fixo" ${e?.tipo==='fixo'?'selected':''}>Fixo (todo mês)</option><option value="parcela" ${e?.tipo==='parcela'?'selected':''}>Parcelado</option></select></div>
      <div><label>Nº de parcelas (se parcelado)</label><input id="rParc" inputmode="numeric" value="${e?.parcelas||''}" placeholder="ex: 10"></div>
      <div><label>${'1ª fatura / 1º pagamento'}</label><input id="rIni" type="month" value="${e?.inicio||hoje}"></div>
      <div><label>Pago com</label><select id="rMeio">${MEIOS.map(m=>`<option value="${m.id}" ${(e?.meio||'cartao')===m.id?'selected':''}>${m.n}</option>`).join('')}</select></div>
      <div><label>Categoria</label><select id="rCat">${CATS.map(c=>`<option value="${c.id}" ${(e?.cat||'outros')===c.id?'selected':''}>${esc(c.n)}</option>`).join('')}</select></div>
    </div>
    <button class="btn" data-act="saveR">${e?'Salvar alterações':'Adicionar'}</button>
    ${e?'<button class="btn sec" data-act="cancelR">Cancelar edição</button>':''}
  </div>`;
  return h;
}

function vMetas(){
  let h = `<div class="grid two">`;
  S.metas.forEach(m=>{
    const p = m.alvo? Math.min(100, m.atual/m.alvo*100) : 0;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start"><h2>${esc(m.nome)}</h2><button class="x" data-act="delM" data-id="${m.id}" aria-label="Apagar">×</button></div>
      <div class="big">${fmt(m.atual)}</div><div class="mut sm">de ${fmt(m.alvo)} · faltam ${fmt(Math.max(0,m.alvo-m.atual))}</div>
      <div class="bar" style="height:10px;margin-top:10px"><i style="width:${p}%"></i></div>
      <div class="btns"><button class="btn sec" data-act="movM" data-id="${m.id}" data-s="1">+ Guardar</button><button class="btn sec" data-act="movM" data-id="${m.id}" data-s="-1">− Retirar</button></div>
    </div>`;
  });
  h += `</div>`;
  h += `<div class="card" style="margin-top:12px"><h2>Nova meta</h2>
    <div class="two-in"><div><label>Nome</label><input id="mNome" placeholder="ex: Viagem"></div><div><label>Valor alvo</label><input id="mAlvo" inputmode="decimal" placeholder="0,00"></div></div>
    <button class="btn" data-act="saveM">Criar meta</button></div>`;
  h += `<div class="card" style="margin-top:12px"><h2>Limite por categoria (por mês)</h2>
    <p class="note" style="margin:0 0 6px">Deixe vazio para não ter limite. No Início a barra fica amarela perto do limite e vermelha quando estoura.</p>
    ${CATS.map(c=>`<div class="row"><span class="l"><span class="dot" style="background:${c.c}"></span>${esc(c.n)}</span><input data-lim="${c.id}" inputmode="decimal" style="width:120px;padding:8px 10px;font-size:15px" value="${S.limites[c.id]?String(S.limites[c.id]).replace('.',','):''}" placeholder="—"></div>`).join('')}
    <button class="btn" data-act="saveLim">Salvar limites</button></div>`;
  return h;
}

function vAjustes(){
  const c = S.config;
  return `<div class="card"><h2>Renda e cartão</h2>
    <label>Renda líquida mensal</label><input id="cRenda" inputmode="decimal" value="${String(c.renda).replace('.',',')}">
    <div class="two-in">
      <div><label>Dia de fechamento da fatura</label><input id="cFech" inputmode="numeric" value="${c.fechamento}"></div>
      <div><label>Dia de vencimento</label><input id="cVenc" inputmode="numeric" value="${c.vencimento}"></div>
    </div>
    <p class="note">Esses dias estão no app do banco, na tela da fatura. Eles decidem em qual fatura cada compra cai.</p>
    <button class="btn" data-act="saveCfg">Salvar</button></div>

  <div class="card" style="margin-top:12px"><h2>Importar extrato do cartão (CSV)</h2>
    <p class="note" style="margin-top:0">Baixe a fatura em CSV pelo internet banking e importe aqui. O app tenta achar data, descrição e valor sozinho, categoriza pelo nome do estabelecimento (iFood, posto, mercado…) e ignora linhas repetidas e o pagamento da fatura.</p>
    <button class="btn sec" data-act="pickCsv">Escolher arquivo CSV</button></div>

  <div class="card" style="margin-top:12px"><h2>Seus dados</h2>
    <p class="note" style="margin-top:0">Tudo fica salvo só neste navegador, neste aparelho. Nada é enviado para lugar nenhum. Por isso, <b>exporte um backup de vez em quando</b> — e use o mesmo arquivo para passar os dados do PC para o celular (ou vice-versa).</p>
    <div class="btns"><button class="btn" data-act="export">Exportar backup</button><button class="btn sec" data-act="pickJson">Importar backup</button></div>
    <p class="note">${S.gastos.length} gastos · ${S.recorrentes.length} fixos/parcelas · ${S.metas.length} metas</p>
    <button class="btn dng" data-act="reset">Apagar tudo e começar do zero</button></div>`;
}
