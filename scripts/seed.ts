/**
 * Carga los datos iniciales: barrios de Esquel y cuestionario v1.
 *
 *   npm run db:seed
 *
 * Es idempotente: correrlo dos veces no duplica nada.
 *
 * Con SEED_DEMO=true agrega además usuarios de prueba y viviendas ficticias para
 * poder recorrer el sistema en desarrollo. NUNCA activar SEED_DEMO en producción.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { closePool } from '@/db/client';
import { BARRIOS_ESQUEL } from '@/db/datos/barrios-esquel';
import { barrios, cuestionarios, encuestadores, usuarios, viviendas } from '@/db/schema';
import { segundosTotales, verificarCuestionario } from '@/lib/cuestionario/basico';
import type { CuestionarioBasico } from '@/lib/cuestionario/basico';
import { getEnv } from '@/lib/env';

const RUTA_CUESTIONARIO = resolve(process.cwd(), 'docs/cuestionario-v1.json');
const VIVIENDAS_DEMO_POR_BARRIO = 12;

async function sembrarBarrios(): Promise<number> {
  const filas = await getDb()
    .insert(barrios)
    .values(BARRIOS_ESQUEL.map((b) => ({ id: uuidv7(), nombre: b.nombre, slug: b.slug })))
    .onConflictDoNothing({ target: barrios.slug })
    .returning({ id: barrios.id });
  return filas.length;
}

async function sembrarCuestionario(): Promise<'insertado' | 'ya_estaba'> {
  const crudo = await readFile(RUTA_CUESTIONARIO, 'utf8');
  const definicion = JSON.parse(crudo) as CuestionarioBasico;

  const problemas = verificarCuestionario(definicion);
  if (problemas.length > 0) {
    throw new Error(
      `El cuestionario de docs/cuestionario-v1.json no se puede cargar:\n${problemas
        .map((p) => `  - ${p}`)
        .join('\n')}`,
    );
  }

  const total = segundosTotales(definicion);
  const filas = await getDb()
    .insert(cuestionarios)
    .values({
      id: uuidv7(),
      version: definicion.version,
      definicion,
      consentimientoVersion: definicion.consentimiento.version,
      segundosTotales: total,
      changelog: definicion.changelog ?? '',
      publicadoEn: new Date(),
    })
    .onConflictDoNothing({ target: cuestionarios.version })
    .returning({ version: cuestionarios.version });

  console.log(
    `  · duración declarada: ${total} s (${(total / 60).toFixed(1)} min de 12) · ` +
      `consentimiento ${definicion.consentimiento.version}`,
  );
  return filas.length > 0 ? 'insertado' : 'ya_estaba';
}

async function sembrarDemo(): Promise<void> {
  const env = getEnv();
  const password = env.SEED_DEMO_PASSWORD ?? randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 10);

  const db = getDb();
  const listaBarrios = await db.select({ id: barrios.id, slug: barrios.slug }).from(barrios);
  const primero = listaBarrios.find((b) => b.slug === '28-de-junio') ?? listaBarrios[0];
  if (!primero) throw new Error('No hay barrios cargados: corré el seed de barrios primero.');

  const definiciones = [
    {
      usuario: 'admin.demo',
      nombre: 'Admin de prueba',
      rol: 'admin' as const,
      barrioId: null,
      area: null,
    },
    {
      usuario: 'conduccion.demo',
      nombre: 'Conducción de prueba',
      rol: 'conduccion' as const,
      barrioId: null,
      area: null,
    },
    {
      usuario: 'obras.demo',
      nombre: 'Área Obras (prueba)',
      rol: 'area' as const,
      barrioId: null,
      area: 'Secretaría de Obras Públicas',
    },
    {
      usuario: 'coordinador.demo',
      nombre: 'Presidencia de junta (prueba)',
      rol: 'coordinador_barrio' as const,
      barrioId: primero.id,
      area: null,
    },
    {
      usuario: 'encuestador.demo',
      nombre: 'Encuestador de prueba',
      rol: 'encuestador' as const,
      barrioId: primero.id,
      area: null,
    },
  ];

  const insertados = await db
    .insert(usuarios)
    .values(
      definiciones.map((d) => ({
        id: uuidv7(),
        usuario: d.usuario,
        hashPassword: hash,
        nombreVisible: d.nombre,
        rol: d.rol,
        barrioId: d.barrioId,
        area: d.area,
      })),
    )
    .onConflictDoNothing({ target: usuarios.usuario })
    .returning({ id: usuarios.id, usuario: usuarios.usuario, rol: usuarios.rol });

  const encuestadorDemo = insertados.find((u) => u.usuario === 'encuestador.demo');
  if (encuestadorDemo) {
    await db
      .insert(encuestadores)
      .values({
        id: uuidv7(),
        usuarioId: encuestadorDemo.id,
        barrioId: primero.id,
        alias: 'Encuestador de prueba',
      })
      .onConflictDoNothing();
  }

  // Viviendas ficticias en los primeros tres barrios, para tener lista de trabajo.
  const barriosDemo = listaBarrios.slice(0, 3);
  const filasViviendas = barriosDemo.flatMap((barrio) =>
    Array.from({ length: VIVIENDAS_DEMO_POR_BARRIO }, (_, i) => ({
      id: uuidv7(),
      barrioId: barrio.id,
      identificador: `M${String(Math.floor(i / 4) + 1).padStart(2, '0')}-L${String((i % 4) + 1).padStart(2, '0')}`,
    })),
  );
  const viviendasInsertadas = await db
    .insert(viviendas)
    .values(filasViviendas)
    .onConflictDoNothing()
    .returning({ id: viviendas.id });

  console.log(`  · usuarios de prueba: ${insertados.length} nuevos de ${definiciones.length}`);
  console.log(`  · viviendas ficticias: ${viviendasInsertadas.length} nuevas`);
  if (insertados.length > 0) {
    console.log(`  · contraseña de los usuarios de prueba: ${password}`);
    console.log('  · ⚠ datos de demostración: no usar esta base para el operativo real.');
  }
}

async function main(): Promise<void> {
  const env = getEnv();

  const nuevosBarrios = await sembrarBarrios();
  console.log(`✔ Barrios: ${nuevosBarrios} nuevos de ${BARRIOS_ESQUEL.length} del listado.`);
  console.log('  · TODO: validar el listado contra las sedes vecinales oficiales del municipio.');

  const estadoCuestionario = await sembrarCuestionario();
  console.log(
    estadoCuestionario === 'insertado'
      ? '✔ Cuestionario v1 cargado y publicado.'
      : '· Cuestionario v1: ya estaba cargado.',
  );

  if (env.SEED_DEMO) {
    console.log('· Datos de demostración (SEED_DEMO=true):');
    await sembrarDemo();
  } else {
    console.log('· Datos de demostración omitidos (SEED_DEMO=false).');
  }
}

main()
  .catch((error: unknown) => {
    console.error('✖ Falló el seed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
