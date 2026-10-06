// Os dados ficam só no localStorage deste navegador. Nada é enviado para fora.
import { KEY } from './config.js';
import { toast } from './util.js';

export function empty(){
  return {v:1, config:{renda:0, fechamento:1, vencimento:10, configurado:false}, gastos:[], recorrentes:[], metas:[], limites:{}};
}
function load(){
  try{ const r = localStorage.getItem(KEY); if(r){ const d = JSON.parse(r); if(d && d.config) return d; } }catch(e){}
  return empty();
}

// `S` é live binding: quem importa sempre enxerga o estado atual, mesmo depois de setS()
export let S = load();
export function setS(d){ S = d; save(); }
export function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ toast('Este navegador não deixou salvar. Exporte um backup em Ajustes.'); }
}
