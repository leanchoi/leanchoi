import path from 'path';

// ── Entrega segura de archivos subidos ───────────────────────────────────
//
// El mime que se guardaba en `attachments.mime` viene del navegador que sube
// (`file.type`), o sea del cliente. Devolverlo tal cual con
// `Content-Disposition: inline` permitía subir un archivo declarado como
// text/html (o un .svg, que puede llevar <script>) y abrirlo en el mismo
// origen que la app: XSS almacenado con la cookie de sesión de quien lo abra.
//
// Regla: sólo se muestran embebidos los formatos que no ejecutan código.
// Todo lo demás se fuerza a descarga, con nosniff para que el navegador no
// adivine el tipo por su cuenta.

/** Tipos que es seguro renderizar embebidos (no ejecutan script). */
const INLINE_SAFE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
]);

/** Mime por extensión, ignorando lo que declare el cliente. */
const BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

export type ServedFile = {
  contentType: string;
  /** true si se puede mostrar embebido; false ⇒ hay que forzar descarga */
  inlineSafe: boolean;
};

/**
 * Resuelve el Content-Type a partir de la EXTENSIÓN del archivo guardado,
 * no del mime que mandó el cliente.
 */
export function resolveContentType(filename: string): ServedFile {
  const ext = path.extname(filename || '').toLowerCase();
  const contentType = BY_EXT[ext];
  if (contentType && INLINE_SAFE.has(contentType.split(';')[0])) {
    return { contentType, inlineSafe: true };
  }
  // .svg, .html, .xml y cualquier desconocido: octet-stream + descarga
  return { contentType: 'application/octet-stream', inlineSafe: false };
}

/** Cabeceras de respuesta para servir un archivo subido. */
export function fileHeaders(opts: {
  filename: string;
  /** El pedido quiere verlo embebido (?inline=1) */
  wantsInline: boolean;
  size?: number;
  cacheSeconds?: number;
}): Record<string, string> {
  const { contentType, inlineSafe } = resolveContentType(opts.filename);
  const inline = opts.wantsInline && inlineSafe;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
    // Sin esto, Chrome puede "adivinar" HTML en un octet-stream y ejecutarlo
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': `private, max-age=${opts.cacheSeconds ?? 3600}`,
  };
  if (opts.size != null) headers['Content-Length'] = String(opts.size);
  return headers;
}

/** Nombre de archivo sin separadores de ruta ni `..` */
export function sanitizeFilename(name: string): string {
  return (name || '')
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    .slice(0, 200);
}
