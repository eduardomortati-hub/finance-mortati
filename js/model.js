// Formato dos dados, migração de versões antigas e validação de backups.
import { CATS, MEIOS } from './config.js';
import { round2 } from './util.js';

export const VERSAO_DADOS = 2;
// v2: categorias editáveis (cats), entradas, fim/reajuste de fixos, movimentos das metas, data do último backup

export function empty(){
  return {v:VERSAO_DADOS, config:{renda:0, fechamento:1, vencimento:10, configurado:false, ultimoBackup:null},
    cats:CATS.map(c=>({...c})), gastos:[], entradas:[], recorrentes:[], metas:[], limites:{}};
}

const ISO = /^\d{4}-\d{2}-\d{2}$/, YM = /^\d{4}-\d{2}$/, ID = /^[A-Za-z0-9_-]{1,40}$/, COR = /^#[0-9a-f]{6}$/i;
const num = v => typeof v==='number' && Number.isFinite(v);
const str = (s,max=80) => String(s ?? '').slice(0,max);
const int = (v,def,min,max) => { const n = Number(v); return Number.isInteger(n) && n>=min && n<=max ? n : def; };

// Normaliza dados salvos ou de backup para o formato atual, descartando itens inválidos.
// Lança Error (mensagem para o usuário) se não for um backup do app. Devolve {state, ignorados}.
export function normalize(d){
  if(!d || typeof d!=='object' || !d.config || typeof d.config!=='object' || !Array.isArray(d.gastos)) throw new Error('Esse arquivo não é um backup do Meu Caixa');
  if(num(d.v) && d.v > VERSAO_DADOS) throw new Error('Backup feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  let ignorados = 0;
  const keep = (arr, ok) => (Array.isArray(arr) ? arr : []).filter(x=>{ const v = !!x && typeof x==='object' && ok(x); if(!v) ignorados++; return v; });

  const c = d.config;
  const renda = Number(c.renda);
  const config = {renda: num(renda) && renda>=0 ? round2(renda) : 0, fechamento:int(c.fechamento,1,1,31), vencimento:int(c.vencimento,10,1,31),
    configurado:!!c.configurado, ultimoBackup: typeof c.ultimoBackup==='string' && ISO.test(c.ultimoBackup) ? c.ultimoBackup : null};

  const cats = keep(d.cats ?? CATS, x=>ID.test(x.id) && typeof x.n==='string' && x.n.trim() && COR.test(x.c)).map(x=>({id:x.id, n:str(x.n,40), c:x.c.toLowerCase()}));
  if(!cats.some(x=>x.id==='outros')) cats.push({...CATS.find(x=>x.id==='outros')});
  const catIds = new Set(cats.map(x=>x.id)), meioIds = new Set(MEIOS.map(m=>m.id));
  const cat = id => catIds.has(id) ? id : 'outros';
  const criado = x => num(x.criado) ? x.criado : 0;

  const gastos = keep(d.gastos, x=>ID.test(x.id) && ISO.test(x.data) && num(x.valor) && x.valor>0 && meioIds.has(x.meio))
    .map(x=>({id:x.id, data:x.data, valor:round2(x.valor), cat:cat(x.cat), meio:x.meio, desc:str(x.desc), criado:criado(x)}));
  const entradas = keep(d.entradas, x=>ID.test(x.id) && ISO.test(x.data) && num(x.valor) && x.valor>0)
    .map(x=>({id:x.id, data:x.data, valor:round2(x.valor), desc:str(x.desc), criado:criado(x)}));
  const recorrentes = keep(d.recorrentes, x=>ID.test(x.id) && typeof x.nome==='string' && num(x.valor) && x.valor>=0 && YM.test(x.inicio) && meioIds.has(x.meio)
      && (x.tipo==='fixo' || (x.tipo==='parcela' && Number.isInteger(x.parcelas) && x.parcelas>=1)) && (x.fim==null || YM.test(x.fim)))
    .map(x=>{ const r = {id:x.id, nome:str(x.nome), valor:round2(x.valor), tipo:x.tipo, meio:x.meio, inicio:x.inicio, cat:cat(x.cat)};
      if(x.tipo==='parcela') r.parcelas = x.parcelas; if(x.fim) r.fim = x.fim; return r; });
  const metas = keep(d.metas, x=>ID.test(x.id) && typeof x.nome==='string' && num(x.alvo) && num(x.atual))
    .map(x=>{ const m = {id:x.id, nome:str(x.nome), alvo:round2(Math.max(0,x.alvo)), atual:round2(Math.max(0,x.atual)),
      movs:keep(x.movs, v=>ISO.test(v.data) && num(v.valor)).map(v=>({data:v.data, valor:round2(v.valor)}))};
      if(x.arquivada) m.arquivada = true; return m; });
  const limites = {};
  for(const [k,v] of Object.entries(d.limites && typeof d.limites==='object' ? d.limites : {})){ const n = Number(v); if(catIds.has(k) && num(n) && n>0) limites[k] = round2(n); }

  return {state:{v:VERSAO_DADOS, config, cats, gastos, entradas, recorrentes, metas, limites}, ignorados};
}
