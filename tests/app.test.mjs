// Testes de ponta a ponta no navegador (Edge ou Chrome instalados): `npm test`
// Sobe um servidor local que imita o GitHub Pages (subpasta + redirecionamento de .html).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PREFIX = '/finance-mortati';
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
let swOverride = null, server, BASE, browser;

before(async()=>{
  server = http.createServer((req,res)=>{
    let p = decodeURIComponent(req.url.split('?')[0]);
    if(!p.startsWith(PREFIX)){ res.writeHead(404); return res.end(); }
    p = p.slice(PREFIX.length) || '/';
    if(p.endsWith('.html')){ res.writeHead(301, {location: PREFIX + p.slice(0,-5)}); return res.end(); }
    if(p.endsWith('/') || p==='/index') p = (p==='/index' ? '/' : p) + 'index.html';
    if(p==='/sw.js' && swOverride){ res.writeHead(200, {'content-type':MIME['.js'], 'cache-control':'no-cache'}); return res.end(swOverride); }
    fs.readFile(path.join(ROOT, p), (err,buf)=>{
      if(err){ res.writeHead(404); return res.end(); }
      res.writeHead(200, {'content-type':MIME[path.extname(p)]||'application/octet-stream', 'cache-control':'no-cache'}); res.end(buf);
    });
  }).listen(0);
  BASE = `http://localhost:${server.address().port}${PREFIX}/`;
  browser = await chromium.launch({channel: process.env.BROWSER || 'msedge'});
});
after(async()=>{ await browser?.close(); server?.close(); });

/* ---------- ajudantes ---------- */
const pad = n => String(n).padStart(2,'0');
const now = new Date();
const ym = (d=0) => { const x = new Date(now.getFullYear(), now.getMonth()+d, 1); return x.getFullYear()+'-'+pad(x.getMonth()+1); };
const iso = (dDias=0) => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate()+dDias); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
const brl = v => v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

function estado(extra={}){
  return {v:2, config:{renda:1000, fechamento:5, vencimento:12, configurado:true, ultimoBackup:iso(0)},
    cats:[{id:'mercado',n:'Mercado',c:'#22c55e'},{id:'saude',n:'Saúde',c:'#14b8a6'},{id:'delivery',n:'Delivery',c:'#ef4444'},{id:'outros',n:'Outros',c:'#94a3b8'}],
    gastos:[], entradas:[], recorrentes:[], metas:[], limites:{}, ...extra};
}

async function abrir(state, {sw=false, ua, viewport={width:390,height:844}} = {}){
  const ctx = await browser.newContext({viewport, serviceWorkers: sw?'allow':'block', acceptDownloads:true, userAgent:ua});
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('dialog', d=>d.accept());
  ctx.on('request', r=>requests.push(r.url()));
  await page.goto(BASE);
  await page.evaluate(s=>{ localStorage.clear(); if(s) localStorage.setItem('meucaixa.v1', JSON.stringify(s)); }, state ?? null);
  await page.reload(); await page.waitForSelector('#view .card');
  return {ctx, page, errors, requests};
}
const lerEstado = page => page.evaluate(()=>JSON.parse(localStorage.getItem('meucaixa.v1')));
const calc = (page, k) => page.evaluate(async k=>{ const {calc} = await import('./js/finance.js'); const c = calc(k); return {sobra:c.sobra, fatura:c.fatura, fixosFora:c.fixosFora, guardado:c.guardado, entradas:c.entradas, saidas:c.saidas}; }, k);
const aba = (page, t) => page.click(`nav [data-t="${t}"]`);
const toastTxt = page => page.textContent('#toast');

/* ---------- testes ---------- */
test('começa vazio, sem dados de exemplo', async()=>{
  const {page, ctx} = await abrir(null);
  const s = await lerEstado(page);
  assert.equal(s.gastos.length + s.recorrentes.length + s.metas.length + s.entradas.length, 0);
  assert.equal(s.config.renda, 0);
  assert.ok(await page.isVisible('.banner'));
  await ctx.close();
});

