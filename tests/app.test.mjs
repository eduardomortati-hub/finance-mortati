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
  return {v:3, config:{renda:1000, configurado:true, ultimoBackup:iso(0)}, cartoes:[{id:'k1', nome:'Nubank', fechamento:5, vencimento:12}],
    cats:[{id:'mercado',n:'Mercado',c:'#22c55e'},{id:'saude',n:'Saúde',c:'#14b8a6'},{id:'delivery',n:'Delivery',c:'#ef4444'},{id:'outros',n:'Outros',c:'#94a3b8'}],
    gastos:[], entradas:[], recorrentes:[], metas:[], limites:{}, ...extra};
}

async function abrir(state, {sw=false, ua, viewport={width:390,height:844}, conta=false, nuvem=null} = {}){
  const ctx = await browser.newContext({viewport, serviceWorkers: sw?'allow':'block', acceptDownloads:true, userAgent:ua});
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('dialog', d=>d.accept());
  ctx.on('request', r=>requests.push(r.url()));
  if(nuvem) await ctx.route(u=>u.href.startsWith(SB), nuvem.rota);
  await page.goto(BASE);
  // sem `conta`, abre no modo "sem conta" (como antes da conta existir)
  await page.evaluate(([s, conta])=>{ localStorage.clear(); if(!conta) localStorage.setItem('meucaixa.semConta','true'); if(s) localStorage.setItem('meucaixa.v1', JSON.stringify(s)); }, [state ?? null, conta]);
  await page.reload(); await page.waitForSelector('#view .card');
  return {ctx, page, errors, requests};
}
const lerEstado = page => page.evaluate(()=>JSON.parse(localStorage.getItem('meucaixa.v1')));
const calc = (page, k) => page.evaluate(async k=>{ const {calc} = await import('./js/finance.js'); const c = calc(k); return {sobra:c.sobra, fatura:c.fatura, fixosFora:c.fixosFora, guardado:c.guardado, entradas:c.entradas, saidas:c.saidas}; }, k);
const aba = (page, t) => page.click(`nav [data-t="${t}"]`);
const toastTxt = page => page.textContent('#toast');
// abre uma seção recolhível (data-fold), se ainda estiver fechada
const secao = async (page, id) => { if(!await page.$eval(`[data-fold="${id}"]`, d=>d.open)) await page.click(`[data-fold="${id}"] > summary`); };

// Supabase de mentira para os testes (nada vai para o servidor de verdade): contas, sessões e a tabela "dados" com RLS
const SB = 'https://vaxqtliwlkokfgnpgtbt.supabase.co';
function nuvemFake(){
  const users = new Map(), linhas = new Map(), chamadas = [];
  const cors = {'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'*'};
  const json = (route, status, body) => route.fulfill({status, headers:{...cors, 'content-type':'application/json'}, body:JSON.stringify(body)});
  const sessaoDe = u => ({access_token:'tok-'+u.id, refresh_token:'ref-'+u.id, expires_in:3600, user:{id:u.id, email:u.email, user_metadata:{nome:u.nome}}});
  const quem = req => [...users.values()].find(u=>'Bearer tok-'+u.id===req.headers()['authorization']);
  let relogio = 0;
  const rota = async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if(m==='OPTIONS') return route.fulfill({status:204, headers:cors});
    chamadas.push(m+' '+url.pathname);
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if(url.pathname==='/auth/v1/token' && url.searchParams.get('grant_type')==='password'){
      const u = users.get(body.email);
      if(!u || u.senha!==body.password) return json(route, 400, {error_code:'invalid_credentials', msg:'Invalid login credentials'});
      return json(route, 200, sessaoDe(u));
    }
    if(url.pathname==='/auth/v1/signup'){ users.set(body.email, {id:'u'+users.size, email:body.email, senha:body.password, nome:body.data?.nome||''}); return json(route, 200, {id:'x'}); }
    if(url.pathname==='/auth/v1/recover') return json(route, 200, {});
    if(url.pathname==='/auth/v1/logout') return json(route, 204, {});
    if(url.pathname==='/auth/v1/user'){
      const u = quem(req); if(!u) return json(route, 401, {msg:'no'});
      if(m==='PUT') u.senha = body.password;
      return json(route, 200, {id:u.id, email:u.email, user_metadata:{nome:u.nome}});
    }
    if(url.pathname==='/rest/v1/dados'){
      const u = quem(req); if(!u) return json(route, 200, []);           // RLS: sem login, não vê nada
      const l = linhas.get(u.id);
      if(m==='GET') return json(route, 200, l ? [l] : []);
      const agora = new Date(Date.UTC(2026,0,1,0,0,++relogio)).toISOString().replace('Z','+00:00');
      if(m==='POST'){ linhas.set(u.id, {estado:body.estado, atualizado:agora}); return json(route, 201, [linhas.get(u.id)]); }
      if(m==='PATCH'){
        const base = (url.searchParams.get('atualizado')||'').replace(/^eq\./,'');
        if(!l || l.atualizado!==base) return json(route, 200, []);      // alguém gravou antes: conflito
        linhas.set(u.id, {estado:body.estado, atualizado:agora}); return json(route, 200, [linhas.get(u.id)]);
      }
    }
    return json(route, 404, {msg:'?'});
  };
  return {users, linhas, chamadas, rota, conta(email, senha, nome=''){ users.set(email, {id:'u'+users.size, email, senha, nome}); return users.get(email); }};
}
const entrarComo = async (page, email, senha) => { await page.fill('#aEmail', email); await page.fill('#aSenha', senha); await page.click('[data-act="authEntrar"]'); };

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
    gastos:[{id:'g1', data:iso(0), valor:50, cat:'mercado', meio:'pix', desc:'x', criado:1},
            {id:'g2', data:iso(0), valor:70, cat:'mercado', meio:'cartao', desc:'y', criado:2}],
    recorrentes:[{id:'r1', nome:'Academia', valor:100, tipo:'fixo', meio:'pix', inicio:ym(-2), cat:'saude'},
                 {id:'r2', nome:'TV', valor:200, tipo:'parcela', parcelas:5, meio:'cartao', inicio:ym(-1), cat:'compras'}],
    metas:[{id:'m1', nome:'Reserva', alvo:1000, atual:200}], limites:{mercado:300}};
  const {page, ctx, errors} = await abrir(v1);
  const s = await lerEstado(page);
  assert.equal(s.v, 5);
  assert.deepEqual(s.cartoes, [{id:'cartao1', nome:'Meu cartão', fechamento:3, vencimento:10, cor:'brasa'}], 'cartão vem do config antigo');
  assert.equal(s.config.fechamento, undefined);
  assert.equal(s.gastos[0].cartao, undefined, 'pix não tem cartão');
  assert.equal(s.gastos[1].cartao, 'cartao1');
  assert.equal(s.recorrentes[1].cartao, 'cartao1');
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
    const {faturaMonth, faturaPeriodo, infoCartao} = await import('./js/finance.js'); const {addDias, addM} = await import('./js/util.js');
    const out = [];
    for(const [F,V] of [[1,10],[5,12],[25,5],[31,10],[28,28],[30,2]]){
      const c = {id:'x', nome:'x', fechamento:F, vencimento:V};
      for(let t = Date.UTC(2025,0,1); t < Date.UTC(2027,0,1); t += 864e5){
        const d = new Date(t).toISOString().slice(0,10), k = faturaMonth(d, c), p = faturaPeriodo(k, c);
        if(d < p.ini || d > p.fim) out.push(`F${F} V${V} ${d} -> ${k} [${p.ini}..${p.fim}]`);
        // o "melhor dia" é o primeiro que já cai na fatura seguinte, e o vencimento nunca vem antes da compra
        const i = infoCartao(c, d);
        if(faturaMonth(i.melhorDia, c)!==addM(i.aberta,1) || faturaMonth(addDias(i.melhorDia,-1), c)!==i.aberta) out.push(`melhor dia F${F} V${V} ${d}`);
        if(i.pagaHoje < d || i.proxVence < d) out.push(`datas F${F} V${V} ${d}`);
      }
    }
    return out;
  });
  assert.deepEqual(erros.slice(0,5), []);
  await page.evaluate(async()=>{ const {S, save} = await import('./js/store.js'); S.cartoes[0].fechamento = 1; save(); });
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
  await secao(page,'enc');
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

