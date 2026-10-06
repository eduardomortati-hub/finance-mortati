# Meu Caixa

Controle financeiro pessoal em PWA: gastos, fatura do cartão, fixos e parcelas, metas e limites por categoria.

**Privacidade:** não há servidor, login, analytics ou bibliotecas de terceiros. Os dados ficam só no `localStorage` do aparelho; este repositório contém apenas o código. A Content-Security-Policy do `index.html` bloqueia qualquer conexão de rede feita pelo app (`connect-src 'none'`).

## Usar
Abra o endereço do GitHub Pages no celular e use **Adicionar à tela inicial** (Safari no iPhone, Chrome no Android). Depois de instalado, funciona offline.

Para levar dados de um aparelho para outro, use **Ajustes → Exportar backup** e **Importar backup**. No iPhone, o app instalado tem armazenamento separado do Safari: importe o backup de dentro do app.

## Desenvolver
Os arquivos usam módulos ES, então precisam de um servidor local (abrir o `index.html` direto não funciona):

```
npx serve .
```

- `js/config.js` — categorias, meios de pagamento, regras de autocategorização do CSV
- `js/store.js` — leitura e gravação dos dados
- `js/finance.js` — fatura, parcelas e cálculos do mês
- `js/views.js` — telas
- `js/actions.js` — ações dos botões
- `js/import.js` — importação de backup e CSV
- `sw.js` — cache offline. **Ao publicar mudanças, aumente `VERSION`** para o app oferecer a atualização.
- `tools/make-icons.mjs` — gera os ícones (`node tools/make-icons.mjs`)
