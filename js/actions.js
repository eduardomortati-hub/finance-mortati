import { S, save, setS, trocaS, catOf, cartaoOf, cartoesAtivos } from './store.js';
import * as nuvem from './nuvem.js';
import { empty } from './model.js';
import { faturaMonth, saldoConta, contasAtivas } from './finance.js';
import { ui, render, totalParcelado, statusTexto, vFatura, vExtrato } from './views.js';
import { ask } from './modal.js';
import { cifrar } from './crypto.js';
import { CATS, CORES_CARTAO } from './config.js';
import { $, esc, uid, fmt, fmtReal, discreto, setDiscreto, round2, parseNum, todayISO, thisMonth, addM, diffM, mLabel, valIn, toast } from './util.js';

function download(texto, nome){
  const blob = new Blob([texto], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

const dia = s => { const n = Number(String(s).trim()); return Number.isInteger(n) && n>=1 && n<=31 ? n : null; };

// aplica nomes e cores editados na lista de categorias (sem salvar)
function lerCats(){
  for(const k of S.cats){
    const n = document.querySelector(`[data-catn="${k.id}"]`), c = document.querySelector(`[data-catc="${k.id}"]`);
    if(n && n.value.trim()) k.n = n.value.trim().slice(0,40);
    if(c && /^#[0-9a-f]{6}$/i.test(c.value)) k.c = c.value.toLowerCase();
  }
}

export const A = {
  tab(d){ ui.tab=d.t; ui.editId=null; ui.editG=null; render(); },
  mes(d){ ui.mes=addM(ui.mes, Number(d.d)); render(); },
  irMes(d){ if(/^\d{4}-\d{2}$/.test(d.m)){ ui.mes = d.m; render(); } },
  tema(){ window.alternarTema?.(); render(); },
  busca(){
    const {q, cat, meio} = ui.busca;
    if(ui.buscaAberta || q || cat || meio){ ui.buscaAberta = false; ui.busca = {q:'', cat:'', meio:''}; render(); }   // fechar a lupa limpa a busca
    else { ui.buscaAberta = true; render(); $('[data-filtro="q"]')?.focus(); }
  },
  dTipo(d){ ui.draft.tipo=d.v; keepDraft(); },
  novo(d){ ui.draft.tipo=d.v; ui.editG=null; ui.tab='lancar'; render(); },
  dCat(d){ ui.draft.cat=d.id; ui.draft.catManual=true; keepDraft(); },
  olho(){ setDiscreto(!discreto.on); render(); },
  async pagaFat(d){
    const k = S.cartoes.find(x=>x.id===d.id); if(!k || !/^\d{4}-\d{2}$/.test(d.m)) return;
    const pagas = new Set(k.pagas||[]), era = pagas.has(d.m);
    if(era){ pagas.delete(d.m); if(k.pagtos){ delete k.pagtos[d.m]; if(!Object.keys(k.pagtos).length) delete k.pagtos; } }
    else{
      // de qual conta saiu o pagamento (com uma conta só, é ela)
      const ativas = contasAtivas(); let conta = ativas[0]?.id;
      if(ativas.length>1){
        const r = await ask({titulo:'Pagou com qual conta?', texto:`Fatura de ${mLabel(d.m)} do ${esc(k.nome)}. O valor sai do saldo dessa conta.`, botoes:ativas.map(c=>({id:c.id, rotulo:c.nome}))});
        if(!r) return; conta = r.botao;
      }
      pagas.add(d.m);
      if(conta) (k.pagtos ||= {})[d.m] = {conta, data:todayISO(), ts:Date.now()};
    }
    if(pagas.size) k.pagas = [...pagas].sort().slice(-24); else delete k.pagas;
    save(); toast(era ? 'Fatura volta a ficar em aberto' : 'Fatura marcada como paga ✓'); render();
  },
  dMeio(d){ ui.draft.meio=d.id; if(d.id!=='cartao') ui.draft.parcelado=false; keepDraft(); },
  dParc(d){ ui.draft.parcelado = d.v==='1'; keepDraft(); },
  dCartao(d){ ui.draft.cartao=d.id; keepDraft(); },

  saveG(){
    const v = parseNum($('#gValor').value);
    if(!(v>0)) return toast('Digite um valor');
    const data = $('#gData').value || todayISO();
    const desc = $('#gDesc').value.trim().slice(0,80);
    const d = ui.draft;
    if(ui.editG){
      const lista = ui.editG.k==='gasto' ? S.gastos : S.entradas;
      const x = lista.find(i=>i.id===ui.editG.id);
      if(x){
        Object.assign(x, {valor:round2(v), data, desc});
        if(ui.editG.k==='gasto'){ Object.assign(x, {cat:d.cat, meio:d.meio}); if(d.meio==='cartao') x.cartao = d.cartao; else delete x.cartao; }
        if(d.conta && (ui.editG.k==='entrada' || d.meio!=='cartao')) x.conta = d.conta; else delete x.conta;
      }
      ui.editG = null; ui.tab = 'inicio';
      save(); toast('Alterações salvas ✓');
    } else if(d.tipo==='entrada'){
      const e = {id:uid(), data, valor:round2(v), desc, criado:Date.now()}; if(d.conta) e.conta = d.conta;
      S.entradas.push(e);
      save(); toast('Entrada salva ✓');
    } else if(d.meio==='cartao' && d.parcelado){
      const n = parseInt($('#gParc')?.value,10);
      if(!(n>=2)) return toast('Informe o número de parcelas');
      // o valor digitado é o de cada parcela
      S.recorrentes.push({id:uid(), nome:desc||catOf(d.cat).n, valor:round2(v), tipo:'parcela', parcelas:n, meio:'cartao', cartao:d.cartao, inicio:faturaMonth(data, cartaoOf(d.cartao)), cat:d.cat});
      save(); toast(`${n}x de ${fmtReal(v)} (total ${fmtReal(v*n)}) — está em Fixos`);
    } else {
      const g = {id:uid(), data, valor:round2(v), cat:d.cat, meio:d.meio, desc, criado:Date.now()};
      if(d.meio==='cartao') g.cartao = d.cartao; else if(d.conta) g.conta = d.conta;
      S.gastos.push(g);
      save(); toast('Gasto salvo ✓');
    }
    d.parcelado = false; d.catManual = false;
    render();
  },
  verFatura(d){ abrirJanela({tipo:'fatura', id:d.id, m:d.m}, vFatura(d.id, d.m)); },
  fecharDlg(){ const dlg = $('#dlg'); if(dlg.open) dlg.close(); },
  irFixo(d){ A.fecharDlg(); ui.tab = 'fixos'; ui.abertos.add('addR'); A.editR(d); },
  editL(d){
    if($('#dlg').open) $('#dlg').close();   // veio da lista da fatura
    const x = (d.k==='gasto' ? S.gastos : S.entradas).find(i=>i.id===d.id); if(!x) return;
    ui.editG = {k:d.k, id:d.id};
    if(d.k==='gasto'){ ui.draft.cat = x.cat; ui.draft.meio = x.meio; if(x.cartao) ui.draft.cartao = x.cartao; }
    if(x.conta) ui.draft.conta = x.conta;
    ui.tab = 'lancar'; render();
  },
  cancelG(){ ui.editG=null; ui.tab='inicio'; render(); },
  // apaga na hora; o aviso traz "Desfazer" por alguns segundos
  delL(d){
    const lista = d.k==='gasto' ? S.gastos : S.entradas, i = lista.findIndex(x=>x.id===d.id); if(i<0) return;
    const [x] = lista.splice(i, 1);
    save(); render();
    toast(d.k==='gasto' ? 'Gasto apagado' : 'Entrada apagada', {rotulo:'Desfazer', fn:()=>{
      const l = d.k==='gasto' ? S.gastos : S.entradas;
      if(!l.some(y=>y.id===x.id)) l.splice(Math.min(i, l.length), 0, x);
      save(); render(); toast('Voltou ✓');
    }});
  },
  repG(d){
    const g = S.gastos.find(x=>x.id===d.id); if(!g) return;
    Object.assign(ui.draft, {tipo:'gasto', cat:g.cat, meio:g.meio, parcelado:false});
    if(g.cartao && cartoesAtivos().some(k=>k.id===g.cartao)) ui.draft.cartao = g.cartao;
    render();
    $('#gValor').value = valIn(g.valor); $('#gDesc').value = g.desc;
    toast('Confira a data e toque em Salvar');
  },

  editR(d){ ui.editId=d.id; render(); setTimeout(()=>$('#rNome').scrollIntoView({behavior:'smooth',block:'center'}),50); },
  cancelR(){ ui.editId=null; ui.abertos.delete('addR'); render(); },
  saveR(){
    const nome=$('#rNome').value.trim().slice(0,80), valor=parseNum($('#rValor').value), tipo=$('#rTipo').value, parcelas=parseInt($('#rParc').value,10);
    const inicio = $('#rIni').value || thisMonth(), fim = $('#rFim').value || null;
    if(!nome) return toast('Dê um nome');
    if(!(valor>=0)) return toast('Valor inválido');
    if(tipo==='parcela' && !(parcelas>=2)) return toast('Informe o nº de parcelas');
    if(fim && diffM(inicio, fim) < 0) return toast('O último mês não pode ser antes do início');
    const obj = {nome, valor:round2(valor), tipo, meio:$('#rMeio').value, inicio, cat:$('#rCat').value};
    if(tipo==='parcela') obj.parcelas = parcelas;
    if(obj.meio!=='cartao'){ const dia = parseInt($('#rDia')?.value, 10); if(dia>=1 && dia<=31) obj.dia = dia; if($('#rConta')) obj.conta = $('#rConta').value; }
    if(obj.meio==='cartao') obj.cartao = $('#rCartao')?.value || (ui.editId && S.recorrentes.find(x=>x.id===ui.editId)?.cartao) || cartoesAtivos()[0].id;
    const r = ui.editId && S.recorrentes.find(x=>x.id===ui.editId);
    const vig = $('#rVig')?.value;
    if(r && r.tipo==='fixo' && tipo==='fixo' && obj.valor!==r.valor && vig && diffM(inicio, vig) > 0){
      // reajuste: o valor antigo fica até o mês anterior; o novo vale a partir de `vig`
      if(fim && diffM(vig, fim) < 0) return toast('O último mês não pode ser antes do reajuste');
      Object.assign(r, {...obj, valor:r.valor, fim:addM(vig,-1)});
      const novo = {id:uid(), ...obj, inicio:vig}; if(fim) novo.fim = fim;
      S.recorrentes.push(novo);
      toast(`Reajuste salvo: ${fmt(obj.valor)} a partir de ${mLabel(vig)}`);
    } else if(r){
      Object.assign(r, obj); if(tipo==='fixo') delete r.parcelas; if(obj.meio!=='cartao') delete r.cartao; else { delete r.dia; delete r.conta; }
      if(obj.meio!=='cartao' && !obj.dia) delete r.dia;
      if(fim) r.fim = fim; else delete r.fim;
      toast('Salvo ✓');
    } else {
      const n = {id:uid(), ...obj}; if(fim) n.fim = fim;
      S.recorrentes.push(n); toast('Salvo ✓');
    }
    if(ui.editId) ui.abertos.delete('addR');   // terminou a edição: o formulário volta a ficar recolhido
    ui.editId=null; save(); render();
  },
  // encerrar: continua nos meses passados e sai a partir do próximo
  endR(d){
    const r = S.recorrentes.find(x=>x.id===d.id); if(!r) return;
    const hoje = thisMonth();
    if(diffM(r.inicio, hoje) < 0){   // ainda nem começou: não há histórico a preservar
      if(!confirm(`Apagar "${r.nome}"? Ele ainda não começou.`)) return;
      S.recorrentes = S.recorrentes.filter(x=>x.id!==r.id);
    } else {
      if(!confirm(`Encerrar "${r.nome}"?\n\nEle continua contando até ${mLabel(hoje)} e sai a partir do mês que vem.`)) return;
      r.fim = hoje;
    }
    if(ui.editId===r.id) ui.editId=null;
    save(); toast('Encerrado ✓'); render();
  },
  delR(d){
    if(!confirm('Apagar de vez?\n\nEle some também dos meses passados — a sobra e a fatura desses meses vão mudar. Para só parar de contar daqui pra frente, use Encerrar.')) return;
    S.recorrentes = S.recorrentes.filter(r=>r.id!==d.id); if(ui.editId===d.id) ui.editId=null; save(); render();
  },

  saveM(){ const nome=$('#mNome').value.trim().slice(0,80), alvo=parseNum($('#mAlvo').value); if(!nome||!(alvo>0)) return toast('Preencha nome e valor'); S.metas.push({id:uid(),nome,alvo:round2(alvo),atual:0,movs:[]}); save(); render(); },
  // remover meta: some da lista, mas o que foi guardado continua contando nos meses em que foi guardado
  arqM(d){
    const m = S.metas.find(x=>x.id===d.id); if(!m) return;
    if(!confirm(`Remover a meta "${m.nome}"?\n\nO que você guardou nela continua registrado nos meses em que guardou.`)) return;
    m.arquivada = true; save(); render();
  },
  async movM(d){
    const m = S.metas.find(x=>x.id===d.id), s = Number(d.s); if(!m) return;
    const r = await ask({titulo: s>0 ? `Guardar em "${m.nome}"` : `Retirar de "${m.nome}"`,
      texto: s>0 ? 'Esse valor sai da sobra deste mês.' : 'Esse valor volta para a sobra deste mês.',
      campos:[{id:'v', rotulo:'Valor', inputmode:'decimal', placeholder:'0,00'}],
      botoes:[{id:'ok', rotulo: s>0 ? 'Guardar' : 'Retirar'}],
      validar:(b,v)=> parseNum(v.v)>0 ? '' : 'Digite um valor'});
    if(!r) return;
    const novo = round2(Math.max(0, m.atual + s*parseNum(r.valores.v))), delta = round2(novo - m.atual);
    if(!delta) return toast('A meta já está zerada');
    m.atual = novo; (m.movs ||= []).push({data:todayISO(), valor:delta});
    save(); toast(s>0?'Boa! 💪':'Retirada registrada'); render();
  },
  /* contas bancárias */
  dConta(d){ ui.draft.conta = d.id; keepDraft(); },
  novaConta(){ ui.tab = 'ajustes'; ui.contaEd = 'novo'; ui.abertos.add('contas'); render(); $('#cNome')?.focus(); },
  edConta(d){ ui.contaEd = d.id; render(); $('#cNome')?.focus(); },
  cancelConta(){ ui.contaEd = null; render(); },
  salvarConta(){
    const nome = $('#cNome').value.trim().slice(0,40), saldo = parseNum($('#cSaldo').value || '0');
    if(!nome) return toast('Dê um nome à conta');
    if(!Number.isFinite(saldo)) return toast('Confira o saldo');
    const marco = {saldo:round2(saldo), desde:todayISO(), desdeTs:Date.now()};   // saldo de agora: daqui pra frente o app atualiza
    if(ui.contaEd==='novo'){ (S.contas ||= []).push({id:'c'+uid(), nome, ...marco}); toast('Conta adicionada ✓'); }
    else{
      const c = S.contas.find(x=>x.id===ui.contaEd); if(!c) return;
      const mudouSaldo = round2(saldo)!==round2(saldoConta(c));
      c.nome = nome; if(mudouSaldo) Object.assign(c, marco);
      toast('Conta salva ✓');
    }
    ui.contaEd = null; save(); render();
  },
  delConta(d){
    const c = S.contas.find(x=>x.id===d.id); if(!c) return;
    c.arquivada = true; ui.contaEd = null; save(); render();
    toast(`"${c.nome}" removida`, {rotulo:'Desfazer', fn:()=>{ delete c.arquivada; save(); render(); }});
  },
  verConta(d){ abrirJanela({tipo:'conta', id:d.id}, vExtrato(d.id)); },
  async corrigirSaldo(d){
    const c = S.contas.find(x=>x.id===d.id); if(!c) return;
    const r = await ask({titulo:`Saldo de "${c.nome}"`, texto:`Veja no app do banco quanto tem agora. O app mostra ${fmtReal(saldoConta(c))}.`,
      campos:[{id:'v', rotulo:'Saldo de agora', inputmode:'decimal', placeholder:valIn(round2(saldoConta(c)))||'0,00'}],
      botoes:[{id:'ok', rotulo:'Corrigir'}], validar:(b,v)=> Number.isFinite(parseNum(v.v)) ? '' : 'Digite o saldo'});
    if(!r) return;
    Object.assign(c, {saldo:round2(parseNum(r.valores.v)), desde:todayISO(), desdeTs:Date.now()});
    save(); toast('Saldo corrigido ✓'); render();
  },

  /* investimentos */
  invEd(d){ ui.invEd = ui.invEd===d.id ? null : d.id; render(); },
  invTipo(d){ ui.invNovoTipo = d.v; keepInv(); },
  invJa(d){ ui.invNovoJa = d.v==='1'; keepInv(); },
  saveInv(){
    const nome = $('#iNome').value.trim().slice(0,60), saldo = parseNum($('#iSaldo').value || '0');
    if(!nome) return toast('Dê um nome ao investimento');
    if(!(saldo>=0)) return toast('Confira o valor');
    const inv = {id:'i'+uid(), nome, tipo:ui.invNovoTipo, saldo:round2(saldo), movs:[]};
    if(!ui.invNovoJa && saldo>0) inv.movs.push({data:todayISO(), valor:round2(saldo)});   // aplicação de agora: sai da sobra
    S.investimentos.push(inv);
    ui.invNovoJa = true; ui.invEd = null; ui.abertos.delete('novoInv');
    save(); toast('Investimento adicionado ✓'); render();
  },
  async invMov(d){
    const i = S.investimentos.find(x=>x.id===d.id), s = Number(d.s); if(!i) return;
    const r = await ask({titulo: s>0 ? `Aplicar em "${i.nome}"` : `Resgatar de "${i.nome}"`,
      texto: s>0 ? 'Esse valor sai da sobra deste mês.' : 'Esse valor volta para a sobra deste mês.',
      campos:[{id:'v', rotulo:'Valor', inputmode:'decimal', placeholder:'0,00'}],
      botoes:[{id:'ok', rotulo: s>0 ? 'Aplicar' : 'Resgatar'}],
      validar:(b,v)=>{ const n = parseNum(v.v); return !(n>0) ? 'Digite um valor' : s<0 && n>i.saldo+0.004 ? `O saldo é ${fmtReal(i.saldo)}` : ''; }});
    if(!r) return;
    const v = round2(parseNum(r.valores.v)) * s;
    i.saldo = round2(Math.max(0, i.saldo + v)); i.movs.push({data:todayISO(), valor:v});
    save(); toast(s>0 ? 'Aplicação registrada ✓' : 'Resgate registrado ✓'); render();
  },
  async invSaldo(d){
    const i = S.investimentos.find(x=>x.id===d.id); if(!i) return;
    const r = await ask({titulo:`Saldo de "${i.nome}"`, texto:`Veja no app do banco quanto tem hoje. A diferença para ${fmtReal(i.saldo)} entra como rendimento e não mexe na sobra.`,
      campos:[{id:'v', rotulo:'Saldo hoje', inputmode:'decimal', placeholder:valIn(i.saldo)||'0,00'}],
      botoes:[{id:'ok', rotulo:'Atualizar'}],
      validar:(b,v)=> parseNum(v.v)>=0 ? '' : 'Digite o saldo'});
    if(!r) return;
    const novo = round2(parseNum(r.valores.v)), delta = round2(novo - i.saldo);
    if(!delta) return toast('Saldo igual ao anterior');
    i.saldo = novo; i.movs.push({data:todayISO(), valor:delta, rend:true});
    save(); toast(delta>0 ? `Rendeu ${fmtReal(delta)} ✓` : `Caiu ${fmtReal(-delta)}`); render();
  },
  // remover: sai da lista, mas aplicações e resgates continuam contando nos meses em que aconteceram
  invArq(d){
    const i = S.investimentos.find(x=>x.id===d.id); if(!i) return;
    i.arquivado = true; ui.invEd = null; save(); render();
    toast(`"${i.nome}" removido`, {rotulo:'Desfazer', fn:()=>{ delete i.arquivado; save(); render(); }});
  },

  saveLim(){ document.querySelectorAll('[data-lim]').forEach(i=>{ const v=parseNum(i.value); if(v>0) S.limites[i.dataset.lim]=round2(v); else delete S.limites[i.dataset.lim]; }); save(); toast('Limites salvos ✓'); },

  saveCats(){ lerCats(); save(); toast('Categorias salvas ✓'); render(); },
  addCat(){
    const n = $('#nCat').value.trim().slice(0,40); if(!n) return toast('Digite o nome da categoria');
    lerCats();
    S.cats.push({id:'c'+uid(), n, c:$('#nCatC').value.toLowerCase()});
    save(); toast('Categoria criada ✓'); render();
  },
  // tirar das opções: os lançamentos continuam na categoria, e ela volta com um toque
  escCat(d){
    const k = S.cats.find(c=>c.id===d.id); if(!k || k.id==='outros') return;
    lerCats();
    k.oculta = true;
    if(ui.draft.cat===k.id) ui.draft.cat = null;
    save(); toast(`"${k.n}" saiu das opções`); render();
  },
  voltaCat(d){
    lerCats();
    const k = S.cats.find(c=>c.id===d.id), padrao = CATS.find(c=>c.id===d.id);
    if(k) delete k.oculta; else if(padrao) S.cats.push({...padrao}); else return;
    save(); toast(`"${(k||padrao).n}" voltou ✓`); render();
  },

  saveCfg(){
    const r=parseNum($('#cRenda').value||'0');
    if(!(r>=0)) return toast('Confira o valor da renda');
    const dia = parseInt($('#cDia')?.value, 10);
    Object.assign(S.config,{renda:round2(r), configurado:true, diaRenda: dia>=1 && dia<=31 ? dia : 5});
    if($('#cConta')) S.config.contaRenda = $('#cConta').value;
    save(); toast('Renda salva ✓');
  },

  edCartao(d){
    const k = S.cartoes.find(x=>x.id===d.id);
    const usadas = S.cartoes.map(x=>x.cor);
    ui.cartaoEd = d.id;
    ui.cartaoCor = k?.cor || CORES_CARTAO.find(c=>!usadas.includes(c)) || CORES_CARTAO[S.cartoes.length % CORES_CARTAO.length];
    render(); $('#kNome')?.focus();
  },
  cancelCartao(){ ui.cartaoEd = null; render(); },
  // escolher a cor só atualiza a tela, para não perder o que já foi digitado
  corCartao(d){
    if(!CORES_CARTAO.includes(d.v)) return;
    ui.cartaoCor = d.v;
    document.querySelectorAll('[data-act="corCartao"]').forEach(b=>{ const on = b.dataset.v===d.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const m = $('#kMini'); if(m) m.className = 'mini cc-' + d.v;
  },
  salvarCartao(){
    const nome = $('#kNome').value.trim().slice(0,40), F = dia($('#kF').value), V = dia($('#kV').value);
    if(!nome) return toast('Digite o nome do cartão');
    if(!F || !V) return toast('Confira os dias que a fatura fecha e vence (de 1 a 31)');
    if(ui.cartaoEd==='novo'){
      S.cartoes.push({id:'k'+uid(), nome, fechamento:F, vencimento:V, cor:ui.cartaoCor});
      toast('Cartão adicionado ✓');
    } else {
      const k = S.cartoes.find(x=>x.id===ui.cartaoEd); if(!k) return;
      Object.assign(k, {nome, fechamento:F, vencimento:V, cor:ui.cartaoCor});
      toast('Cartão salvo ✓');
    }
    ui.cartaoEd = null; S.config.configurado = true; save(); render();
  },
  // remover: com lançamentos, o cartão só sai das opções e continua nas faturas passadas e nas parcelas em andamento
  delCartao(d){
    const k = S.cartoes.find(x=>x.id===d.id); if(!k) return;
    if(cartoesAtivos().length<=1) return toast('Precisa ter pelo menos um cartão');
    const usos = S.gastos.filter(g=>g.cartao===k.id).length + S.recorrentes.filter(r=>r.cartao===k.id).length;
    if(usos){
      if(!confirm(`Remover o cartão "${k.nome}"?\n\nEle sai das opções, mas os ${usos} lançamento(s) e parcelas dele continuam nas faturas.`)) return;
      k.arquivado = true;
    } else {
      if(!confirm(`Remover o cartão "${k.nome}"?`)) return;
      S.cartoes = S.cartoes.filter(x=>x.id!==k.id);
    }
    ui.cartaoEd = null;
    if(ui.draft.cartao===k.id) ui.draft.cartao = null;
    save(); toast('Cartão removido'); render();
  },
  async export(){
    const r = await ask({titulo:'Exportar backup',
      texto:'Proteja o arquivo com uma senha: ele vai parar em Downloads, e-mail ou WhatsApp, e sem senha quem abrir vê todas as suas finanças. <b>Se esquecer a senha, o backup não abre.</b>',
      campos:[{id:'s1', rotulo:'Senha', tipo:'password'}, {id:'s2', rotulo:'Repita a senha', tipo:'password'}],
      botoes:[{id:'com', rotulo:'Exportar com senha'}, {id:'sem', rotulo:'Exportar sem senha'}],
      validar:(b,v)=> b==='sem' ? '' : v.s1.length<6 ? 'Use pelo menos 6 caracteres' : v.s1!==v.s2 ? 'As senhas não conferem' : ''});
    if(!r) return;
    S.config.ultimoBackup = todayISO();
    let texto = JSON.stringify(S, null, 2);
    if(r.botao==='com'){ toast('Protegendo o backup…'); texto = await cifrar(texto, r.valores.s1); }
    download(texto, `meu-caixa-backup-${todayISO()}${r.botao==='com'?'-protegido':''}.json`);
    save(); render();
  },
  pickJson(){ $('#fileJson').click(); },
  pickCsv(){ $('#fileCsv').click(); },
  reset(){ if(!confirm(nuvem.sessao() ? 'Apagar TODOS os seus dados, neste aparelho e na sua conta? Exporte um backup antes se quiser guardar.' : 'Apagar TODOS os dados deste aparelho? Exporte um backup antes se quiser guardar.')) return; setS(empty()); ui.tab='inicio'; render(); },

  /* conta */
  authTela(d){ const e = $('#aEmail')?.value; ui.tela = d.v; render(); if(e && $('#aEmail')) $('#aEmail').value = e; $('#view input')?.focus(); },
  authSemConta(){ nuvem.usarSemConta(true); ui.tela = null; ui.tab = 'inicio'; render(); },
  contaEntrar(){ nuvem.usarSemConta(false); ui.tela = 'entrar'; render(); },
  async authEntrar(){
    const email = $('#aEmail').value.trim(), senha = $('#aSenha').value;
    if(!email || !senha) return erroAuth('Preencha e-mail e senha');
    await ocupado('Entrando…', async()=>{ await nuvem.entrar(email, senha); await depoisDeEntrar(); });
  },
  async authCriar(){
    const nome = $('#aNome').value.trim().slice(0,40), email = $('#aEmail').value.trim(), s1 = $('#aSenha').value, s2 = $('#aSenha2').value;
    if(!email) return erroAuth('Digite seu e-mail');
    if(s1.length<6) return erroAuth('A senha precisa ter pelo menos 6 caracteres');
    if(s1!==s2) return erroAuth('As senhas não conferem');
    await ocupado('Criando…', async()=>{
      const s = await nuvem.criarConta(nome, email, s1);
      if(s) return depoisDeEntrar();
      ui.tela = 'aviso'; ui.authMsg = `Enviamos um link de confirmação para <b>${esc(email)}</b>. Abra o e-mail e toque no link para entrar. Se não chegar, veja a caixa de spam.`; render();
    });
  },
  async authEsqueci(){
    const email = $('#aEmail').value.trim(); if(!email) return erroAuth('Digite seu e-mail');
    await ocupado('Enviando…', async()=>{
      await nuvem.esqueciSenha(email);
      ui.tela = 'aviso'; ui.authMsg = `Se existir uma conta com <b>${esc(email)}</b>, enviamos um link para criar uma senha nova. Abra o e-mail e toque no link.`; render();
    });
  },
  async authNovaSenha(){
    const s1 = $('#aSenha').value, s2 = $('#aSenha2').value;
    if(s1.length<6) return erroAuth('A senha precisa ter pelo menos 6 caracteres');
    if(s1!==s2) return erroAuth('As senhas não conferem');
    await ocupado('Salvando…', async()=>{ await nuvem.novaSenha(s1); toast('Senha nova salva ✓'); await depoisDeEntrar(); });
  },
  async syncAgora(){ await nuvem.sincronizar(); toast(statusTexto()); },
  async sairConta(){
    await nuvem.sincronizar();
    const aviso = nuvem.pendente()
      ? 'Há alterações que ainda não foram para a nuvem (sem internet). Se sair agora, elas se perdem. Sair mesmo assim?'
      : 'Sair da conta?\n\nOs dados saem deste aparelho, mas continuam na sua conta. É só entrar de novo para ver tudo.';
    if(!confirm(aviso)) return;
    await nuvem.sair();
    trocaS(empty()); ui.tela = 'entrar'; ui.tab = 'inicio'; render();
  }
};

// janela de fatura/extrato: fica atualizada enquanto aberta (ui.dlg) e some do estado ao fechar
function abrirJanela(qual, html){
  const dlg = $('#dlg'); ui.dlg = qual; dlg.innerHTML = html;
  dlg.onclick = dlg.onkeydown = dlg.oncancel = null;
  dlg.onclose = ()=>{ ui.dlg = null; dlg.onclose = null; };
  if(!dlg.open) dlg.showModal();
}

/* ---------- ajudantes da conta ---------- */
function erroAuth(msg){ const p = $('.auth-erro'); if(!p) return toast(msg); p.textContent = msg; p.hidden = false; }
// desativa o botão enquanto fala com o servidor e mostra o erro na tela
async function ocupado(rotulo, fn){
  const b = document.querySelector('.auth-box .btn'), antes = b?.textContent;
  if(b){ b.disabled = true; b.textContent = rotulo; }
  try{ await fn(); }
  catch(e){ if(b?.isConnected){ b.disabled = false; b.textContent = antes; } erroAuth(e.message || 'Algo deu errado. Tente de novo.'); }
}
// depois de entrar: decide entre os dados do aparelho e os da nuvem, e abre o app
export async function depoisDeEntrar(){
  await nuvem.primeiraSincronizacao(async r=>{
    const quando = new Date(r.nuvem.quando).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    const desc = x => `${x.gastos} gastos, ${x.entradas} entradas e ${x.fixos} fixos`;
    const esc2 = await ask({titulo:'Qual versão dos dados vale?',
      texto:`Este aparelho e a sua conta têm dados diferentes.<br><br><b>Na conta</b> (atualizado em ${quando}): ${desc(r.nuvem)}.<br><b>Neste aparelho:</b> ${desc(r.aparelho)}.<br><br>A outra versão fica guardada como cópia neste aparelho.`,
      botoes:[{id:'nuvem', rotulo:'Usar os da conta'}, {id:'aparelho', rotulo:'Usar os deste aparelho'}], cancelar:'Usar os da conta'});
    return esc2?.botao==='aparelho' ? 'aparelho' : 'nuvem';
  });
  ui.tela = null; ui.tab = 'inicio'; render();
  const s = nuvem.sessao(); toast(s?.user.nome ? `Olá, ${s.user.nome}!` : 'Pronto, você entrou ✓');
}

function keepInv(){ // re-renderiza o formulário de novo investimento sem perder o que foi digitado
  const n = $('#iNome')?.value, v = $('#iSaldo')?.value;
  render();
  if(n) $('#iNome').value = n; if(v) $('#iSaldo').value = v;
}

function keepDraft(){ // re-renderiza mantendo o que já foi digitado
  const keep={v:$('#gValor')?.value, d:$('#gData')?.value, s:$('#gDesc')?.value, p:$('#gParc')?.value};
  render();
  if(keep.v) $('#gValor').value=keep.v; if(keep.d) $('#gData').value=keep.d; if(keep.s) $('#gDesc').value=keep.s; if(keep.p&&$('#gParc')) $('#gParc').value=keep.p;
  totalParcelado();
}
