// Conta e sincronização com o Supabase (projeto do dono do app; cada pessoa só lê e grava a própria linha — regras RLS no banco).
// Os dados continuam guardados no aparelho e o app funciona sem internet. Com conta, cada alteração vai para a nuvem
// e os outros aparelhos da mesma conta recebem ao abrir o app ou voltar para ele. Sem conta, nada sai do aparelho.
import { SUPABASE_URL, SUPABASE_KEY, KEY } from './config.js';
import { S, trocaS, setAoSalvar } from './store.js';
import { normalize } from './model.js';
import { todayISO } from './util.js';

const K_SESSAO = 'meucaixa.sessao', K_META = 'meucaixa.nuvem', K_SEM = 'meucaixa.semConta';
const ls = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k, v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const voltarPara = () => location.origin + location.pathname;   // links dos e-mails voltam para o app

/* ---------- conversa com o Supabase ---------- */
const MSGS = {
  invalid_credentials:'E-mail ou senha incorretos',
  email_not_confirmed:'Confirme seu e-mail antes de entrar: abra o link que enviamos',
  user_already_exists:'Já existe uma conta com esse e-mail',
  email_exists:'Já existe uma conta com esse e-mail',
  weak_password:'Senha fraca: use pelo menos 6 caracteres',
  same_password:'A nova senha precisa ser diferente da anterior',
  over_email_send_rate_limit:'Muitos e-mails enviados. Espere alguns minutos e tente de novo',
  over_request_rate_limit:'Muitas tentativas. Espere um pouco e tente de novo',
  validation_failed:'Confira o e-mail digitado',
  email_address_invalid:'Confira o e-mail digitado'
};
export class ErroNuvem extends Error {}
async function req(path, {method='GET', body, token, headers={}} = {}){
  let r;
  try{
    r = await fetch(SUPABASE_URL + path, {method, body: body===undefined ? undefined : JSON.stringify(body),
      headers:{apikey:SUPABASE_KEY, 'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {}), ...headers}});
  }catch(e){ const err = new ErroNuvem('Sem conexão com a internet'); err.offline = true; throw err; }
  const txt = await r.text(); let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!r.ok){
    const code = j?.error_code || j?.code;
    const e = new ErroNuvem(MSGS[code] || j?.msg || j?.message || j?.error_description || `Erro ${r.status} no servidor`);
    e.status = r.status; e.code = code; throw e;
  }
  return j;
}

/* ---------- sessão ---------- */
export const sessao = () => ls.get(K_SESSAO);
export const semConta = () => ls.get(K_SEM)===true;
export const usarSemConta = on => ls.set(K_SEM, on ? true : null);
function guardaSessao(j, user = j.user){
  const s = {access_token:j.access_token, refresh_token:j.refresh_token,
    expires_at: Number(j.expires_at) || Math.floor(Date.now()/1000) + (Number(j.expires_in) || 3600),
    user:{id:user.id, email:user.email, nome:user.user_metadata?.nome || ''}};
  ls.set(K_SESSAO, s); usarSemConta(false);
  return s;
}
let renovando = null;
async function token(){
  const s = sessao(); if(!s) throw new ErroNuvem('Entre na sua conta');
  if(s.expires_at - 60 > Date.now()/1000) return s.access_token;
  renovando ||= req('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:s.refresh_token}})
    .then(j=>guardaSessao(j).access_token)
    .catch(e=>{ if(e.status===400 || e.status===401){ ls.set(K_SESSAO, null); e.message = 'Sua sessão expirou. Entre de novo.'; e.expirou = true; } throw e; })
    .finally(()=>{ renovando = null; });
  return renovando;
}

export async function entrar(email, senha){
  return guardaSessao(await req('/auth/v1/token?grant_type=password', {method:'POST', body:{email, password:senha}}));
}
// devolve a sessão (se o projeto não pedir confirmação de e-mail) ou null (precisa abrir o link do e-mail)
export async function criarConta(nome, email, senha){
  const j = await req('/auth/v1/signup?redirect_to=' + encodeURIComponent(voltarPara()), {method:'POST', body:{email, password:senha, data:{nome}}});
  return j?.access_token ? guardaSessao(j) : null;
}
export const esqueciSenha = email => req('/auth/v1/recover?redirect_to=' + encodeURIComponent(voltarPara()), {method:'POST', body:{email}});
export async function novaSenha(senha){ await req('/auth/v1/user', {method:'PUT', token:await token(), body:{password:senha}}); }
export async function sair(){
  const s = sessao();
  if(s) req('/auth/v1/logout', {method:'POST', token:s.access_token}).catch(()=>{});
  ls.set(K_SESSAO, null); ls.set(K_META, null);
  status.fase = ''; status.quando = null;
}

// link do e-mail (confirmar conta ou criar nova senha): o Supabase volta para o app com a sessão no endereço (#access_token=…)
// devolve 'recovery', 'signup' etc., ou {erro} se o link venceu
export async function lerLinkDoEmail(){
  const h = new URLSearchParams(location.hash.slice(1));
  if(!h.has('access_token') && !h.has('error')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if(h.has('error')) return {erro: h.get('error_code')==='otp_expired' ? 'Esse link venceu ou já foi usado. Peça outro.' : (h.get('error_description') || 'Link inválido')};
  const t = {access_token:h.get('access_token'), refresh_token:h.get('refresh_token'), expires_at:h.get('expires_at'), expires_in:h.get('expires_in')};
  const user = await req('/auth/v1/user', {token:t.access_token});
  guardaSessao(t, user);
  return h.get('type') || 'signup';
}

/* ---------- sincronização ---------- */
// hash do que foi enviado/recebido por último: se os dados mudaram desde então, há algo a enviar
const hash = s => { let h = 2166136261; for(let i=0; i<s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(36); };
const meta = () => { const m = ls.get(K_META), s = sessao(); return m && s && m.uid===s.user.id ? m : null; };
const marca = base => ls.set(K_META, {uid:sessao().user.id, base, hash:hash(JSON.stringify(S))});
export const pendente = () => { const m = meta(); return !!m && m.hash!==hash(JSON.stringify(S)); };

export const status = {fase:'', quando:null, msg:''};   // fase: ok | enviando | offline | erro
let aoMudarStatus = ()=>{}, aoReceber = ()=>{};
export function aoMudar(fnStatus, fnDados){ aoMudarStatus = fnStatus; aoReceber = fnDados; }
function setStatus(fase, msg=''){ status.fase = fase; status.msg = msg; if(fase==='ok') status.quando = new Date(); aoMudarStatus(); }

const temDados = d => d.gastos.length + d.entradas.length + d.recorrentes.length + d.metas.length + (d.investimentos?.length||0) > 0 || d.config.configurado;
const linha = async () => (await req(`/rest/v1/dados?select=estado,atualizado&user_id=eq.${sessao().user.id}`, {token:await token()}))[0] || null;

// grava na nuvem; com `base`, só se ninguém mudou desde então (senão devolve null = conflito)
async function gravar(base){
  const t = await token(), agora = new Date().toISOString(), estado = JSON.parse(JSON.stringify(S)), uid = sessao().user.id;
  if(base===undefined){
    const r = await req('/rest/v1/dados?on_conflict=user_id', {method:'POST', token:t, body:{user_id:uid, estado, atualizado:agora},
      headers:{prefer:'resolution=merge-duplicates,return=representation'}});
    return r[0].atualizado;
  }
  const r = await req(`/rest/v1/dados?user_id=eq.${uid}&atualizado=eq.${encodeURIComponent(base)}`, {method:'PATCH', token:t, body:{estado, atualizado:agora},
    headers:{prefer:'return=representation'}});
  return r[0]?.atualizado ?? null;
}

// as duas pontas mudaram (ex.: celular e PC sem internet): junta tudo pelo id, com as alterações deste aparelho por cima
function mesclar(nuvem, aqui){
  const porId = (a=[], b=[]) => { const m = new Map(a.map(x=>[x.id, x])); b.forEach(x=>m.set(x.id, x)); return [...m.values()]; };
  const out = {...nuvem, ...aqui, limites:{...nuvem.limites, ...aqui.limites}};
  for(const k of ['gastos','entradas','recorrentes','metas','investimentos','contas','cartoes','cats']) out[k] = porId(nuvem[k], aqui[k]);
  return normalize(out).state;
}

async function ciclo(){
  const m = meta(); if(!m) return;
  for(let tentativa=0; tentativa<3; tentativa++){
    const srv = await linha(), sujo = pendente();
    if(srv && srv.atualizado!==m.base){            // outro aparelho mudou
      const daNuvem = normalize(srv.estado).state;
      if(!sujo){ trocaS(daNuvem); marca(srv.atualizado); aoReceber(); return; }
      trocaS(mesclar(daNuvem, S)); aoReceber();
      m.base = srv.atualizado;
    }
    if(!pendente() && srv) return;
    const nova = await gravar(srv ? m.base : undefined);
    if(nova){ marca(nova); return; }
    m.base = undefined;                            // alguém gravou no meio: busca de novo
  }
  throw new ErroNuvem('Não consegui sincronizar. Tente de novo.');
}

let rodando = null, deNovo = false;
export function sincronizar(){
  if(!sessao()) return Promise.resolve();
  if(rodando){ deNovo = true; return rodando; }
  rodando = (async()=>{
    setStatus('enviando');
    try{ do{ deNovo = false; await ciclo(); }while(deNovo); setStatus('ok'); }
    catch(e){ setStatus(e.offline ? 'offline' : 'erro', e.message); if(e.expirou) aoReceber(); }
    finally{ rodando = null; }
  })();
  return rodando;
}

// primeiro login neste aparelho: decide entre os dados daqui e os da nuvem
// `escolher(resumos)` pergunta à pessoa e devolve 'nuvem' ou 'aparelho'
export async function primeiraSincronizacao(escolher){
  if(meta()) return sincronizar();                  // já sincronizava com esta conta (ex.: sessão expirou)
  setStatus('enviando');
  try{
    const srv = await linha();
    if(!srv){ marca(await gravar()); }
    else{
      const daNuvem = normalize(srv.estado).state;
      const iguais = hash(JSON.stringify(daNuvem))===hash(JSON.stringify(S));
      if(!temDados(S) || iguais){ trocaS(daNuvem); marca(srv.atualizado); }
      else{
        const resumo = d => ({gastos:d.gastos.length, entradas:d.entradas.length, fixos:d.recorrentes.length});
        const c = await escolher({nuvem:{...resumo(daNuvem), quando:srv.atualizado}, aparelho:resumo(S)});
        try{ localStorage.setItem(KEY+'.copia-'+todayISO(), JSON.stringify(c==='nuvem' ? S : daNuvem)); }catch(e){}   // o que não foi escolhido fica guardado
        if(c==='nuvem'){ trocaS(daNuvem); marca(srv.atualizado); }
        else marca(await gravar());
      }
    }
    setStatus('ok');
  }catch(e){ setStatus(e.offline ? 'offline' : 'erro', e.message); throw e; }
}

/* ---------- quando sincronizar ---------- */
let timer = null;
export function iniciarSync(){
  setAoSalvar(()=>{ if(!meta()) return; clearTimeout(timer); timer = setTimeout(sincronizar, 1200); });
  addEventListener('online', ()=>sincronizar());
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') sincronizar(); });
}
