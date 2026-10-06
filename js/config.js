export const KEY = 'meucaixa.v1';
// categorias padrão; as do usuário ficam em S.cats (editáveis em Ajustes)
export const CATS = [
  {id:'delivery', n:'Delivery / iFood', c:'#ef4444'},
  {id:'mercado',  n:'Mercado',          c:'#22c55e'},
  {id:'restaurante', n:'Restaurante / Lanche', c:'#f97316'},
  {id:'carro',    n:'Carro / Combustível', c:'#3b82f6'},
  {id:'transporte', n:'Uber / Transporte', c:'#06b6d4'},
  {id:'saude',    n:'Saúde / Farmácia', c:'#14b8a6'},
  {id:'assinaturas', n:'Assinaturas',   c:'#a855f7'},
  {id:'compras',  n:'Compras',          c:'#ec4899'},
  {id:'lazer',    n:'Lazer',            c:'#eab308'},
  {id:'educacao', n:'Cursos / Educação', c:'#6366f1'},
  {id:'trabalho', n:'Trabalho / MEI',   c:'#64748b'},
  {id:'outros',   n:'Outros',           c:'#94a3b8'}
];
export const MEIOS = [{id:'cartao',n:'Cartão'},{id:'pix',n:'Pix'},{id:'debito',n:'Débito'},{id:'dinheiro',n:'Dinheiro'},{id:'boleto',n:'Boleto'}];
// autocategorização da importação de CSV, pelo nome do estabelecimento
export const RULES = [
  [/IFOOD|IFD\*|RAPPI|UBER ?EATS|AIQFOME|ZE DELIVERY/i,'delivery'],
  [/UBER|99 ?APP|99POP|CABIFY/i,'transporte'],
  [/POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUST|ESTACION/i,'carro'],
  [/MERCAD|SUPERMERC|ATACAD|ASSAI|CARREFOUR|PAO DE ACUCAR|CONFIANCA|TAUSTE|HORTIFRUT/i,'mercado'],
  [/FARMA|DROGA|RAIA|PACHECO|PAGUE MENOS|HOSPITAL|CLINICA|LABORAT/i,'saude'],
  [/NETFLIX|SPOTIFY|PRIME|YOUTUBE|APPLE\.COM|GOOGLE|DISNEY|HBO|MAX|DEEZER|CANVA|ADOBE|OPENAI|CHATGPT|CLAUDE/i,'assinaturas'],
  [/HUBLA|HOTMART|KIWIFY|EDUZZ|UDEMY|HTM\*|CURSO/i,'educacao'],
  [/MC ?DONALD|BURGER|LANCH|PIZZ|RESTAUR|BAR |PADARIA|CAFE|SUBWAY|HABIB/i,'restaurante'],
  [/MERCADOLIVRE|MERCADO LIVRE|SHOPEE|AMAZON|MAGAZINE|SHEIN|ALIEXPRESS|AMERICANAS/i,'compras']
];

// tipos de investimento; `fixa` separa renda fixa de renda variável no resumo
export const TIPOS_INV = [
  {id:'cdb',       n:'CDB',                 c:'#5ab0ff', fixa:true},
  {id:'lci',       n:'LCI / LCA',           c:'#5fd4b4', fixa:true},
  {id:'tesouro',   n:'Tesouro Direto',      c:'#ffb547', fixa:true},
  {id:'poupanca',  n:'Poupança',            c:'#d4f25a', fixa:true},
  {id:'rf',        n:'Outra renda fixa',    c:'#8ecae6', fixa:true},
  {id:'acoes',     n:'Ações',               c:'#ff7a6b', fixa:false},
  {id:'fii',       n:'Fundos imobiliários', c:'#c3b1ff', fixa:false},
  {id:'fundos',    n:'Fundos',              c:'#f472b6', fixa:false},
  {id:'cripto',    n:'Cripto',              c:'#f59e0b', fixa:false},
  {id:'previdencia', n:'Previdência',       c:'#94a3b8', fixa:true},
  {id:'outros',    n:'Outros',              c:'#64748b', fixa:false}
];
export const tipoInv = id => TIPOS_INV.find(t=>t.id===id) || TIPOS_INV[TIPOS_INV.length-1];

// degradês disponíveis para os cartões (classes .cc-* no CSS)
export const CORES_CARTAO = ['brasa','lilas','lima','oceano','grafite'];

export const meioOf = id => (MEIOS.find(m=>m.id===id)||{n:id}).n;