test('migra dados da versão 1 e guarda uma cópia do original', async()=>{
  const v1 = {v:1, config:{renda:3000, fechamento:3, vencimento:10, configurado:true},
    gastos:[{id:'g1', data:iso(0), valor:50, cat:'mercado', meio:'pix', desc:'x', criado:1}],
    recorrentes:[{id:'r1', nome:'Academia', valor:100, tipo:'fixo', meio:'pix', inicio:ym(-2), cat:'saude'}],
    metas:[{id:'m1', nome:'Reserva', alvo:1000, atual:200}], limites:{mercado:300}};
  const {page, ctx, errors} = await abrir(v1);
  const s = await lerEstado(page);
  assert.equal(s.v, 2);
  assert.ok(s.cats.length >= 12, 'categorias padrão');
  assert.deepEqual(s.entradas, []);
  assert.deepEqual(s.metas[0].movs, []);
  assert.equal(s.gastos[0].valor, 50);
  const keys = await page.evaluate(()=>Object.keys(localStorage));
  const copia = keys.find(k=>k.startsWith('meucaixa.v1.copia-'));
  assert.ok(copia, 'cópia guardada');
  assert.deepEqual(JSON.parse(await page.evaluate(k=>localStorage.getItem(k), copia)), v1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('período da fatura bate com a fatura de cada compra, inclusive fechamento no dia 1 e 31', async()=>{
  const {page, ctx} = await abrir(estado());
  const erros = await page.evaluate(async()=>{
    const {S} = await import('./js/store.js'); const {faturaMonth, faturaPeriodo} = await import('./js/finance.js');
    const out = [];
    for(const [F,V] of [[1,10],[5,12],[25,5],[31,10],[28,28],[30,2]]){
      S.config.fechamento = F; S.config.vencimento = V;
      for(let t = Date.UTC(2025,0,1); t < Date.UTC(2027,0,1); t += 864e5){
        const d = new Date(t).toISOString().slice(0,10), k = faturaMonth(d), p = faturaPeriodo(k);
        if(d < p.ini || d > p.fim) out.push(`F${F} V${V} ${d} -> ${k} [${p.ini}..${p.fim}]`);
      }
    }
    return out;
  });
  assert.deepEqual(erros.slice(0,5), []);
  await page.evaluate(async()=>{ const {S, save} = await import('./js/store.js'); S.config.fechamento = 1; save(); });
  await page.reload(); await page.waitForSelector('#view .card');
  assert.doesNotMatch(await page.textContent('#view'), /dia 0/);
  await ctx.close();
});

test('lança gasto e entrada; a sobra soma as entradas', async()=>{
  const {page, ctx} = await abrir(estado());
  await aba(page,'lancar');
  await page.click('[data-act="dTipo"][data-v="entrada"]');
  await page.fill('#gValor','500'); await page.fill('#gDesc','freela'); await page.click('[data-act="saveG"]');
  await aba(page,'lancar');
  await page.click('[data-act="dTipo"][data-v="gasto"]');
  await page.click('[data-act="dMeio"][data-id="pix"]');
  await page.fill('#gValor','100,50'); await page.click('[data-act="saveG"]');
  const s = await lerEstado(page);
  assert.equal(s.entradas.length, 1); assert.equal(s.entradas[0].valor, 500);
  assert.equal(s.gastos.length, 1); assert.equal(s.gastos[0].valor, 100.5);
  assert.equal((await calc(page, ym(0))).sobra, 1000 + 500 - 100.5);
  await aba(page,'inicio');
  assert.equal((await page.textContent('.big')).replace(/\s/g,' '), brl(1399.5).replace(/\s/g,' '));
  assert.match(await page.textContent('#lista'), /freela/);
  await ctx.close();
});

test('edita um lançamento sem duplicar', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:80, cat:'mercado', meio:'pix', desc:'feira', criado:1}]}));
  await page.click('[data-act="editL"][data-id="g1"]');
  assert.equal(await page.inputValue('#gValor'), '80');
  await page.fill('#gValor','95'); await page.click('[data-act="dCat"][data-id="saude"]'); await page.click('[data-act="saveG"]');
  const s = await lerEstado(page);
  assert.equal(s.gastos.length, 1);
  assert.deepEqual([s.gastos[0].valor, s.gastos[0].cat, s.gastos[0].desc], [95, 'saude', 'feira']);
  await ctx.close();
});

