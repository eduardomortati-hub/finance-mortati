import { S, cartaoOf, catOf } from './store.js';
import { pad, addM, diffM, sum, todayISO, addDias, diasEntre } from './util.js';

const diasNoMes = k => { const [y,m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// mês do fechamento da fatura que vence em k
const fechamentoDe = (k, c) => c.vencimento > c.fechamento ? k : addM(k,-1);

// mês em que a compra no cartão `c` vence (fatura)
export function faturaMonth(iso, c){
  const [y,m,d] = iso.split('-').map(Number);
  const k = y+'-'+pad(m);
  const fecha = d < c.fechamento ? k : addM(k,1);      // compras a partir do dia do fechamento vão para a próxima
  return c.vencimento > c.fechamento ? fecha : addM(fecha,1);
}

// primeiro e último dia de compra que caem na fatura do cartão `c` que vence em k (inverso de faturaMonth)
export function faturaPeriodo(k, c){
  const F = c.fechamento, fecha = fechamentoDe(k, c), ant = addM(fecha,-1);
  const ini = F <= diasNoMes(ant) ? ant+'-'+pad(F) : fecha+'-01';
  const fim = F > 1 ? fecha+'-'+pad(Math.min(F-1, diasNoMes(fecha))) : ant+'-'+pad(diasNoMes(ant));
  return {ini, fim};
}

// dia em que vence a fatura do mês k (dia 31 em fevereiro vira o último dia do mês)
export const vencimentoData = (k, c) => k+'-'+pad(Math.min(c.vencimento, diasNoMes(k)));

export function recInMonth(r,k){
  const i = diffM(r.inicio,k);
  if(i<0) return null;
  if(r.fim && diffM(r.fim,k) > 0) return null;   // encerrado antes de k
  if(r.tipo==='parcela'){ if(i >= r.parcelas) return null; return {n:i+1}; }
  return {n:null};
}

// guardado (+) ou retirado (−) no mês k: metas e investimentos, inclusive arquivados. Rendimento não conta (não saiu da sobra).
export const guardadoNoMes = k => sum([...S.metas.flatMap(m=>m.movs||[]), ...(S.investimentos||[]).flatMap(i=>i.movs).filter(v=>!v.rend)].filter(v=>v.data.slice(0,7)===k));
// rendimento registrado no mês k (diferença ao atualizar saldos)
export const rendimentoNoMes = k => sum((S.investimentos||[]).flatMap(i=>i.movs).filter(v=>v.rend && v.data.slice(0,7)===k));

export function calc(k){
  const cashG = S.gastos.filter(g=>g.meio!=='cartao' && g.data.slice(0,7)===k);
  const recs = S.recorrentes.map(r=>({r, info:recInMonth(r,k)})).filter(x=>x.info);
  const otherR = recs.filter(x=>x.r.meio!=='cartao');
  const porCartao = S.cartoes.map(cartao=>{
    const compras = sum(S.gastos.filter(g=>g.meio==='cartao' && cartaoOf(g.cartao)===cartao && faturaMonth(g.data, cartao)===k));
    const fixos = sum(recs.filter(x=>x.r.meio==='cartao' && cartaoOf(x.r.cartao)===cartao), x=>x.r.valor);
    return {cartao, compras, fixos, total:compras+fixos};
  });
  const fatura = sum(porCartao, x=>x.total);
  const fixosFora = sum(otherR, x=>x.r.valor);
  const avulsos = sum(cashG);
  const renda = Number(S.config.renda)||0;
  const entradasMes = S.entradas.filter(e=>e.data.slice(0,7)===k);
  const entradas = sum(entradasMes);
  const guardado = guardadoNoMes(k);
  const saidas = fatura + fixosFora + avulsos;
  const sobra = renda + entradas - saidas - guardado;
  const doMes = S.gastos.filter(g=>g.data.slice(0,7)===k);
  const porCat = {};
  doMes.forEach(g=>{ porCat[g.cat]=(porCat[g.cat]||0)+g.valor; });
  recs.forEach(x=>{ porCat[x.r.cat]=(porCat[x.r.cat]||0)+x.r.valor; });
  return {fatura, porCartao, faturaCompras:sum(porCartao,x=>x.compras), faturaFixos:sum(porCartao,x=>x.fixos), fixosFora, avulsos, renda, entradas, entradasMes, guardado, saidas, sobra, doMes, porCat, comprometido:sum(recs,x=>x.r.valor)};
}

// Situação do cartão `c` em `hoje`: próxima fatura a pagar, fatura aberta e melhor dia de compra.
// Melhor dia = dia do fechamento: a compra já cai na fatura seguinte e dá o maior prazo até pagar.
export function infoCartao(c, hoje = todayISO()){
  const valor = k => calc(k).porCartao.find(x=>x.cartao===c)?.total || 0;
  const aberta = faturaMonth(hoje, c);
  const periodo = faturaPeriodo(aberta, c);
  const fechaEm = addDias(periodo.fim, 1);                 // primeiro dia que já vai para a fatura seguinte
  let prox = hoje.slice(0,7);
  if(vencimentoData(prox, c) < hoje) prox = addM(prox,1);  // a fatura deste mês já venceu
  const pagaHoje = vencimentoData(aberta, c), pagaMelhor = vencimentoData(addM(aberta,1), c);
  return {
    prox, proxVence:vencimentoData(prox, c), diasProx:diasEntre(hoje, vencimentoData(prox, c)), valorProx:valor(prox),
    aberta, fechaEm, diasFecha:diasEntre(hoje, fechaEm), valorAberta:valor(aberta),
    pagaHoje, diasHoje:diasEntre(hoje, pagaHoje),
    hojeEhMelhor: periodo.ini===hoje, melhorDia:fechaEm, pagaMelhor, diasMelhor:diasEntre(fechaEm, pagaMelhor)
  };
}

/* ---------- contas: saldo que o app vai atualizando sozinho ----------
   A pessoa informa o saldo de cada conta uma vez (saldo + momento em `desde`/`desdeTs`). A partir daí entram sozinhos:
   gastos no pix/débito/dinheiro e entradas (pela data e hora de criação), a renda fixa no dia em que cai, os fixos fora
   do cartão no dia do pagamento e as faturas marcadas como pagas. "Corrigir saldo" informa um saldo novo e recomeça a conta. */
export const contasAtivas = () => (S.contas||[]).filter(c=>!c.arquivada);
export const contaPadrao = () => contasAtivas()[0] || (S.contas||[])[0] || null;
const diaDo = (k, d) => k+'-'+pad(Math.min(Number(d)||1, diasNoMes(k)));
const daConta = (id, c) => ((id && S.contas.some(x=>x.id===id)) ? id : contaPadrao()?.id) === c.id;

// movimentos da conta `c` depois do saldo informado, até `ate` (inclusive), em ordem de data
export function movimentosConta(c, ate = todayISO()){
  const out = [];
  const conta = (data, criado) => (data > c.desde || (data===c.desde && criado!=null && criado > c.desdeTs)) && data <= ate;
  S.gastos.forEach(g=>{ if(g.meio!=='cartao' && daConta(g.conta, c) && conta(g.data, g.criado)) out.push({data:g.data, valor:-g.valor, desc:g.desc || catOf(g.cat).n, tipo:'gasto', id:g.id}); });
  S.entradas.forEach(e=>{ if(daConta(e.conta, c) && conta(e.data, e.criado)) out.push({data:e.data, valor:e.valor, desc:e.desc || 'Entrada', tipo:'entrada', id:e.id}); });
  const renda = Number(S.config.renda)||0;
  for(let k = c.desde.slice(0,7); k <= ate.slice(0,7); k = addM(k,1)){
    if(renda && daConta(S.config.contaRenda, c)){ const d = diaDo(k, S.config.diaRenda||5); if(conta(d)) out.push({data:d, valor:renda, desc:'Renda', tipo:'renda'}); }
    S.recorrentes.forEach(r=>{
      if(r.meio==='cartao' || !recInMonth(r, k) || !daConta(r.conta, c)) return;
      const d = diaDo(k, r.dia||10); if(conta(d)) out.push({data:d, valor:-r.valor, desc:r.nome, tipo:'fixo'});
    });
  }
  S.cartoes.forEach(k=>Object.entries(k.pagtos||{}).forEach(([m, p])=>{
    if(daConta(p.conta, c) && conta(p.data, p.ts)) out.push({data:p.data, valor:-(calc(m).porCartao.find(x=>x.cartao===k)?.total||0), desc:'Fatura '+k.nome, tipo:'fatura'});
  }));
  return out.sort((a,b)=>a.data.localeCompare(b.data));
}
export const saldoConta = (c, ate = todayISO()) => (Number(c.saldo)||0) + sum(movimentosConta(c, ate), x=>x.valor);

// quanto vai ter nas contas no fim deste mês: o que já está previsto (renda, fixos, lançamentos com data futura)
// menos as faturas que ainda vão vencer este mês e não foram marcadas como pagas
export function previsaoFimDoMes(){
  const hoje = todayISO(), k = hoje.slice(0,7), fim = diaDo(k, 31);
  let total = sum(contasAtivas(), c=>saldoConta(c, fim));
  const porCartao = calc(k).porCartao;
  S.cartoes.forEach(cart=>{
    if((cart.pagtos||{})[k] || (cart.pagas||[]).includes(k) || vencimentoData(k, cart) < hoje) return;
    total -= porCartao.find(x=>x.cartao===cart)?.total || 0;
  });
  return total;
}
