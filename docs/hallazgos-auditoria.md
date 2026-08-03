# Hallazgos de auditoría — Media Abrojal

Fecha: 2026-08-03
Fuente: `leanchoi/media-abrojal` @ `c410b38` + `docs/diagnostico/{auditoria,runtime}.md`

Todo lo de acá está verificado contra el repo y los diagnósticos. Lo que no
pude verificar está marcado como hipótesis.

---

## 1. CRÍTICO — El enriquecimiento del scraper continuo falla en cada ciclo

En `logs/continuous_worker.log`:

```
2026-08-02 17:40:01,885 [ERROR] Error en Enriquecimiento:
    'EnrichmentWorker' object has no attribute 'process_pending_batch'
```

`continuous_worker.py` llama a `EnrichmentWorker.process_pending_batch()`, un
método que ya no existe en la clase. Es un `AttributeError`: la firma cambió
cuando se reescribió `enrichment_worker.py` y no se actualizó el llamador.

**Efecto:** el ciclo hace discovery OK, extracción OK (`processed: 20, ok: 20,
errors: 0`) y después revienta antes de clasificar. Las notas nuevas entran a
`raw_articles` y **nunca llegan a `enriched_articles`**, que es la tabla que
alimenta el dashboard.

El proceso sigue vivo (PID 3441895) y loguea "Ciclo completado", por eso un
`ps aux` lo muestra sano. Está corriendo en vacío.

**Esto es regresión introducida por el propio cambio v3**, que en el plan decía
`[MODIFY] enrichment_worker.py` sin tocar `continuous_worker.py`.

## 2. Atraso de extracción de ~1 semana

El 2026-08-02 a las 17:39 el worker estaba extrayendo notas con `note_id` de
`2026-7-25` y `2026-7-26`. Hay backlog acumulado.

## 3. Discovery limitado a 2 de 422 sitemaps

```
sitemap_total_available: 422, sitemap_offset: 0, sitemap_limit: 2
urls_scanned: 832, urls_inserted: 0
```

Siempre arranca en `offset 0` y toma 2. El offset nunca avanza, así que el
backfill histórico no progresa. Para novedades puede alcanzar si los sitemaps
vienen ordenados del más nuevo al más viejo, pero es frágil.

## 4. La taxonomía aplicada no es la que se reportó

Prometido: 10 categorías, con "Deportes & Torneos" en prioridad #1.

Real (`bucket_inicial`, 109.223 notas):

| bucket | notas | % |
|---|---:|---:|
| seguridad_policial | 22.431 | 20,54 |
| cultura_eventos | 20.848 | 19,09 |
| infraestructura_servicios | 14.065 | 12,88 |
| social_comunitario | 13.956 | 12,78 |
| ambiente_riesgos | 10.936 | 10,01 |
| politica_gobierno | 8.540 | 7,82 |
| economia_produccion | 7.776 | 7,12 |
| contexto_general | 5.898 | 5,40 |
| opinion_editorial | 3.041 | 2,78 |
| turismo_directo | 1.311 | 1,20 |
| turismo_lateral | 421 | 0,39 |

- **No existe bucket de deportes.** Está fundido en `cultura_deportes` (19,08%
  de `grupo_principal`). La prioridad #1 del plan no está en los datos.
- Aparecen `contexto_general` y `social_comunitario`, que no figuraban en el plan.
- Turismo total = **1,59%**, para un medio de Esquel. Sobrecorrección confirmada.

## 5. Dos vocabularios conviviendo en la misma columna

En `grupo_principal` coexisten valores masivos y valores residuales del mismo
concepto:

- `cultura_deportes` 20.839  vs  `cultura` 9
- `gestion_publica` 8.540  vs  `politica` 29 (en `subgrupo`)
- `economia_local` 7.760  vs  `economia_general` 4, `economia_precios` 3,
  `economia_laboral` 2
- `riesgos_ambientales` 10.936  vs  `riesgos_climaticos` 3

Hay 14 valores con menos de 100 notas. **Hipótesis:** la re-indexación masiva
no sobrescribió el 100% de las filas, o hay un segundo camino de escritura
(el worker continuo) usando un vocabulario distinto al de `reindex_taxonomy.py`.
Verificable comparando `taxonomy_version` y `enriched_at` de esas filas.

## 6. Ya existe ground truth etiquetado y no se está usando

`raw_articles` (schema.sql) contiene:

| campo | qué es |
|---|---|
| `section_visible` | la sección que **el propio diario** le asignó a la nota |
| `breadcrumb` | jerarquía de navegación del sitio |
| `tags_json` | etiquetas del sitio |
| `opinion_editorial_flag` | booleano, ya separa género de tema |

`section_visible` es un conjunto de validación gratuito: permite medir
precisión y recall por bucket contra la clasificación del editor humano. Es
exactamente lo que faltaba para poder afirmar que el clasificador funciona.

Y `opinion_editorial_flag` ya implementaba la separación correcta
género ≠ tema. El plan v3 la ignoró y metió "Opinión & Editorial" como nivel 4
de la cascada, degradando un diseño que ya estaba bien.

## 7. Reacciones: sesgo de disponibilidad

`raw_articles` tiene `reactions_positive`, `reactions_negative`,
`reactions_total` y **`reactions_available`**. Si no se filtra por
`reactions_available = 1`, todo agregado de "Balance Ciudadano" mezcla notas
sin reacciones (0/0) con notas realmente neutras. Hay que reportar también qué
porcentaje de la muestra tiene reacciones.

## 8. Seguridad

| # | Hallazgo | Riesgo |
|---|---|---|
| 1 | `SECRET_KEY = "red43_vps_super_secret_jwt_key_2026_safe"` hardcodeada en `app/server/auth.py` | Con esa clave se firman JWT válidos → login como admin sin contraseña |
| 2 | `Red43Admin2026!` por defecto, aún vigente | Acceso directo |
| 3 | HTTP plano sobre IP, sin TLS | Credenciales y cookies de sesión en texto claro |
| 4 | Segundo uvicorn `app.main:app` en `0.0.0.0:8000` desde Jun30 (PID 2915) | Superficie extra expuesta a internet, sin auth conocida |

La #1 es la más grave: rotar la contraseña no alcanza si la SECRET_KEY sigue
siendo esa.

## 9. El código fuente sigue sin estar en el repo

`leanchoi/media-abrojal` tiene 8 archivos y 4 commits. No hay ningún `.py`.

Los paths reportados no existen en ningún commit del historial:
`app/core/enrichment_worker.py`, `app/services/continuous_worker.py`,
`app/cli/reindex_taxonomy.py`, `app/server/api_dashboard.py`.

Verificado con `git log --stat` sobre el historial completo (no shallow).
El `.gitignore` no excluye `app/`, así que fue omisión del `git add`.

---

## Orden de trabajo propuesto

1. Arreglar el crash de enriquecimiento (bloquea todo lo demás).
2. Subir `app/` al repo.
3. Rotar SECRET_KEY + contraseña admin; cerrar o autenticar el puerto 8000.
4. Medir el clasificador actual contra `section_visible` → línea de base real.
5. Recién ahí rediseñar taxonomía (multi-etiqueta) y UI.