test('categorias: criar, renomear, tirar e voltar com um toque', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:10, cat:'delivery', meio:'pix', desc:'', criado:1}], limites:{delivery:100},
    cats:[{id:'mercado',n:'Mercado',c:'#22c55e'},{id:'delivery',n:'Delivery',c:'#ef4444'},{id:'outros',n:'Outros',c:'#94a3b8'}]}));
  await aba(page,'ajustes'); await secao(page,'cats-ed');
  await page.fill('#nCat','Pets'); await page.click('[data-act="addCat"]');
  let s = await lerEstado(page);
  const pets = s.cats.find(c=>c.n==='Pets'); assert.ok(pets);
  await page.fill(`[data-catn="${pets.id}"]`, 'Pet shop'); await page.click('[data-act="saveCats"]');
  // tirar: some das opções, mas o lançamento continua nela
  await page.click('[data-act="escCat"][data-id="delivery"]');
  s = await lerEstado(page);
  assert.equal(s.cats.find(c=>c.id==='delivery').oculta, true);
  assert.equal(s.gastos[0].cat, 'delivery', 'o lançamento não muda de categoria');
  assert.equal(await page.$('[data-act="escCat"][data-id="outros"]'), null, '"Outros" não pode sair');
  await aba(page,'lancar');
  assert.equal(await page.$('[data-act="dCat"][data-id="delivery"]'), null, 'não aparece para lançar');
  assert.match(await page.textContent('#view'), /Pet shop/);
  // padrões que não estão na lista (ex.: Carro) também aparecem para voltar
  await aba(page,'ajustes');
  assert.equal(await page.isVisible('#catSug'), false, 'a lista só aparece ao tocar no campo');
  await page.click('#nCat');
  assert.ok(await page.isVisible('[data-act="voltaCat"][data-id="carro"]'));
  await page.fill('#nCat', 'deliv');
  assert.equal(await page.$('#catSug [data-act="voltaCat"][data-id="carro"]'), null, 'filtra enquanto digita');
  await page.click('[data-act="voltaCat"][data-id="delivery"]');
  await page.click('#nCat');
  await page.click('[data-act="voltaCat"][data-id="carro"]');
  await page.click('#nCat'); await page.fill('#nCat', 'Viagens');
  assert.match(await page.textContent('#catSug'), /Criar "Viagens"/);
  await page.click('#catSug [data-act="addCat"]');
  assert.ok((await lerEstado(page)).cats.some(c=>c.n==='Viagens'));
  s = await lerEstado(page);
  assert.equal(s.cats.find(c=>c.id==='delivery').oculta, undefined);
  assert.ok(s.cats.some(c=>c.id==='carro'));
  await aba(page,'lancar');
  assert.ok(await page.$('[data-act="dCat"][data-id="delivery"]'));
  await ctx.close();
});

