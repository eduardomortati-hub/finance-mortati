# Meu Caixa

Controle financeiro pessoal em PWA: gastos e entradas, vários cartões (fatura, vencimento e melhor dia de compra de cada um), fixos e parcelas (com encerramento e reajuste), metas, limites e categorias editáveis, histórico mensal e busca.

**Privacidade:** sem analytics nem bibliotecas de terceiros. Os dados ficam no `localStorage` do aparelho e o app funciona sem internet. Com conta (opcional), eles também vão para o Supabase do dono do app (`js/nuvem.js`): login por e-mail e senha, e cada pessoa só acessa a própria linha da tabela `dados` (regras RLS no banco). Sem conta, nada sai do aparelho. A Content-Security-Policy do `index.html` só permite conexão com esse Supabase. O backup pode ser protegido com senha (AES-GCM 256 + PBKDF2, tudo no navegador).

## Usar
Abra o endereço do GitHub Pages no celular e use **Adicionar à tela inicial** (Safari no iPhone, Chrome no Android). Depois de instalado, funciona offline. No iPhone, instale: aberto só no Safari, o sistema pode apagar os dados após 7 dias sem uso.

Com conta, celular e computador mostram os mesmos dados. Sem conta, para levar dados de um aparelho para outro, use **Ajustes → Exportar backup** e **Importar backup**. No iPhone, o app instalado tem armazenamento separado do Safari: importe o backup de dentro do app.

## Desenvolver
Os arquivos usam módulos ES, então precisam de um servidor local (abrir o `index.html` direto não funciona):

```
npm install     # instala o Playwright (testes) e o pre-commit
npm start       # http://localhost:5174
npm test        # testes de ponta a ponta no Edge (BROWSER=chrome para usar o Chrome)
```

- `js/config.js` — categorias padrão, meios de pagamento, regras de autocategorização do CSV
- `js/model.js` — formato dos dados, migração de versões antigas e validação de backups
- `js/store.js` — leitura e gravação dos dados (guarda uma cópia antes de migrar)
- `js/finance.js` — fatura por cartão, vencimento e melhor dia de compra, parcelas, fixos, entradas, metas e cálculos do mês
- `js/views.js` — telas · `js/actions.js` — ações dos botões · `js/modal.js` — janela de diálogo
- `js/import.js` — importação de backup e CSV · `js/crypto.js` — backup com senha
- `sw.js` — cache offline. `VERSION` é um hash dos arquivos gerado por `tools/stamp-sw.mjs`, que roda sozinho no pre-commit. **Arquivo novo precisa entrar em `FILES`** (o teste avisa se faltar).
- `tools/make-icons.mjs` — gera os ícones (`npm run icons`)

## Design
Modo escuro (preto, grafite, limão e lilás) e modo claro (papel esverdeado, tinta verde-escura, blocos chapados), conforme o tema do aparelho. Os tokens de cor, raio e fonte ficam no topo de `css/style.css`. Os cartões de crédito usam os degradês `.cc-*` (escolhidos em Ajustes).

Fontes servidas pelo próprio app, sem carregar nada de fora: Hanken Grotesk (interface) e Instrument Serif (números grandes no modo claro), ambas sob a SIL Open Font License — licenças em `fonts/`.
