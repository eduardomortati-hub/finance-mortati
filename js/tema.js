// Tema claro/escuro. Carregado no <head> sem defer, para a página já abrir na cor certa (sem piscar).
// A escolha fica só neste aparelho; sem escolha, segue o tema do sistema.
(function(){
  const KEY = 'meucaixa.tema', mq = matchMedia('(prefers-color-scheme: light)');
  const salvo = () => { try{ return localStorage.getItem(KEY); }catch(e){ return null; } };
  function aplicar(t){
    document.documentElement.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if(m) m.content = t==='light' ? '#eeede5' : '#000000';
  }
  aplicar(salvo() || (mq.matches ? 'light' : 'dark'));
  mq.addEventListener?.('change', e=>{ if(!salvo()) aplicar(e.matches ? 'light' : 'dark'); });

  // chamado pelo botão de lua/sol
  window.alternarTema = function(){
    const t = document.documentElement.dataset.theme==='light' ? 'dark' : 'light', html = document.documentElement;
    html.classList.add('trocando');                 // transição suave só durante a troca
    aplicar(t);
    try{ localStorage.setItem(KEY, t); }catch(e){}
    clearTimeout(window.alternarTema._t);
    window.alternarTema._t = setTimeout(()=>html.classList.remove('trocando'), 450);
    return t;
  };
})();