test('encerrar um fixo mantém os meses passados', async()=>{
  const {page, ctx} = await abrir(estado({recorrentes:[{id:'r1', nome:'Academia', valor:100, tipo:'fixo', meio:'pix', inicio:ym(-3), cat:'saude'}]}));
  await aba(page,'fixos'); await page.click('[data-act="endR"][data-id="r1"]');
  assert.equal((await lerEstado(page)).recorrentes[0].fim, ym(0));
  assert.equal((await calc(page, ym(-2))).fixosFora, 100);
  assert.equal((await calc(page, ym(0))).fixosFora, 100);
  assert.equal((await calc(page, ym(1))).fixosFora, 0);
  await ctx.close();
});

test('reajuste de fixo: valor antigo nos meses anteriores, novo daqui pra frente', async()=>{
  const {page, ctx} = await abrir(estado({recorrentes:[{id:'r1', nome:'Plano', valor:300, tipo:'fixo', meio:'boleto', inicio:ym(-6), cat:'saude'}]}));
  await aba(page,'fixos'); await page.click('[data-act="editR"][data-id="r1"]');
  await page.fill('#rValor','350'); await page.fill('#rVig', ym(1)); await page.click('[data-act="saveR"]');
  const s = await lerEstado(page);
  assert.equal(s.recorrentes.length, 2);
  assert.equal((await calc(page, ym(-1))).fixosFora, 300);
  assert.equal((await calc(page, ym(0))).fixosFora, 300);
  assert.equal((await calc(page, ym(1))).fixosFora, 350);
  assert.equal((await calc(page, ym(5))).fixosFora, 350);
  await ctx.close();
});

test('apagar de vez remove também do histórico', async()=>{
  const {page, ctx} = await abrir(estado({recorrentes:[{id:'r1', nome:'Erro', valor:50, tipo:'fixo', meio:'pix', inicio:ym(-4), fim:ym(-1), cat:'outros'}]}));
  await aba(page,'fixos');
  assert.match(await page.textContent('#view'), /Encerrados \(1\)/);
  await page.click('[data-act="delR"][data-id="r1"]');
  assert.equal((await lerEstado(page)).recorrentes.length, 0);
  assert.equal((await calc(page, ym(-2))).fixosFora, 0);
  await ctx.close();
});

test('metas: guardar sai da sobra; remover a meta mantém o histórico', async()=>{
  const {page, ctx} = await abrir(estado({metas:[{id:'m1', nome:'Reserva', alvo:1000, atual:0, movs:[]}]}));
  await aba(page,'metas');
  await page.click('[data-act="movM"][data-id="m1"][data-s="1"]');
  await page.fill('#dlg-v','200'); await page.click('[data-dlg="ok"]');
  assert.equal((await calc(page, ym(0))).sobra, 800);
  await page.click('[data-act="movM"][data-id="m1"][data-s="-1"]');
  await page.fill('#dlg-v','50'); await page.press('#dlg-v','Enter');
  assert.equal((await calc(page, ym(0))).guardado, 150);
  await page.click('[data-act="arqM"][data-id="m1"]');
  assert.doesNotMatch(await page.textContent('#view'), /Reserva/);
  assert.equal((await calc(page, ym(0))).guardado, 150);
  await ctx.close();
});

test('categorias: criar, renomear e apagar (lançamentos vão para Outros)', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:10, cat:'delivery', meio:'pix', desc:'', criado:1}], limites:{delivery:100}}));
  await aba(page,'ajustes');
  await page.fill('#nCat','Pets'); await page.click('[data-act="addCat"]');
  let s = await lerEstado(page);
  const pets = s.cats.find(c=>c.n==='Pets'); assert.ok(pets);
  await page.fill(`[data-catn="${pets.id}"]`, 'Pet shop'); await page.click('[data-act="saveCats"]');
  await page.click('[data-act="delCat"][data-id="delivery"]');
  s = await lerEstado(page);
  assert.ok(s.cats.some(c=>c.n==='Pet shop'));
  assert.ok(!s.cats.some(c=>c.id==='delivery'));
  assert.equal(s.gastos[0].cat, 'outros');
  assert.equal(s.limites.delivery, undefined);
  assert.equal(await page.$('[data-act="delCat"][data-id="outros"]'), null, '"Outros" não pode ser apagada');
  await aba(page,'lancar');
  assert.match(await page.textContent('#view'), /Pet shop/);
  await ctx.close();
});

