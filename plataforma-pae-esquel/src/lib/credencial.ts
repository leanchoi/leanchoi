import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "trocha-secret-credencial-2026";

/**
 * Genera un código de verificación alfanumérico legible para la credencial comunitaria.
 */
export function generarCodigoCredencial(postulacionId: string, cicloAnio: number): string {
  const hash = crypto
    .createHmac("sha256", SECRET)
    .update(`${postulacionId}-${cicloAnio}-${Date.now()}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `TR-${cicloAnio}-${hash}`;
}

/**
 * Genera un token QR firmado temporal para el check-in en sede.
 * Validez corta (ej. 5 minutos) para evitar fotografiar y reutilizar desde casa.
 */
export function generarTokenSedeQR(sedeId: string, ventanaMinutos = 5): string {
  const expiraEn = Math.floor(Date.now() / 1000) + ventanaMinutos * 60;
  const payload = `${sedeId}:${expiraEn}`;
  const firma = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${firma}`).toString("base64url");
}

/**
 * Valida un token QR escaneado en la sede.
 */
export function validarTokenSedeQR(token: string): { valido: boolean; sedeId?: string; error?: string } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [sedeId, expiraStr, firma] = raw.split(":");
    const expiraEn = parseInt(expiraStr, 10);

    if (Date.now() / 1000 > expiraEn) {
      return { valido: false, error: "El código QR ha expirado. Escanee el código actualizado de la sede." };
    }

    const payload = `${sedeId}:${expiraEn}`;
    const firmaEsperada = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 16);

    if (firma !== firmaEsperada) {
      return { valido: false, error: "Firma de código QR inválida." };
    }

    return { valido: true, sedeId };
  } catch {
    return { valido: false, error: "Formato de token de sede corrupto o inválido." };
  }
}