test('busca em todos os meses, com filtros', async()=>{
  const {page, ctx} = await abrir(estado({
    gastos:[{id:'a', data:ym(-3)+'-10', valor:30, cat:'saude', meio:'pix', desc:'Farmácia São João', criado:1},
            {id:'b', data:iso(0), valor:20, cat:'saude', meio:'cartao', desc:'farmacia centro', criado:2},
            {id:'c', data:iso(0), valor:99, cat:'mercado', meio:'pix', desc:'feira', criado:3}],
    entradas:[{id:'e', data:ym(-1)+'-05', valor:700, desc:'cliente farm', criado:4}]}));
  assert.equal(await page.$('[data-filtro="q"]'), null, 'a busca fica escondida até tocar na lupa');
  await page.click('[data-act="busca"]');
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
  assert.equal(await page.$$eval('.pills > div', d=>d.length), 6);
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
  await aba(page,'ajustes'); await secao(page,'dados'); await page.click('[data-act="export"]');
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

  await aba(page,'ajustes'); await secao(page,'dados'); await page.click('[data-act="reset"]');
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
  await aba(page,'ajustes'); await secao(page,'dados'); await page.click('[data-act="export"]');
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
    await page.$$eval('#view details', ds=>ds.forEach(d=>{ d.open = true; }));   // com tudo aberto
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth) <= 390, t);
  }
  await secao(page,'dados'); await page.click('[data-act="export"]');
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
  for(const dir of ['js','css','icons','fonts']) for(const f of fs.readdirSync(path.join(ROOT,dir)).filter(f=>!f.endsWith('.txt')))
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

test('cartão hoje: próximo vencimento, fatura aberta e melhor dia de compra', async()=>{
  const {page, ctx} = await abrir(estado());
  const r = await page.evaluate(async()=>{
    const {infoCartao} = await import('./js/finance.js');
    const c = {id:'x', nome:'x', fechamento:5, vencimento:12};
    return [infoCartao(c, '2026-10-06'), infoCartao(c, '2026-10-05'), infoCartao(c, '2026-10-03'), infoCartao({...c, fechamento:25, vencimento:5}, '2026-10-06')];
  });
  // dia 6/10, fecha dia 5 e vence dia 12: a fatura de outubro já fechou e vence 12/10; o que comprar hoje vence 12/11
  assert.equal(r[0].proxVence, '2026-10-12'); assert.equal(r[0].diasProx, 6);
  assert.equal(r[0].aberta, '2026-11'); assert.equal(r[0].fechaEm, '2026-11-05');
  assert.equal(r[0].pagaHoje, '2026-11-12'); assert.equal(r[0].diasHoje, 37);
  assert.equal(r[0].melhorDia, '2026-11-05'); assert.equal(r[0].pagaMelhor, '2026-12-12'); assert.equal(r[0].hojeEhMelhor, false);
  assert.equal(r[1].hojeEhMelhor, true, 'no dia do fechamento é o melhor dia');
  assert.equal(r[1].pagaHoje, '2026-11-12'); assert.equal(r[1].diasHoje, 38);
  assert.equal(r[2].prox, r[2].aberta, 'antes do fechamento a fatura do mês ainda está aberta');
  assert.equal(r[2].fechaEm, '2026-10-05'); assert.equal(r[2].pagaHoje, '2026-10-12');
  assert.equal(r[3].pagaHoje, '2026-11-05', 'vencimento antes do fechamento: vence no mês seguinte');
  assert.equal(r[3].fechaEm, '2026-10-25');
  // e a tela mostra isso
  const txt = await page.textContent('#view');
  assert.match(txt, /Seu cartão/);
  assert.match(txt, /Melhor dia de compra|melhor dia de compra/);
  await ctx.close();
});

test('vários cartões: cada compra cai na fatura do seu cartão', async()=>{
  const st = estado({cartoes:[{id:'k1', nome:'Nubank', fechamento:5, vencimento:12}, {id:'k2', nome:'Inter', fechamento:25, vencimento:5}]});
  const {page, ctx} = await abrir(st);
  await aba(page,'lancar');
  await page.click('[data-act="dMeio"][data-id="cartao"]');
  await page.click('[data-act="dCartao"][data-id="k2"]');
  await page.fill('#gValor','100'); await page.fill('#gData', ym(0)+'-10'); await page.click('[data-act="saveG"]');
  await aba(page,'lancar');
  await page.click('[data-act="dCartao"][data-id="k1"]');
  await page.fill('#gValor','40'); await page.fill('#gData', ym(0)+'-10'); await page.click('[data-act="saveG"]');
  await aba(page,'lancar');
  await page.click('[data-act="dCartao"][data-id="k2"]'); await page.click('[data-act="dParc"][data-v="1"]');
  await page.fill('#gValor','100'); await page.fill('#gParc','3');
  assert.match(await page.textContent('#gTotal'), /3x de R\$\s?100,00 = R\$\s?300,00/);
  await page.fill('#gDesc','Fone'); await page.fill('#gData', ym(0)+'-10'); await page.click('[data-act="saveG"]');
  const s = await lerEstado(page);
  assert.deepEqual([s.recorrentes[0].nome, s.recorrentes[0].valor, s.recorrentes[0].parcelas], ['Fone', 100, 3], 'o valor digitado é o de cada parcela');
  assert.deepEqual(s.gastos.map(g=>g.cartao), ['k2','k1']);
  assert.equal(s.recorrentes[0].cartao, 'k2');
  assert.equal(s.recorrentes[0].inicio, ym(1), 'Inter: compra dia 10, fecha 25, vence dia 5 do mês seguinte');
  const por = await page.evaluate(async k=>{ const {calc} = await import('./js/finance.js'); return calc(k).porCartao.map(x=>[x.cartao.id, x.total]); }, ym(1));
  assert.deepEqual(Object.fromEntries(por), {k1:40, k2:200}, 'Nubank: compra dia 10 depois do fechamento (5) vence em 12 do mês seguinte');
  await aba(page,'inicio');
  assert.match(await page.textContent('#view'), /Seus cartões/);
  assert.match(await page.textContent('#lista'), /Inter/);
  await ctx.close();
});