test('busca em todos os meses, com filtros', async()=>{
  const {page, ctx} = await abrir(estado({
    gastos:[{id:'a', data:ym(-3)+'-10', valor:30, cat:'saude', meio:'pix', desc:'Farmácia São João', criado:1},
            {id:'b', data:iso(0), valor:20, cat:'saude', meio:'cartao', desc:'farmacia centro', criado:2},
            {id:'c', data:iso(0), valor:99, cat:'mercado', meio:'pix', desc:'feira', criado:3}],
    entradas:[{id:'e', data:ym(-1)+'-05', valor:700, desc:'cliente farm', criado:4}]}));
  await page.fill('[data-filtro="q"]','farmacia');
  assert.match(await page.textContent('#listaTit'), /Resultados da busca \(2\)/);   // sem acento casa com acento
  await page.selectOption('[data-filtro="meio"]','pix');
  assert.match(await page.textContent('#listaTit'), /\(1\)/);
  await page.fill('[data-filtro="q"]',''); await page.selectOption('[data-filtro="meio"]','entrada');
  assert.match(await page.textContent('#lista'), /cliente farm/);
  await page.selectOption('[data-filtro="meio"]','');
  assert.match(await page.textContent('#listaTit'), /Lançamentos do mês \(2\)/);
  await ctx.close();
});

test('histórico de 6 meses e comparação com o mês anterior', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[
    {id:'a', data:ym(-1)+'-10', valor:100, cat:'mercado', meio:'pix', desc:'', criado:1},
    {id:'b', data:iso(0), valor:150, cat:'mercado', meio:'pix', desc:'', criado:2}]}));
  assert.equal(await page.$$eval('.proj div', d=>d.length), 6);
  assert.match(await page.textContent('#view'), /▲ 50% vs/);
  await ctx.close();
});

test('repetir um gasto recente preenche o formulário', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(-3), valor:12.34, cat:'mercado', meio:'pix', desc:'pão', criado:1}]}));
  await aba(page,'lancar'); await page.click('[data-act="repG"][data-id="g1"]');
  assert.equal(await page.inputValue('#gValor'), '12,34');
  assert.equal(await page.inputValue('#gDesc'), 'pão');
  assert.equal(await page.getAttribute('[data-act="dMeio"][data-id="pix"]','aria-pressed'), 'true');
  await ctx.close();
});

test('CSV: ignora estornos e acerta o ano de datas sem ano', async()=>{
  const {page, ctx} = await abrir(estado());
  const futuro = iso(20), passado = iso(-5);   // data sem ano que ainda não chegou = ano passado
  const dm = d => d.slice(8,10)+'/'+d.slice(5,7);
  const csv = ['Data;Lançamento;Valor', `${dm(passado)};IFOOD *LANCHE;45,90`, `${dm(passado)};LOJA X;120,00`,
    `${dm(passado)};ESTORNO LOJA X;-120,00`, `${dm(passado)};REEMBOLSO APP;-30,00`, `${dm(futuro)};POSTO IPIRANGA;200,00`, `${dm(passado)};PAGAMENTO FATURA;-900,00`].join('\n');
  await aba(page,'ajustes');
  await page.setInputFiles('#fileCsv', {name:'f.csv', mimeType:'text/csv', buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('meucaixa.v1')).gastos.length>0);
  const g = (await lerEstado(page)).gastos;
  assert.deepEqual(g.map(x=>x.desc).sort(), ['IFOOD *LANCHE','LOJA X','POSTO IPIRANGA']);
  assert.equal(g.find(x=>x.desc==='IFOOD *LANCHE').cat, 'delivery');
  const cand = now.getFullYear() + futuro.slice(4);
  assert.equal(g.find(x=>x.desc==='POSTO IPIRANGA').data, cand > iso(0) ? (now.getFullYear()-1) + futuro.slice(4) : cand);
  await ctx.close();
});

