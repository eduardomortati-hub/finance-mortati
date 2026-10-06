import { S } from './store.js';
import { pad, addM, diffM, sum } from './util.js';

const diasNoMes = k => { const [y,m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// mês do fechamento da fatura que vence em k
const fechamentoDe = k => Number(S.config.vencimento) > Number(S.config.fechamento) ? k : addM(k,-1);

// mês em que a compra no cartão vence (fatura)
export function faturaMonth(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const k = y+'-'+pad(m);
  const F = Number(S.config.fechamento)||1, V = Number(S.config.vencimento)||10;
  const fecha = d < F ? k : addM(k,1);      // compras a partir do dia do fechamento vão para a próxima
  return V > F ? fecha : addM(fecha,1);
}

// primeiro e último dia de compra que caem na fatura que vence em k (inverso de faturaMonth)
export function faturaPeriodo(k){
  const F = Number(S.config.fechamento)||1;
  const fecha = fechamentoDe(k), ant = addM(fecha,-1);
  const ini = F <= diasNoMes(ant) ? ant+'-'+pad(F) : fecha+'-01';
  const fim = F > 1 ? fecha+'-'+pad(Math.min(F-1, diasNoMes(fecha))) : ant+'-'+pad(diasNoMes(ant));
  return {ini, fim};
}

export function recInMonth(r,k){
  const i = diffM(r.inicio,k);
  if(i<0) return null;
  if(r.fim && diffM(r.fim,k) > 0) return null;   // encerrado antes de k
  if(r.tipo==='parcela'){ if(i >= r.parcelas) return null; return {n:i+1}; }
  return {n:null};
}

// guardado (+) ou retirado (−) das metas no mês k, inclusive de metas arquivadas
export const guardadoNoMes = k => sum(S.metas.flatMap(m=>m.movs||[]).filter(v=>v.data.slice(0,7)===k));

export function calc(k){
  const cardG = S.gastos.filter(g=>g.meio==='cartao' && faturaMonth(g.data)===k);
  const cashG = S.gastos.filter(g=>g.meio!=='cartao' && g.data.slice(0,7)===k);
  const recs = S.recorrentes.map(r=>({r, info:recInMonth(r,k)})).filter(x=>x.info);
  const cardR = recs.filter(x=>x.r.meio==='cartao');
  const otherR = recs.filter(x=>x.r.meio!=='cartao');
  const fatura = sum(cardG) + sum(cardR, x=>x.r.valor);
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
  return {fatura, faturaCompras:sum(cardG), faturaFixos:sum(cardR,x=>x.r.valor), fixosFora, avulsos, renda, entradas, entradasMes, guardado, saidas, sobra, doMes, porCat, comprometido:sum(recs,x=>x.r.valor)};
}