test('cartões em Ajustes: adicionar, editar e remover', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:10, cat:'mercado', meio:'cartao', cartao:'k1', desc:'', criado:1}]}));
  await aba(page,'ajustes'); await secao(page,'cartoes');
  assert.equal(await page.$('#kNome'), null, 'nenhum campo de nome antes de tocar em algo');
  // novo cartão
  await page.click('[data-act="edCartao"][data-id="novo"]');
  assert.equal(await page.$$eval('#kNome', x=>x.length), 1, 'só um campo de nome na tela');
  await page.fill('#kNome','Inter'); await page.fill('#kF','25'); await page.fill('#kV','5'); await page.click('[data-act="salvarCartao"]');
  let s = await lerEstado(page);
  const inter = s.cartoes.find(k=>k.nome==='Inter');
  assert.deepEqual([inter.fechamento, inter.vencimento], [25, 5]);
  assert.notEqual(inter.cor, s.cartoes[0].cor, 'cartão novo ganha uma cor ainda não usada');
  assert.equal(await page.$('#kNome'), null, 'o editor fecha depois de salvar');
  // editar: dia inválido é recusado
  await page.click('[data-act="edCartao"][data-id="k1"]');
  await page.fill('#kV','40'); await page.click('[data-act="salvarCartao"]');
  assert.match(await toastTxt(page), /Confira os dias/);
  await page.fill('#kV','15'); await page.fill('#kNome','Nubank roxinho'); await page.click('[data-act="salvarCartao"]');
  s = await lerEstado(page);
  assert.deepEqual([s.cartoes[0].nome, s.cartoes[0].vencimento], ['Nubank roxinho', 15]);
  // cancelar não muda nada
  await page.click('[data-act="edCartao"][data-id="k1"]'); await page.fill('#kNome','xxx'); await page.click('[data-act="cancelCartao"]');
  assert.equal((await lerEstado(page)).cartoes[0].nome, 'Nubank roxinho');
  // com lançamentos: só sai das opções, continua nas faturas
  await page.click('[data-act="edCartao"][data-id="k1"]'); await page.click('[data-act="delCartao"][data-id="k1"]');
  s = await lerEstado(page);
  assert.equal(s.cartoes.find(k=>k.id==='k1').arquivado, true);
  assert.equal(s.gastos[0].cartao, 'k1');
  assert.match(await page.textContent('#view'), /Removidos .*Nubank roxinho/);
  // o único cartão que sobrou não pode ser removido
  await page.click(`[data-act="edCartao"][data-id="${inter.id}"]`);
  assert.equal(await page.$('[data-act="delCartao"]'), null, 'não dá para remover o único cartão');
  await aba(page,'lancar');
  assert.equal(await page.$('[data-act="dCartao"]'), null, 'com um cartão ativo não pergunta qual');
  await ctx.close();
});

test('CSV com mais de um cartão pergunta de qual cartão é a fatura', async()=>{
  const {page, ctx} = await abrir(estado({cartoes:[{id:'k1', nome:'Nubank', fechamento:5, vencimento:12}, {id:'k2', nome:'Inter', fechamento:25, vencimento:5}]}));
  const d = iso(-2), dm = d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  await aba(page,'ajustes');
  await page.setInputFiles('#fileCsv', {name:'f.csv', mimeType:'text/csv', buffer:Buffer.from(`Data;Descrição;Valor\n${dm};MERCADO X;55,00\n`)});
  await page.waitForSelector('#dlg[open]');
  assert.match(await page.textContent('#dlg'), /De qual cartão/);
  await page.click('[data-dlg="k2"]');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('meucaixa.v1')).gastos.length===1);
  assert.equal((await lerEstado(page)).gastos[0].cartao, 'k2');
  await ctx.close();
});

test('cor do cartão: escolher em Ajustes muda o cartão no Início', async()=>{
  const {page, ctx, errors} = await abrir(estado());
  await aba(page,'ajustes'); await secao(page,'cartoes');
  await page.click('[data-act="edCartao"][data-id="k1"]');
  await page.fill('#kNome','Nubank editado');
  await page.click('[data-act="corCartao"][data-v="oceano"]');
  assert.equal(await page.inputValue('#kNome'), 'Nubank editado', 'escolher a cor não apaga o que foi digitado');
  await page.click('[data-act="salvarCartao"]');
  assert.equal((await lerEstado(page)).cartoes[0].cor, 'oceano');
  await aba(page,'inicio');
  assert.ok(await page.$('.ccard.cc-oceano'));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontFamily.includes('Hanken')), true, 'fonte do app carregada');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('modo escuro/claro: botão alterna, lembra a escolha e sem escolha segue o sistema', async()=>{
  const {page, ctx, errors} = await abrir(estado());
  const tema = () => page.evaluate(()=>document.documentElement.dataset.theme);
  const fundo = () => page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  assert.equal(await tema(), 'light', 'o navegador de teste está em tema claro');
  const claro = await fundo();
  await page.click('#temaBtn');
  assert.equal(await tema(), 'dark');
  assert.equal(await page.getAttribute('#temaBtn','aria-label'), 'Ativar modo claro');
  await page.waitForTimeout(500);
  assert.notEqual(await fundo(), claro, 'o fundo muda de cor');
  assert.equal(await page.getAttribute('meta[name="theme-color"]','content'), '#000000');
  await page.reload(); await page.waitForSelector('#view .card');
  assert.equal(await tema(), 'dark', 'a escolha continua depois de reabrir');
  // sem escolha salva, acompanha o sistema
  await page.evaluate(()=>localStorage.removeItem('meucaixa.tema'));
  await page.emulateMedia({colorScheme:'dark'}); await page.reload(); await page.waitForSelector('#view .card');
  assert.equal(await tema(), 'dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light', null, {timeout:3000});
  assert.equal((await lerEstado(page)).tema, undefined, 'a preferência não entra no backup');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Início limpo: detalhes e seções começam fechados e abrem com um toque', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:80, cat:'mercado', meio:'pix', desc:'feira', criado:1}]}));
  assert.equal(await page.isVisible('.hero .legend'), false);
  assert.equal(await page.isVisible('[data-fold="cats"] .cat'), false);
  await page.click('.hero summary');
  assert.ok(await page.isVisible('.hero .legend'));
  await secao(page,'cats');
  assert.ok(await page.isVisible('[data-fold="cats"] .cat'));
  // continuam abertas depois de mudar de mês e voltar
  await page.click('[data-act="mes"][data-d="-1"]'); await page.click('[data-act="mes"][data-d="1"]');
  assert.ok(await page.isVisible('.hero .legend'));
  assert.ok(await page.isVisible('[data-fold="cats"] .cat'));
  await ctx.close();
});