test('backup com senha: arquivo cifrado, senha errada recusada, senha certa restaura', async()=>{
  const st = estado({gastos:[{id:'g1', data:iso(0), valor:42, cat:'mercado', meio:'pix', desc:'segredo', criado:1}]});
  st.config.ultimoBackup = null;
  const {page, ctx} = await abrir(st);
  assert.match(await page.textContent('#view'), /ainda não fez nenhum backup/);
  await aba(page,'ajustes'); await page.click('[data-act="export"]');
  await page.fill('#dlg-s1','minhasenha'); await page.fill('#dlg-s2','outra'); await page.click('[data-dlg="com"]');
  assert.match(await page.textContent('.dlg-erro'), /não conferem/);
  await page.fill('#dlg-s2','minhasenha');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-dlg="com"]')]);
  const arquivo = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(dl.suggestedFilename(), /^meu-caixa-backup-.*-protegido\.json$/);
  assert.doesNotMatch(arquivo, /segredo|gastos|mercado/);
  assert.equal(JSON.parse(arquivo).formato, 'meucaixa-cifrado');
  const exportado = await lerEstado(page);
  assert.equal(exportado.config.ultimoBackup, iso(0));
  await aba(page,'inicio');
  assert.doesNotMatch(await page.textContent('#view'), /backup/);

  await aba(page,'ajustes'); await page.click('[data-act="reset"]');
  await page.setInputFiles('#fileJson', {name:'b.json', mimeType:'application/json', buffer:Buffer.from(arquivo)});
  await page.fill('#dlg-s','errada'); await page.click('[data-dlg="ok"]');
  await page.waitForFunction(()=>/Senha incorreta/.test(document.querySelector('#toast').textContent), null, {timeout:15000});
  assert.equal((await lerEstado(page)).gastos.length, 0);
  await page.setInputFiles('#fileJson', {name:'b.json', mimeType:'application/json', buffer:Buffer.from(arquivo)});
  await page.fill('#dlg-s','minhasenha'); await page.click('[data-dlg="ok"]');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('meucaixa.v1')).gastos.length===1, null, {timeout:15000});
  assert.deepEqual(await lerEstado(page), exportado);
  await ctx.close();
});

test('backup sem senha e validação de arquivos', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:42, cat:'mercado', meio:'pix', desc:'x', criado:1}]}));
  await aba(page,'ajustes'); await page.click('[data-act="export"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-dlg="sem"]')]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(backup.gastos[0].desc, 'x');

  await page.setInputFiles('#fileJson', {name:'x.json', mimeType:'application/json', buffer:Buffer.from('{"foo":1}')});
  await page.waitForFunction(()=>/não é um backup/.test(document.querySelector('#toast').textContent));
  const mensagens = [];
  page.removeAllListeners('dialog'); page.on('dialog', d=>{ mensagens.push(d.message()); d.accept(); });
  backup.gastos.push({id:'ruim', data:'ontem', valor:-5, meio:'pix'}, {id:'<script>', data:iso(0), valor:1, meio:'pix'});
  await page.setInputFiles('#fileJson', {name:'b.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(()=>/restaurado/.test(document.querySelector('#toast').textContent));
  assert.match(mensagens.at(-1), /2 item\(ns\) com dados inválidos/);
  assert.equal((await lerEstado(page)).gastos.length, 1);
  await ctx.close();
});

test('lembrete de backup depois de 15 dias', async()=>{
  const st = estado({gastos:[{id:'g1', data:iso(0), valor:1, cat:'mercado', meio:'pix', desc:'', criado:1}]});
  st.config.ultimoBackup = iso(-20);
  let {page, ctx} = await abrir(st);
  assert.match(await page.textContent('#view'), /último backup foi há 20 dias/);
  await ctx.close();
  st.config.ultimoBackup = iso(-3);
  ({page, ctx} = await abrir(st));
  assert.doesNotMatch(await page.textContent('#view'), /último backup foi/);
  await ctx.close();
});

