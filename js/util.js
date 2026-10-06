export const $ = s => document.querySelector(s);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const round2 = v => Math.round((Number(v)||0)*100)/100;
export function parseNum(s){
  s = String(s ?? '').trim().replace(/R\$|\s/g,'');
  if(!s) return NaN;
  if(s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  return parseFloat(s);
}
export const pad = n => String(n).padStart(2,'0');
export const todayISO = () => { const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
export const thisMonth = () => todayISO().slice(0,7);
export function addM(k,n){ let [y,m]=k.split('-').map(Number); m+=n; y+=Math.floor((m-1)/12); m=((m-1)%12+12)%12+1; return y+'-'+pad(m); }
export function diffM(a,b){ const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number); return (by-ay)*12+(bm-am); }
export function mLabel(k,short){ const [y,m]=k.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('pt-BR', short?{month:'short'}:{month:'long',year:'numeric'}).replace('.',''); }
export function dLabel(iso){ const [y,m,d]=iso.split('-'); return d+'/'+m; }
export const sum = (arr,f=x=>x.valor) => arr.reduce((a,x)=>a+(Number(f(x))||0),0);

export function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2400); }
