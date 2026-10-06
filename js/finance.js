import { S, cartaoOf } from './store.js';
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