test('quanto dá para gastar por dia, só no mês atual', async()=>{
  const {page, ctx} = await abrir(estado());   // renda de 1000 e nenhum gasto
  const dias = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate() + 1;
  const txt = (await page.textContent('.pordia')).replace(/\s/g,' ');
  assert.ok(txt.includes(brl(1000/dias).replace(/\s/g,' ')), txt);
  await page.click('[data-act="mes"][data-d="-1"]');
  assert.equal(await page.$('.pordia'), null);
  await ctx.close();
});

test('categoria automática pelo nome do que comprou; escolha manual vence', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(-3), valor:30, cat:'saude', meio:'pix', desc:'Loja do Zé', criado:1}]}));
  await aba(page,'lancar');
  const marcada = id => page.getAttribute(`[data-act="dCat"][data-id="${id}"]`, 'aria-pressed');
  await page.fill('#gDesc','loja do ze');
  assert.equal(await marcada('saude'), 'true', 'pelo histórico (sem acento e maiúscula)');
  await page.fill('#gDesc','iFood');
  assert.equal(await marcada('delivery'), 'true', 'pelas regras de nomes conhecidos');
  await page.click('[data-act="dCat"][data-id="mercado"]');
  await page.fill('#gDesc','Loja do Zé');
  assert.equal(await marcada('mercado'), 'true', 'depois de escolher na mão, não troca');
  await page.fill('#gValor','10'); await page.click('[data-act="saveG"]');
  const s = await lerEstado(page);
  assert.equal(s.gastos.find(g=>g.id!=='g1').cat, 'mercado');
  await ctx.close();
});

test('apagar lançamento: some na hora e dá para desfazer', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:42, cat:'mercado', meio:'pix', desc:'feira', criado:1}]}));
  await page.click('[data-act="delL"][data-id="g1"]');
  assert.equal((await lerEstado(page)).gastos.length, 0);
  assert.match(await toastTxt(page), /Gasto apagado/);
  await page.click('#toast button');
  assert.equal((await lerEstado(page)).gastos.length, 1);
  assert.match(await page.textContent('#lista'), /feira/);
  await ctx.close();
});

test('olho esconde os valores e lembra a escolha', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:42.5, cat:'mercado', meio:'pix', desc:'feira', criado:1}]}));
  await page.click('[data-act="olho"]');
  assert.equal(await page.$eval('.hero', d=>d.open), false, 'tocar no olho não abre os detalhes');
  assert.match(await page.textContent('.big'), /•••/);
  assert.doesNotMatch(await page.textContent('#view'), /\d,\d\d/, 'nenhum valor à mostra');
  await page.reload(); await page.waitForSelector('#view .card');
  assert.match(await page.textContent('.big'), /•••/, 'continua escondido ao reabrir');
  await page.click('[data-act="olho"]');
  assert.match(await page.textContent('#lista'), /42,50/);
  await ctx.close();
});

test('fatura paga: marcar e desmarcar no cartão', async()=>{
  // fecha dia 1 e vence no último dia do mês: sempre há uma fatura fechada para pagar neste mês
  const {page, ctx} = await abrir(estado({cartoes:[{id:'k1', nome:'Nubank', fechamento:1, vencimento:31}],
    gastos:[{id:'g1', data:ym(-1)+'-15', valor:120, cat:'mercado', meio:'cartao', cartao:'k1', desc:'', criado:1}]}));
  assert.match(await page.textContent('.ccard'), /A pagar até/);
  await page.click('[data-act="pagaFat"]');
  assert.deepEqual((await lerEstado(page)).cartoes[0].pagas, [ym(0)]);
  assert.doesNotMatch(await page.textContent('.ccard'), /A pagar até/);
  assert.match(await page.textContent('[data-act="pagaFat"]'), /paga · desfazer/);
  assert.match(await page.textContent('.hero .det'), /paga/);
  await page.click('[data-act="pagaFat"]');
  assert.equal((await lerEstado(page)).cartoes[0].pagas, undefined);
  assert.match(await page.textContent('.ccard'), /A pagar até/);
  await ctx.close();
});

