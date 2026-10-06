// Os dados ficam no localStorage deste navegador. Com conta, js/nuvem.js também os envia para a nuvem da pessoa.
import { KEY } from './config.js';
import { empty, normalize } from './model.js';
import { toast, todayISO } from './util.js';

export let loadError = false;

// antes de migrar ou descartar algo, guarda uma cópia do que estava salvo
function keepCopy(raw){ try{ localStorage.setItem(KEY+'.copia-'+todayISO(), raw); }catch(e){} }

function load(){
  let raw = null;
  try{ raw = localStorage.getItem(KEY); }catch(e){}
  if(!raw) return empty();
  try{
    const d = JSON.parse(raw);
    const {state, ignorados} = normalize(d);
    if(ignorados || d.v !== state.v) keepCopy(raw);
    return state;
  }catch(e){
    keepCopy(raw); loadError = true;
    return empty();
  }
}

// `S` é live binding: quem importa sempre enxerga o estado atual, mesmo depois de setS()
export let S = load();
export function setS(d){ S = d; save(); }
let aoSalvar = null;
export const setAoSalvar = fn => { aoSalvar = fn; };
function gravarLocal(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ toast('Este navegador não deixou salvar. Exporte um backup em Ajustes.'); }
}
export function save(){ gravarLocal(); aoSalvar?.(); }
// troca os dados pelos que vieram da nuvem (sem disparar novo envio)
export function trocaS(d){ S = d; gravarLocal(); }

const OUTROS = {id:'outros', n:'Outros', c:'#94a3b8'};
// categorias escondidas somem das opções, mas os lançamentos antigos continuam nelas
export const catsAtivas = () => S.cats.filter(c=>!c.oculta);
export const catOf = id => S.cats.find(c=>c.id===id) || S.cats.find(c=>c.id==='outros') || OUTROS;
export const cartoesAtivos = () => S.cartoes.filter(k=>!k.arquivado);
export const cartaoOf = id => S.cartoes.find(k=>k.id===id) || cartoesAtivos()[0] || S.cartoes[0];
