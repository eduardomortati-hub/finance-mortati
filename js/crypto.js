// Backup protegido por senha: AES-GCM 256 com chave derivada por PBKDF2-SHA256.
// Tudo roda no próprio navegador (Web Crypto). Sem a senha, o arquivo não pode ser aberto.
const ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();

function b64(bytes){
  bytes = new Uint8Array(bytes); let s = '';
  for(let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));

async function chave(senha, salt, iter){
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

export const ehCifrado = d => !!d && d.formato==='meucaixa-cifrado';

export async function cifrar(texto, senha){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await chave(senha, salt, ITER), enc.encode(texto));
  return JSON.stringify({formato:'meucaixa-cifrado', v:1, kdf:'PBKDF2-SHA256', iter:ITER, cifra:'AES-GCM-256', salt:b64(salt), iv:b64(iv), dados:b64(dados)});
}

export async function decifrar(d, senha){
  if(!Number.isInteger(d.iter) || d.iter < 100000 || d.iter > 5000000) throw new Error('Arquivo de backup inválido');
  try{
    const k = await chave(senha, unb64(d.salt), d.iter);
    return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(d.iv)}, k, unb64(d.dados)));
  }catch(e){ throw new Error('Senha incorreta ou arquivo danificado'); }
}