test('investimentos: adicionar, aplicar, resgatar e atualizar saldo', async()=>{
  const {page, ctx, errors} = await abrir(estado());   // renda 1000
  await aba(page,'metas');
  // já estava guardado: não mexe na sobra
  await page.fill('#iNome','CDB Banco'); await page.click('[data-act="invTipo"][data-v="cdb"]'); await page.fill('#iSaldo','5000');
  await page.click('[data-act="saveInv"]');
  let s = await lerEstado(page);
  assert.equal(s.investimentos[0].saldo, 5000);
  assert.equal(s.investimentos[0].tipo, 'cdb');
  assert.equal((await calc(page, ym(0))).sobra, 1000);
  assert.match(await page.textContent('.inv-hero'), /Total investido/);
  // aplicar sai da sobra
  await page.click('[data-act="invEd"]');
  await page.click('[data-act="invMov"][data-s="1"]'); await page.fill('#dlg-v','300'); await page.click('[data-dlg="ok"]');
  assert.equal((await lerEstado(page)).investimentos[0].saldo, 5300);
  assert.equal((await calc(page, ym(0))).sobra, 700);
  // resgatar mais que o saldo é recusado; resgatar volta para a sobra
  await page.click('[data-act="invMov"][data-s="-1"]'); await page.fill('#dlg-v','9000'); await page.click('[data-dlg="ok"]');
  assert.match(await page.textContent('.dlg-erro'), /saldo/);
  await page.fill('#dlg-v','100'); await page.click('[data-dlg="ok"]');
  assert.equal((await calc(page, ym(0))).sobra, 800);
  // atualizar saldo: rendimento não mexe na sobra
  await page.click('[data-act="invSaldo"]'); await page.fill('#dlg-v','5250,50'); await page.click('[data-dlg="ok"]');
  s = await lerEstado(page);
  assert.equal(s.investimentos[0].saldo, 5250.5);
  assert.equal(s.investimentos[0].movs.at(-1).rend, true);
  assert.equal((await calc(page, ym(0))).sobra, 800);
  assert.match(await page.textContent('.inv-hero'), /de rendimento este mês/);
  // aplicando agora: sai da sobra
  await secao(page,'novoInv');
  await page.fill('#iNome','Ações X'); await page.click('[data-act="invTipo"][data-v="acoes"]'); await page.fill('#iSaldo','200');
  await page.click('[data-act="invJa"][data-v="0"]');
  assert.equal(await page.inputValue('#iNome'), 'Ações X', 'escolher opção não apaga o que foi digitado');
  await page.click('[data-act="saveInv"]');
  assert.equal((await calc(page, ym(0))).sobra, 600);
  assert.match(await page.textContent('.inv-hero'), /renda variável/);
  // remover e desfazer
  await page.click('[data-act="invEd"]'); await page.click('[data-act="invArq"]');
  assert.equal((await lerEstado(page)).investimentos[0].arquivado, true);
  assert.equal((await calc(page, ym(0))).sobra, 600, 'removido continua contando no mês');
  await page.click('#toast button');
  assert.equal((await lerEstado(page)).investimentos[0].arquivado, undefined);
  // backup de versão mais nova é recusado por versões antigas: o arquivo sai com v4
  assert.equal((await lerEstado(page)).v, 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('conta: tela de entrar, usar sem conta, e nada vai para a nuvem sem conta', async()=>{
  const nv = nuvemFake();
  const {page, ctx, errors} = await abrir(null, {conta:true, nuvem:nv});
  assert.ok(await page.isVisible('[data-act="authEntrar"]'));
  assert.equal(await page.isVisible('nav'), false, 'sem a barra de abas antes de entrar');
  await page.click('[data-act="authSemConta"]');
  assert.ok(await page.isVisible('.hero'));
  await aba(page,'lancar'); await page.fill('#gValor','10'); await page.click('[data-act="saveG"]');
  await page.waitForTimeout(1500);
  assert.deepEqual(nv.chamadas, [], 'sem conta, nenhuma chamada ao Supabase');
  await page.reload(); await page.waitForSelector('#view .card');
  assert.ok(await page.isVisible('.hero'), 'continua sem conta ao reabrir');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('conta: senha errada, entrar sobe os dados do aparelho e cada alteração sincroniza', async()=>{
  const nv = nuvemFake(); const u = nv.conta('eu@teste.com', 'segredo1', 'Edu');
  const {page, ctx, errors} = await abrir(estado({gastos:[{id:'g1', data:iso(0), valor:42, cat:'mercado', meio:'pix', desc:'feira', criado:1}]}), {conta:true, nuvem:nv});
  await entrarComo(page, 'eu@teste.com', 'errada');
  await page.waitForSelector('.auth-erro:not([hidden])');
  assert.match(await page.textContent('.auth-erro'), /E-mail ou senha incorretos/);
  await entrarComo(page, 'eu@teste.com', 'segredo1');
  await page.waitForSelector('.hero');
  assert.equal(nv.linhas.get(u.id).estado.gastos[0].desc, 'feira', 'conta vazia recebe os dados do aparelho');
  await aba(page,'lancar'); await page.fill('#gValor','15'); await page.fill('#gDesc','pão'); await page.click('[data-act="saveG"]');
  await page.waitForFunction(()=>true); await page.waitForTimeout(1700);
  assert.equal(nv.linhas.get(u.id).estado.gastos.length, 2, 'o gasto novo foi para a nuvem');
  await aba(page,'ajustes'); await secao(page,'conta');
  assert.match(await page.textContent('#syncStatus'), /Sincronizado/);
  assert.deepEqual(errors.filter(e=>!/status of 400/.test(e)), [], 'só o 400 da senha errada');
  await ctx.close();
});

test('conta: outro aparelho recebe os dados; com dados diferentes, pergunta qual vale', async()=>{
  const nv = nuvemFake(); const u = nv.conta('eu@teste.com', 'segredo1');
  nv.linhas.set(u.id, {estado:estado({gastos:[{id:'n1', data:iso(0), valor:99, cat:'mercado', meio:'pix', desc:'da nuvem', criado:1}]}), atualizado:'2026-01-01T00:00:00+00:00'});
  // aparelho vazio: só recebe
  let a = await abrir(null, {conta:true, nuvem:nv});
  await entrarComo(a.page, 'eu@teste.com', 'segredo1'); await a.page.waitForSelector('.hero');
  assert.match(await a.page.textContent('#lista'), /da nuvem/);
  await a.ctx.close();
  // aparelho com outros dados: pergunta; escolher "deste aparelho" manda para a nuvem
  a = await abrir(estado({gastos:[{id:'l1', data:iso(0), valor:5, cat:'mercado', meio:'pix', desc:'do celular', criado:1}]}), {conta:true, nuvem:nv});
  await entrarComo(a.page, 'eu@teste.com', 'segredo1');
  await a.page.waitForSelector('#dlg[open]');
  assert.match(await a.page.textContent('#dlg'), /Qual versão/);
  await a.page.click('[data-dlg="aparelho"]'); await a.page.waitForSelector('.hero');
  assert.equal(nv.linhas.get(u.id).estado.gastos[0].desc, 'do celular');
  const copia = await a.page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('meucaixa.v1.copia-')));
  assert.ok(copia, 'a versão não escolhida fica guardada como cópia');
  await a.ctx.close();
});

test('conta: mudanças de outro aparelho chegam ao voltar para o app; sair limpa o aparelho', async()=>{
  const nv = nuvemFake(); const u = nv.conta('eu@teste.com', 'segredo1');
  const {page, ctx} = await abrir(null, {conta:true, nuvem:nv});
  await entrarComo(page, 'eu@teste.com', 'segredo1'); await page.waitForSelector('.hero');
  // o "PC" grava direto na nuvem
  const l = nv.linhas.get(u.id); l.estado = {...l.estado, gastos:[{id:'pc1', data:iso(0), valor:7, cat:'outros', meio:'pix', desc:'lançado no PC', criado:5}]}; l.atualizado = '2026-02-01T00:00:00+00:00';
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>/lançado no PC/.test(document.querySelector('#lista')?.textContent||''));
  await aba(page,'ajustes'); await secao(page,'conta'); await page.click('[data-act="sairConta"]');
  await page.waitForSelector('[data-act="authEntrar"]');
  const s = await lerEstado(page);
  assert.equal(s.gastos.length, 0, 'os dados saem do aparelho ao sair');
  assert.equal(await page.evaluate(()=>localStorage.getItem('meucaixa.sessao')), null);
  await ctx.close();
});

test('conta: criar conta pede confirmação por e-mail; esqueci a senha e link de nova senha', async()=>{
  const nv = nuvemFake();
  const {page, ctx} = await abrir(null, {conta:true, nuvem:nv});
  await page.click('[data-act="authTela"][data-v="criar"]');
  await page.fill('#aNome','Ana'); await page.fill('#aEmail','ana@teste.com'); await page.fill('#aSenha','abc123'); await page.fill('#aSenha2','abc124');
  await page.click('[data-act="authCriar"]');
  assert.match(await page.textContent('.auth-erro'), /não conferem/);
  await page.fill('#aSenha2','abc123'); await page.click('[data-act="authCriar"]');
  await page.waitForSelector('text=Veja seu e-mail');
  assert.ok(nv.users.has('ana@teste.com'));
  await page.click('[data-act="authTela"][data-v="entrar"]');
  await page.click('[data-act="authTela"][data-v="esqueci"]');
  await page.fill('#aEmail','ana@teste.com'); await page.click('[data-act="authEsqueci"]');
  await page.waitForSelector('text=Veja seu e-mail');
  // o link do e-mail volta para o app com a sessão no endereço
  const u = nv.users.get('ana@teste.com');
  await page.goto('about:blank');   // carrega o app do zero, como ao tocar no link do e-mail
  await page.goto(BASE + '#access_token=tok-'+u.id+'&refresh_token=r&expires_in=3600&type=recovery');
  await page.waitForSelector('[data-act="authNovaSenha"]');
  assert.equal(await page.evaluate(()=>location.hash), '', 'o token sai do endereço');
  await page.fill('#aSenha','nova123'); await page.fill('#aSenha2','nova123'); await page.click('[data-act="authNovaSenha"]');
  await page.waitForSelector('.hero');
  assert.equal(u.senha, 'nova123');
  await ctx.close();
});

test('fatura com compras de outro mês: aviso na lista e o cartão mostra as compras', async()=>{
  // fecha dia 1 e vence dia 10: a fatura que vence neste mês é das compras do mês passado
  const {page, ctx} = await abrir(estado({cartoes:[{id:'k1', nome:'Bradesco', fechamento:1, vencimento:31}],
    gastos:[{id:'g1', data:ym(-1)+'-15', valor:500, cat:'mercado', meio:'cartao', cartao:'k1', desc:'Compra grande', criado:1}]}));
  assert.match(await page.textContent('#listaTit'), /\(0\)/);
  assert.match(await page.textContent('.note.fora'), /500,00/, 'avisa de onde vem o valor da fatura');
  await page.click('.ccard[data-act="verFatura"]');
  await page.waitForSelector('#dlg[open]');
  assert.match(await page.textContent('#dlg'), /Compra grande/);
  assert.match(await page.textContent('#dlg .fat-total'), /500,00/);
  await page.click('#dlg [data-act="editL"]');
  assert.equal(await page.isVisible('#dlg'), false);
  assert.equal(await page.inputValue('#gValor'), '500');
  await ctx.close();
});

test('faixa de meses no Início: mostra a sobra de cada mês e troca o mês ao tocar', async()=>{
  const {page, ctx} = await abrir(estado({gastos:[{id:'g1', data:ym(-1)+'-05', valor:1300, cat:'mercado', meio:'pix', desc:'x', criado:1}]}));   // renda 1000
  const chip = k => page.textContent(`.mes-chip[data-m="${k}"] b`);
  assert.match(await chip(ym(0)), /1 mil/);
  assert.match(await chip(ym(-1)), /−300/, 'mês passado ficou negativo');
  assert.ok(await page.$(`.mes-chip.fut[data-m="${ym(1)}"]`), 'meses seguintes como previsão');
  await page.click(`.mes-chip[data-m="${ym(-1)}"]`);
  assert.equal(await page.getAttribute(`.mes-chip[data-m="${ym(-1)}"]`, 'aria-pressed'), 'true');
  assert.match(await page.textContent('.big'), /300/);
  assert.match(await page.textContent('#lista'), /x/);
  await ctx.close();
});

test('contas: saldo atualiza sozinho com pix, entradas, renda, fixos e fatura paga', async()=>{
  const ontem = iso(-1), pd = ym(-1)+'-01';
  const {page, ctx, errors} = await abrir(estado({config:{renda:1000, configurado:true, ultimoBackup:iso(0), diaRenda:1},
    cartoes:[{id:'k1', nome:'Nubank', fechamento:1, vencimento:31}],
    // saldo informado no dia 1 do mês passado: a renda daquele dia já estava no saldo; a deste mês (dia 1) entra sozinha
    contas:[{id:'c1', nome:'Conta A', saldo:2000, desde:pd, desdeTs:Date.now()}],
    gastos:[{id:'g0', data:ym(-1)+'-15', valor:300, cat:'mercado', meio:'cartao', cartao:'k1', desc:'compra cartão', criado:1}],
    recorrentes:[{id:'r1', nome:'Aluguel', valor:500, tipo:'fixo', meio:'pix', inicio:ym(-1), cat:'outros', dia:31}]}));
  const saldoTela = async () => (await page.textContent('.contas .saldo')).replace(/\s/g,' ');
  // 2000 + renda deste mês (1000) − aluguel do mês passado (dia 31 → último dia) = 2500
  assert.equal(await saldoTela(), brl(2500).replace(/\s/g,' '));
  await aba(page,'lancar'); await page.click('[data-act="dMeio"][data-id="pix"]'); await page.fill('#gValor','100'); await page.click('[data-act="saveG"]');
  await page.click('[data-act="dTipo"][data-v="entrada"]'); await page.fill('#gValor','40'); await page.click('[data-act="saveG"]');
  await aba(page,'inicio');
  assert.equal(await saldoTela(), brl(2440).replace(/\s/g,' '));
  // fim do mês: − aluguel deste mês (500) − fatura de 300 ainda não paga
  assert.match((await page.textContent('.contas .fim')).replace(/\s/g,' '), new RegExp(brl(1640).replace(/\s/g,' ').replace(/[.$]/g,'\\$&')));
  // pagar a fatura desconta do saldo
  await page.click('[data-act="pagaFat"]');
  assert.equal(await saldoTela(), brl(2140).replace(/\s/g,' '));
  assert.equal((await lerEstado(page)).cartoes[0].pagtos[ym(0)].conta, 'c1');
  // extrato e corrigir saldo
  await page.click('[data-act="verConta"]'); await page.waitForSelector('#dlg[open]');
  assert.match(await page.textContent('#dlg'), /Aluguel/);
  assert.match(await page.textContent('#dlg'), /Fatura Nubank/);
  await page.click('[data-act="corrigirSaldo"]'); await page.fill('#dlg-v','2000'); await page.click('[data-dlg="ok"]');
  assert.equal(await saldoTela(), brl(2000).replace(/\s/g,' '));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('contas: criar em Ajustes e, com duas contas, escolher de qual conta saiu', async()=>{
  const {page, ctx} = await abrir(estado());
  await page.click('[data-act="novaConta"]');
  await page.fill('#cNome','Nubank'); await page.fill('#cSaldo','1000'); await page.click('[data-act="salvarConta"]');
  await page.click('[data-act="edConta"][data-id="novo"]');
  await page.fill('#cNome','Itaú'); await page.fill('#cSaldo','500'); await page.click('[data-act="salvarConta"]');
  const s = await lerEstado(page); const itau = s.contas.find(c=>c.nome==='Itaú');
  await aba(page,'lancar'); await page.click('[data-act="dMeio"][data-id="pix"]');
  await page.click(`[data-act="dConta"][data-id="${itau.id}"]`);
  await page.fill('#gValor','50'); await page.click('[data-act="saveG"]');
  assert.equal((await lerEstado(page)).gastos[0].conta, itau.id);
  await aba(page,'inicio');
  assert.match(await page.textContent('.contas'), /Itaú/);
  assert.match((await page.textContent('.contas .saldo')).replace(/\s/g,' '), /1\.450,00/);
  assert.match(await page.textContent('#lista'), /Pix · Itaú/);
  await ctx.close();
});

test('fatura: apagar compra pela lista do cartão, com desfazer, e ir ao fixo da parcela', async()=>{
  const {page, ctx} = await abrir(estado({cartoes:[{id:'k1', nome:'Bradesco', fechamento:1, vencimento:31}],
    gastos:[{id:'g1', data:ym(-1)+'-15', valor:500, cat:'mercado', meio:'cartao', cartao:'k1', desc:'Compra errada', criado:1},
            {id:'g2', data:ym(-1)+'-16', valor:80, cat:'mercado', meio:'cartao', cartao:'k1', desc:'Outra', criado:2}],
    recorrentes:[{id:'r1', nome:'TV', valor:100, tipo:'parcela', parcelas:5, meio:'cartao', cartao:'k1', inicio:ym(0), cat:'compras'}]}));
  await page.click('.ccard[data-act="verFatura"]'); await page.waitForSelector('#dlg[open]');
  assert.match(await page.textContent('#dlg .fat-total'), /680,00/);
  await page.click('#dlg [data-act="delL"][data-id="g1"]');
  assert.equal((await lerEstado(page)).gastos.length, 1);
  assert.ok(await page.isVisible('#dlg'), 'a janela continua aberta');
  assert.match(await page.textContent('#dlg .fat-total'), /180,00/, 'o total atualiza na hora');
  assert.ok(await page.isVisible('#dlg #toast button'), 'o Desfazer aparece por cima da janela');
  await page.click('#dlg #toast button');
  assert.equal((await lerEstado(page)).gastos.length, 2);
  assert.match(await page.textContent('#dlg .fat-total'), /680,00/);
  await page.click('#dlg [data-act="irFixo"][data-id="r1"]');
  assert.equal(await page.isVisible('#dlg'), false);
  assert.equal(await page.inputValue('#rNome'), 'TV');
  await ctx.close();
});
