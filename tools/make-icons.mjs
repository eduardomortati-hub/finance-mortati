// Gera os ícones do PWA sem dependências: `node tools/make-icons.mjs`
// Desenho: três barras verdes crescentes sobre fundo escuro (cores do app).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0f, 0x11, 0x15], FG = [0x4a, 0xde, 0x80];
// barras em coordenadas 0..1 (x, largura, altura), base em y = 0.72
const BARS = [[0.26, 0.12, 0.20], [0.44, 0.12, 0.32], [0.62, 0.12, 0.46]];
const BASE = 0.72, BAR_R = 0.03;

function inRoundRect(x, y, x0, y0, x1, y1, r){
  if(x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// scale < 1 encolhe o desenho para a zona segura do ícone "maskable"; corner = raio do fundo (0 = quadrado cheio)
function draw(size, {scale = 1, corner = 0} = {}){
  const SS = 4, px = Buffer.alloc(size * size * 4);
  for(let j = 0; j < size; j++) for(let i = 0; i < size; i++){
    let bg = 0, fg = 0;
    for(let sj = 0; sj < SS; sj++) for(let si = 0; si < SS; si++){
      const x = (i + (si + .5) / SS) / size, y = (j + (sj + .5) / SS) / size;
      if(!inRoundRect(x, y, 0, 0, 1, 1, corner)) continue;
      bg++;
      const u = .5 + (x - .5) / scale, v = .5 + (y - .5) / scale;
      if(BARS.some(([bx, bw, bh]) => inRoundRect(u, v, bx, BASE - bh, bx + bw, BASE, BAR_R))) fg++;
    }
    const n = SS * SS, o = (j * size + i) * 4;
    for(let c = 0; c < 3; c++) px[o + c] = Math.round(bg ? (BG[c] * (bg - fg) + FG[c] * fg) / bg : 0);
    px[o + 3] = Math.round(255 * bg / n);
  }
  return png(size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for(const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for(let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0f1115"/>${
  BARS.map(([x, w, h]) => `<rect x="${x * 100}" y="${(BASE - h) * 100}" width="${w * 100}" height="${h * 100}" rx="${BAR_R * 100}" fill="#4ade80"/>`).join('')}</svg>\n`;

const out = new URL('../icons/', import.meta.url);
mkdirSync(out, {recursive: true});
writeFileSync(new URL('icon.svg', out), svg);
writeFileSync(new URL('icon-192.png', out), draw(192, {corner: .22}));
writeFileSync(new URL('icon-512.png', out), draw(512, {corner: .22}));
writeFileSync(new URL('icon-maskable-512.png', out), draw(512, {scale: .8}));
writeFileSync(new URL('apple-touch-icon.png', out), draw(180)); // iOS arredonda sozinho e não aceita transparência
console.log('ícones gerados em icons/');
