/**
 * Paridad de JWT entre Hostinger (PHP) y el VPS (Node).
 *
 * El stack dual se apoya entero en que estas dos implementaciones firmen y
 * verifiquen exactamente igual. Esta prueba lo comprueba en las dos direcciones
 * y verifica que un token adulterado se caiga de los dos lados.
 *
 * Ejecutar:  npm run test:jwt   (requiere PHP 8.1+ en el PATH)
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { issueToken, verifyToken } from '../../server-vps/src/auth/jwt.ts';
import type { UserJWT } from '../../shared/index.ts';

const SECRET = 'secreto-compartido-esquel-2027-hostinger-vps';
const ISSUER = 'https://esquel2027.ar';
const cli = fileURLToPath(new URL('../../backend-php/tests/jwt-cli.php', import.meta.url));

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const php = (args: string[]): string => execFileSync('php', [cli, ...args], { encoding: 'utf8' }).trim();

const verifyOptions = {
  secret: SECRET,
  issuer: ISSUER,
  audience: 'esquel-realtime',
  clockToleranceS: 60,
};

console.log('\n— paridad de JWT entre PHP y Node —\n');

/* 1. PHP firma → Node verifica ------------------------------------------- */
const tokenDePhp = php(['issue', SECRET]);
const verificadoEnNode = verifyToken(tokenDePhp, verifyOptions);
check(
  'Node acepta el token que firmó PHP',
  verificadoEnNode.ok,
  verificadoEnNode.ok ? `alias "${verificadoEnNode.claims.alias}", rango ${verificadoEnNode.claims.rankTier}` : verificadoEnNode.detail,
);

if (verificadoEnNode.ok) {
  const c = verificadoEnNode.claims;
  check(
    'El payload trae los claims de juego que espera la sala',
    c.userId === '4242' && c.characterId === '8484' && c.factionId === 3 && c.barrio === 'ceferino',
    `userId=${c.userId} characterId=${c.characterId} factionId=${c.factionId} barrio=${c.barrio}`,
  );
  check('El token declara el ámbito game:play', (c.scopes ?? []).includes('game:play'));
}

/* 2. Node firma → PHP verifica ------------------------------------------- */
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: ISSUER,
  aud: ['esquel-api', 'esquel-realtime'],
  sub: '777',
  jti: 'parity-test',
  iat: now,
  nbf: now - 5,
  exp: now + 600,
  nick: 'Marta la Concejala',
  role: 'player',
  scopes: ['game:play'],
  userId: '777',
  characterId: '999',
  alias: 'Marta la Concejala',
  factionId: 2,
  rankTier: 5,
  barrio: 'centro',
  mode: 'ciudadano',
  telemetryConsent: true,
  consentVersion: 1,
  bind: '0'.repeat(16),
} as unknown as UserJWT;

const tokenDeNode = issueToken(claims, SECRET);
let phpOk = false;
let phpDetalle = '';
try {
  phpDetalle = php(['verify', SECRET, tokenDeNode]);
  phpOk = JSON.parse(phpDetalle).ok === true;
} catch (err) {
  phpDetalle = err instanceof Error ? err.message : String(err);
}
check('PHP acepta el token que firmó Node', phpOk, phpOk ? 'con acentos y todo' : phpDetalle);

/* 3. Token adulterado ----------------------------------------------------- */
const [header, payload] = tokenDeNode.split('.');
const adulterado = `${header}.${payload}.firmaFalsaFalsaFalsaFalsaFalsaFalsaFalsa`;

const nodeRechaza = verifyToken(adulterado, verifyOptions);
check('Node rechaza una firma falsa', !nodeRechaza.ok, nodeRechaza.ok ? '' : nodeRechaza.reason);

let phpRechaza = false;
try {
  php(['verify', SECRET, adulterado]);
} catch {
  phpRechaza = true; // exit code 1
}
check('PHP rechaza la misma firma falsa', phpRechaza);

/* 4. Secreto distinto ----------------------------------------------------- */
const conOtroSecreto = verifyToken(tokenDePhp, { ...verifyOptions, secret: 'otro-secreto-cualquiera' });
check('Un secreto distinto no abre la puerta', !conOtroSecreto.ok, conOtroSecreto.ok ? '' : conOtroSecreto.reason);

/* 5. Expirado -------------------------------------------------------------- */
const vencido = issueToken({ ...claims, exp: now - 3600, iat: now - 7200 } as UserJWT, SECRET);
const rechazoVencido = verifyToken(vencido, verifyOptions);
check('Un token vencido se rechaza', !rechazoVencido.ok, rechazoVencido.ok ? '' : rechazoVencido.reason);

const fallidas = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - fallidas.length}/${results.length} verificaciones en verde`);
if (fallidas.length > 0) {
  console.error('\n  FALLAS:');
  for (const f of fallidas) console.error(`   ✗ ${f.name} ${f.detail}`);
  process.exit(1);
}
console.log('  ✓ PHP y Node hablan el mismo JWT.\n');
