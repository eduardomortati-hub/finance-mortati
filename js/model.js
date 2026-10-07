// Formato dos dados, migração de versões antigas e validação de backups.
import { CATS, MEIOS, CORES_CARTAO, TIPOS_INV } from './config.js';
import { round2 } from './util.js';

export const VERSAO_DADOS = 5;
// v2: categorias editáveis (cats), entradas, fim/reajuste de fixos, movimentos das metas, data do último backup
// v5: contas bancárias (saldo informado + movimentos automáticos); conta em gastos/entradas/fixos, dia dos fixos e da renda, pagamento das faturas
// v4: investimentos (saldo por aplicação; aplicações e resgates contam na sobra do mês, rendimentos não)
// v3: vários cartões (cartoes), cada um com fechamento e vencimento; gastos e fixos no cartão apontam para um deles

const cartaoPadrao = (fechamento=1, vencimento=10) => ({id:'cartao1', nome:'Meu cartão', fechamento, vencimento, cor:CORES_CARTAO[0]});

export function empty(){
  return {v:VERSAO_DADOS, config:{renda:0, configurado:false, ultimoBackup:null}, cartoes:[cartaoPadrao()],
    cats:CATS.map(c=>({...c})), gastos:[], entradas:[], recorrentes:[], metas:[], investimentos:[], contas:[], limites:{}};
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
  const config = {renda: num(renda) && renda>=0 ? round2(renda) : 0,
    configurado:!!c.configurado, ultimoBackup: typeof c.ultimoBackup==='string' && ISO.test(c.ultimoBackup) ? c.ultimoBackup : null,
    diaRenda:int(c.diaRenda,5,1,31)};
  if(typeof c.contaRenda==='string' && ID.test(c.contaRenda)) config.contaRenda = c.contaRenda;
  // contas bancárias: saldo informado em `desde` (data) / `desdeTs` (momento); daí em diante o app soma os movimentos
  const contas = keep(d.contas, x=>ID.test(x.id) && typeof x.nome==='string' && x.nome.trim() && num(x.saldo) && ISO.test(x.desde))
    .map(x=>{ const k = {id:x.id, nome:str(x.nome,40), saldo:round2(x.saldo), desde:x.desde, desdeTs:num(x.desdeTs) ? x.desdeTs : 0}; if(x.arquivada) k.arquivada = true; return k; });
  const contaIds = new Set(contas.map(x=>x.id));
  const comConta = (obj, x) => { if(obj.meio!=='cartao' && contaIds.has(x.conta)) obj.conta = x.conta; return obj; };

  // até a v2 havia um cartão só, com fechamento e vencimento em config
  const cartoes = Array.isArray(d.cartoes)
    ? keep(d.cartoes, x=>ID.test(x.id) && typeof x.nome==='string' && x.nome.trim()).map((x,i)=>{
        const k = {id:x.id, nome:str(x.nome,40), fechamento:int(x.fechamento,1,1,31), vencimento:int(x.vencimento,10,1,31),
          cor: CORES_CARTAO.includes(x.cor) ? x.cor : CORES_CARTAO[i % CORES_CARTAO.length]};
        if(x.arquivado) k.arquivado = true;
        const pagas = Array.isArray(x.pagas) ? x.pagas.filter(m=>typeof m==='string' && YM.test(m)).slice(-24) : [];
        if(pagas.length) k.pagas = pagas;   // meses de vencimento das faturas marcadas como pagas
        // de qual conta e quando cada fatura foi paga (desconta do saldo da conta)
        const pagtos = Object.entries(x.pagtos && typeof x.pagtos==='object' ? x.pagtos : {}).filter(([m,p])=>YM.test(m) && p && typeof p.conta==='string' && ISO.test(p.data));
        if(pagtos.length) k.pagtos = Object.fromEntries(pagtos.slice(-24).map(([m,p])=>[m, {conta:p.conta, data:p.data, ts:num(p.ts) ? p.ts : 0}]));
        return k; })
    : [cartaoPadrao(int(c.fechamento,1,1,31), int(c.vencimento,10,1,31))];
  if(!cartoes.length) cartoes.push(cartaoPadrao());
  if(!cartoes.some(k=>!k.arquivado)) delete cartoes[0].arquivado;   // sempre ao menos um cartão ativo
  const cartaoIds = new Set(cartoes.map(k=>k.id)), cartao1 = cartoes.find(k=>!k.arquivado).id;
  const comCartao = (obj, x) => { if(obj.meio==='cartao') obj.cartao = cartaoIds.has(x.cartao) ? x.cartao : cartao1; return obj; };

  const cats = keep(d.cats ?? CATS, x=>ID.test(x.id) && typeof x.n==='string' && x.n.trim() && COR.test(x.c)).map(x=>{ const k = {id:x.id, n:str(x.n,40), c:x.c.toLowerCase()}; if(x.oculta && x.id!=='outros') k.oculta = true; return k; });
  if(!cats.some(x=>x.id==='outros')) cats.push({...CATS.find(x=>x.id==='outros')});
  const catIds = new Set(cats.map(x=>x.id)), meioIds = new Set(MEIOS.map(m=>m.id));
  const cat = id => catIds.has(id) ? id : 'outros';
  const criado = x => num(x.criado) ? x.criado : 0;

  const gastos = keep(d.gastos, x=>ID.test(x.id) && ISO.test(x.data) && num(x.valor) && x.valor>0 && meioIds.has(x.meio))
    .map(x=>comConta(comCartao({id:x.id, data:x.data, valor:round2(x.valor), cat:cat(x.cat), meio:x.meio, desc:str(x.desc), criado:criado(x)}, x), x));
  const entradas = keep(d.entradas, x=>ID.test(x.id) && ISO.test(x.data) && num(x.valor) && x.valor>0)
    .map(x=>{ const e = {id:x.id, data:x.data, valor:round2(x.valor), desc:str(x.desc), criado:criado(x)}; if(contaIds.has(x.conta)) e.conta = x.conta; return e; });
  const recorrentes = keep(d.recorrentes, x=>ID.test(x.id) && typeof x.nome==='string' && num(x.valor) && x.valor>=0 && YM.test(x.inicio) && meioIds.has(x.meio)
      && (x.tipo==='fixo' || (x.tipo==='parcela' && Number.isInteger(x.parcelas) && x.parcelas>=1)) && (x.fim==null || YM.test(x.fim)))
    .map(x=>{ const r = {id:x.id, nome:str(x.nome), valor:round2(x.valor), tipo:x.tipo, meio:x.meio, inicio:x.inicio, cat:cat(x.cat)};
      if(x.tipo==='parcela') r.parcelas = x.parcelas; if(x.fim) r.fim = x.fim;
      if(x.meio!=='cartao' && x.dia!=null) r.dia = int(x.dia,10,1,31);   // dia do pagamento (desconta do saldo da conta)
      return comConta(comCartao(r, x), x); });
  const metas = keep(d.metas, x=>ID.test(x.id) && typeof x.nome==='string' && num(x.alvo) && num(x.atual))
    .map(x=>{ const m = {id:x.id, nome:str(x.nome), alvo:round2(Math.max(0,x.alvo)), atual:round2(Math.max(0,x.atual)),
      movs:keep(x.movs, v=>ISO.test(v.data) && num(v.valor)).map(v=>({data:v.data, valor:round2(v.valor)}))};
      if(x.arquivada) m.arquivada = true; return m; });
  const tipos = new Set(TIPOS_INV.map(t=>t.id));
  const investimentos = keep(d.investimentos, x=>ID.test(x.id) && typeof x.nome==='string' && x.nome.trim() && num(x.saldo))
    .map(x=>{ const v = {id:x.id, nome:str(x.nome,60), tipo: tipos.has(x.tipo) ? x.tipo : 'outros', saldo:round2(Math.max(0,x.saldo)),
      movs:keep(x.movs, m=>ISO.test(m.data) && num(m.valor)).map(m=>{ const o = {data:m.data, valor:round2(m.valor)}; if(m.rend) o.rend = true; return o; })};
      if(x.arquivado) v.arquivado = true; return v; });
  const limites = {};
  for(const [k,v] of Object.entries(d.limites && typeof d.limites==='object' ? d.limites : {})){ const n = Number(v); if(catIds.has(k) && num(n) && n>0) limites[k] = round2(n); }

  return {state:{v:VERSAO_DADOS, config, cartoes, cats, gastos, entradas, recorrentes, metas, investimentos, contas, limites}, ignorados};
}
