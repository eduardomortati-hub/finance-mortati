// Importação de backup (JSON) e de fatura (CSV). Os arquivos são lidos só no aparelho.
import { RULES } from './config.js';
import { S, save, setS } from './store.js';
import { ui, render } from './views.js';
import { $, uid, fmt, round2, parseNum, sum, toast } from './util.js';

export function initImports(){
  $('#fileJson').addEventListener('change', async e=>{
    const f=e.target.files[0]; e.target.value=''; if(!f) return;
    try{
      const d=JSON.parse(await f.text());
      if(!d||!d.config||!Array.isArray(d.gastos)) throw 0;
      if(!confirm(`Substituir os dados atuais pelo backup (${d.gastos.length} gastos)?`)) return;
      setS(Object.assign({limites:{},metas:[],recorrentes:[]},d)); toast('Backup restaurado ✓'); render();
    }catch(_){ toast('Arquivo de backup inválido'); }
  });

  $('#fileCsv').addEventListener('change', async e=>{
    const f=e.target.files[0]; e.target.value=''; if(!f) return;
    let txt = await f.text();
    if(txt.includes('�')){ // provavelmente latin-1 (comum em bancos)
      const buf = await f.arrayBuffer(); txt = new TextDecoder('windows-1252').decode(buf);
    }
    const lines = txt.split(/\r?\n/).filter(l=>l.trim());
    const sep = (txt.match(/;/g)||[]).length > (txt.match(/,/g)||[]).length/3 ? ';' : ',';
    const novos=[]; let ignor=0;
    const existe = new Set(S.gastos.map(g=>g.data+'|'+g.valor+'|'+(g.desc||'').toUpperCase()));
    for(const l of lines){
      const cols = splitCsv(l, sep).map(c=>c.trim().replace(/^"|"$/g,''));
      const dIdx = cols.findIndex(c=>/^\d{2}\/\d{2}(\/\d{2,4})?$/.test(c) || /^\d{4}-\d{2}-\d{2}$/.test(c));
      if(dIdx<0) continue;
      let iso; const dc=cols[dIdx];
      if(dc.includes('-')) iso=dc; else { let [dd,mm,yy]=dc.split('/'); if(!yy) yy=String(new Date().getFullYear()); if(yy.length===2) yy='20'+yy; iso=yy+'-'+mm+'-'+dd; }
      let valor=NaN, vIdx=-1;
      for(let i=cols.length-1;i>=0;i--){ if(i===dIdx) continue; if(/^-?\s*(R\$)?\s*-?[\d.]+,\d{2}$|^-?\d+\.\d{2}$/.test(cols[i])){ valor=parseNum(cols[i].replace(/\s/g,'')); vIdx=i; break; } }
      if(isNaN(valor)||valor===0) continue;
      const desc = cols.filter((c,i)=>i!==dIdx&&i!==vIdx&&/[A-Za-z]/.test(c)).sort((a,b)=>b.length-a.length)[0]||'';
      if(/PAGTO|PAGAMENTO|PAG FATURA|SALDO|TOTAL|ESTORNO|CREDITO/i.test(desc)){ ignor++; continue; }
      valor = round2(Math.abs(valor));
      const k = iso+'|'+valor+'|'+desc.toUpperCase();
      if(existe.has(k)){ ignor++; continue; }
      existe.add(k);
      let cat='outros'; for(const [re,c] of RULES){ if(re.test(desc)){ cat=c; break; } }
      novos.push({id:uid(), data:iso, valor, cat, meio:'cartao', desc:desc.slice(0,60), criado:Date.now()});
    }
    if(!novos.length) return toast(ignor?'Nada novo — tudo já estava lançado':'Não reconheci lançamentos nesse arquivo');
    const tot=sum(novos);
    if(!confirm(`Encontrei ${novos.length} lançamentos (${fmt(tot)}).\n${ignor} linhas ignoradas (repetidas/pagamentos).\n\nImportar como compras no cartão?`)) return;
    S.gastos.push(...novos); save(); toast(`${novos.length} lançamentos importados ✓`); ui.tab='inicio'; render();
  });
}

function splitCsv(line, sep){
  const out=[]; let cur='', q=false;
  for(const ch of line){ if(ch==='"'){ q=!q; cur+=ch; } else if(ch===sep && !q){ out.push(cur); cur=''; } else cur+=ch; }
  out.push(cur); return out;
}