test('aviso para instalar no iPhone', async()=>{
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const {page, ctx} = await abrir(estado(), {ua});
  assert.match(await page.textContent('#view'), /Adicionar à Tela de Início/);
  await ctx.close();
});

test('layout a 390px sem rolagem horizontal, inclusive com a janela de diálogo', async()=>{
  const {page, ctx, errors} = await abrir(estado({
    gastos:[{id:'g1', data:iso(0), valor:123456.78, cat:'mercado', meio:'cartao', desc:'descrição bem comprida de um gasto qualquer no mercado', criado:1}],
    recorrentes:[{id:'r1', nome:'Parcela com nome bastante comprido', valor:999.99, tipo:'parcela', parcelas:12, meio:'cartao', inicio:ym(-2), cat:'mercado'}],
    metas:[{id:'m1', nome:'Reserva', alvo:10000, atual:500, movs:[]}], limites:{mercado:100}}));
  for(const t of ['inicio','lancar','fixos','metas','ajustes']){
    await aba(page,t);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth) <= 390, t);
  }
  await page.click('[data-act="export"]');
  assert.ok(await page.isVisible('#dlg'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth) <= 390, 'diálogo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('acessibilidade básica', async()=>{
  const {page, ctx} = await abrir(estado());
  assert.equal(await page.getAttribute('nav [data-t="lancar"]','aria-label'), 'Lançar');
  assert.equal(await page.getAttribute('nav [data-t="inicio"]','aria-current'), 'page');
  assert.equal(await page.getAttribute('#toast','role'), 'status');
  await ctx.close();
});

test('privacidade: nenhuma requisição para fora e a CSP bloqueia conexões', async()=>{
  const {page, ctx, requests, errors} = await abrir(estado());
  for(const t of ['inicio','lancar','fixos','metas','ajustes']) await aba(page,t);
  assert.deepEqual(errors, []);
  const r = await page.evaluate(async()=>{ const out = []; for(const u of ['https://example.com/x', location.href]){ try{ await fetch(u); out.push('passou'); }catch(e){ out.push('bloqueado'); } } return out; });
  assert.deepEqual(r, ['bloqueado','bloqueado']);
  assert.deepEqual(requests.filter(u=>/^(https?|wss?):/.test(u) && !u.startsWith(BASE)), []);
  await ctx.close();
});

test('PWA: todos os arquivos no cache, abre offline e oferece atualização', async()=>{
  const sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  const listados = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  for(const dir of ['js','css','icons']) for(const f of fs.readdirSync(path.join(ROOT,dir)))
    assert.ok(listados.includes(`./${dir}/${f}`), `${dir}/${f} falta em FILES do sw.js`);

  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:5, cat:'mercado', meio:'pix', desc:'', criado:1}]}), {sw:true});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  for(let i=0;i<3;i++){ await page.reload(); await page.waitForSelector('#view .card'); }
  assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
  assert.equal(await page.evaluate(async()=>(await (await caches.open((await caches.keys())[0])).keys()).length), listados.length);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#view .card');
  await page.goto(BASE+'?source=pwa'); await page.waitForSelector('#view .card');
  await page.goto(BASE+'index.html'); await page.waitForSelector('#view .card');
  await ctx.setOffline(false);

  swOverride = sw.replace(/const VERSION = '[^']*';/, "const VERSION = 'teste-nova';");
  try{
    await page.goto(BASE); await page.waitForSelector('#view .card');
    await page.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('#upd:not([hidden])', {timeout:10000});
    await Promise.all([page.waitForEvent('load'), page.click('#updBtn')]);
    await page.waitForSelector('#view .card');
    assert.deepEqual(await page.evaluate(()=>caches.keys()), ['meucaixa-teste-nova']);
    assert.equal((await lerEstado(page)).gastos.length, 1);
  } finally { swOverride = null; }
  await ctx.close();
});
