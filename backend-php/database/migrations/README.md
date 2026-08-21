# Migraciones

`../schema.sql` es el **baseline**: la foto completa del esquema en la versión 1.0.0.
Sobre una base vacía se aplica ese archivo y listo.

A partir de ahí, **cada cambio de esquema entra como una migración numerada** y nunca
se edita el baseline retroactivamente (salvo en la regeneración de release, que
Antigravity ejecuta consolidando migraciones).

## Convención de nombres

```
NNNN_verbo_objeto.sql        # 0002_add_indice_telemetria_barrio.sql
NNNN_verbo_objeto.down.sql   # reversión, obligatoria
```

## Reglas

1. **Idempotencia**: usar `IF NOT EXISTS` / `IF EXISTS` donde MySQL lo permita.
2. **Sin bloqueos largos**: `ALTER TABLE` sobre `telemetria_inteligencia` o
   `misiones_historial` se hace con `ALGORITHM=INPLACE, LOCK=NONE` o con
   `pt-online-schema-change`; nunca en horario pico (19-23 h de Esquel).
3. **Una migración, un propósito**. Nada de mezclar índices con datos.
4. **Datos ≠ esquema**: los cambios de contenido van en `../seeds/`.
5. Toda migración registra su aplicación en `schema_migrations` (creada por la
   primera migración del runner en la Fase 1).

## Orden de aplicación en una instalación limpia

```bash
mysql -u USER -p DB < backend-php/database/schema.sql
for f in backend-php/database/seeds/*.sql; do mysql -u USER -p DB < "$f"; done
```

`001`, `002` y `006` son **generados**: se regeneran con
`node --experimental-strip-types tools/ci/gen-seeds.ts` a partir de
`/shared/constants/`. No editarlos a mano.
