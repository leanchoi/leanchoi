/**
 * Genera los iconos PNG de la PWA sin dependencias: dibuja una casita sobre fondo
 * oscuro y arma el PNG a mano con zlib.
 *
 *   node scripts/generar-iconos.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FONDO = [15, 23, 42]; // slate-900
const TRAZO = [248, 250, 252]; // slate-50

function dibujar(tamanio, margen) {
  const pixeles = Buffer.alloc(tamanio * tamanio * 4);
  const u = tamanio / 100;
  const centro = tamanio / 2;
  const interior = tamanio - margen * 2;

  const techoY = margen + interior * 0.28;
  const baseY = margen + interior * 0.78;
  const paredIzq = margen + interior * 0.22;
  const paredDer = margen + interior * 0.78;
  const grosor = Math.max(2, u * 5);

  for (let y = 0; y < tamanio; y += 1) {
    for (let x = 0; x < tamanio; x += 1) {
      let color = FONDO;

      // Techo: dos diagonales desde el vértice superior.
      const anchoTecho = paredDer - paredIzq;
      const alturaTecho = techoY - margen - interior * 0.06;
      if (y >= margen + interior * 0.06 && y <= techoY) {
        const avance = (y - (margen + interior * 0.06)) / alturaTecho;
        const izq = centro - (anchoTecho / 2) * avance;
        const der = centro + (anchoTecho / 2) * avance;
        if (Math.abs(x - izq) < grosor || Math.abs(x - der) < grosor) color = TRAZO;
      }

      // Paredes y piso.
      if (y >= techoY && y <= baseY) {
        if (Math.abs(x - paredIzq) < grosor || Math.abs(x - paredDer) < grosor) color = TRAZO;
      }
      if (Math.abs(y - baseY) < grosor && x >= paredIzq - grosor && x <= paredDer + grosor) {
        color = TRAZO;
      }

      // Puerta.
      const puertaIzq = centro - interior * 0.1;
      const puertaDer = centro + interior * 0.1;
      const puertaTop = margen + interior * 0.52;
      if (y >= puertaTop && y <= baseY) {
        if (Math.abs(x - puertaIzq) < grosor * 0.8 || Math.abs(x - puertaDer) < grosor * 0.8) {
          color = TRAZO;
        }
        if (Math.abs(y - puertaTop) < grosor * 0.8 && x >= puertaIzq && x <= puertaDer)
          color = TRAZO;
      }

      const i = (y * tamanio + x) * 4;
      pixeles[i] = color[0];
      pixeles[i + 1] = color[1];
      pixeles[i + 2] = color[2];
      pixeles[i + 3] = 255;
    }
  }
  return pixeles;
}

function crc32(buffer) {
  let c;
  const tabla = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(tamanio, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanio, 0);
  ihdr.writeUInt32BE(tamanio, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const filas = Buffer.alloc((tamanio * 4 + 1) * tamanio);
  for (let y = 0; y < tamanio; y += 1) {
    filas[y * (tamanio * 4 + 1)] = 0; // filtro none
    pixeles.copy(filas, y * (tamanio * 4 + 1) + 1, y * tamanio * 4, (y + 1) * tamanio * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [nombre, tamanio, margen] of [
  ['icono-192.png', 192, 24],
  ['icono-512.png', 512, 64],
  // Maskable: más margen, para que el recorte circular de Android no coma la casa.
  ['icono-maskable-512.png', 512, 110],
]) {
  const ruta = resolve(process.cwd(), 'public', nombre);
  writeFileSync(ruta, png(tamanio, dibujar(tamanio, margen)));
  console.log(`✔ ${nombre}`);
}
