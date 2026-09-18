# Modelo de datos

> **Estado: diseño, con tres tablas ya implementadas.** `analitica.audios`,
> `analitica.transcripciones` y `analitica.audit_log` existen y tienen migración
> (`drizzle/0000_audios_y_transcripciones.sql`), porque las necesita el módulo de audio.
> El resto se implementa en la **fase 1**. Este documento es el contrato que esa fase
> tiene que cumplir; si algo cambia al implementarlo, se corrige acá en el mismo commit.

## Principio que ordena todo

Una sola instancia de Postgres 16, **dos schemas separados**:

```
                    ticket (UUID v7, generado en el celular)
   analitica  ·············································>  identificada
   (respuestas)        NO hay foreign key entre ambos          (quién es quién)
```

- `analitica` no contiene **ningún** dato identificatorio: ni nombre, ni DNI, ni
  domicilio exacto, ni teléfono, ni correo.
- `identificada` no contiene **ninguna** respuesta.
- El `ticket` aparece en los dos lados, pero **sin constraint que los relacione**: no se
  puede hacer un join accidental, y la base no lo facilita.
- Cruzar ambos lados es una operación explícita del rol `admin` que exige un motivo
  escrito y deja una fila en `analitica.audit_log`.

El ticket lo genera el dispositivo de campo (UUID v7: ordenable por tiempo y sin
coordinación con el servidor). Es también el código que el vecino se lleva —en pantalla y
en QR— para consultar el estado de su demanda.

---

## Schema `analitica`

### `barrios`

| Columna               | Tipo               | Notas                                               |
| --------------------- | ------------------ | --------------------------------------------------- |
| `id`                  | `uuid` PK          |                                                     |
| `nombre`              | `text` único       | Ver listado en el seed (a validar con el municipio) |
| `slug`                | `text` único       | Para URLs e informes                                |
| `sede_vecinal`        | `text` nullable    | TODO: datos oficiales de sedes                      |
| `viviendas_estimadas` | `integer` nullable | Denominador de cobertura. TODO: fuente              |
| `activo`              | `boolean`          |                                                     |
| `creado_en`           | `timestamptz`      |                                                     |

### `viviendas`

Unidad de relevamiento. Es la lista de trabajo del encuestador.

| Columna                       | Tipo                                                        | Notas                                                     |
| ----------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `id`                          | `uuid` PK                                                   |                                                           |
| `barrio_id`                   | `uuid` → `barrios.id`                                       |                                                           |
| `identificador`               | `text`                                                      | Manzana/lote o referencia; **sin calle ni número exacto** |
| `lat`, `lng`, `precision_m`   | `double precision` nullable                                 | Referencia del punto, no del domicilio                    |
| `estado`                      | enum `pendiente\|en_curso\|relevada\|cerrada_sin_respuesta` |                                                           |
| `creado_en`, `actualizado_en` | `timestamptz`                                               |                                                           |

### `encuestadores`

| Columna      | Tipo                   | Notas                                                                 |
| ------------ | ---------------------- | --------------------------------------------------------------------- |
| `id`         | `uuid` PK              |                                                                       |
| `usuario_id` | `uuid` → `usuarios.id` |                                                                       |
| `barrio_id`  | `uuid` → `barrios.id`  | Barrio asignado                                                       |
| `alias`      | `text`                 | Nombre de pila o apodo para el tablero, no identificatorio del vecino |
| `activo`     | `boolean`              |                                                                       |

### `cuestionarios`

Definición JSON versionada del instrumento.

| Columna                  | Tipo                   | Notas                                                                                                     |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid` PK              |                                                                                                           |
| `version`                | `integer` único        | Monótona                                                                                                  |
| `definicion`             | `jsonb`                | Preguntas, bloques, `decision`, `segundos_estimados`, `core`, `autoadministrada`, texto de consentimiento |
| `consentimiento_version` | `text`                 | Versionado junto al cuestionario (regla 2)                                                                |
| `segundos_totales`       | `integer`              | Calculado; ≤ 720 (regla 6)                                                                                |
| `publicado_en`           | `timestamptz` nullable | Null = borrador                                                                                           |
| `changelog`              | `text`                 | Se muestra en `/cuestionario` (regla 10)                                                                  |

### `respuestas`

| Columna                                                | Tipo                                | Notas                                              |
| ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| `ticket`                                               | `uuid` PK                           | Generado en el cliente (UUID v7). **Único puente** |
| `vivienda_id`                                          | `uuid` → `viviendas.id`             |                                                    |
| `barrio_id`                                            | `uuid` → `barrios.id`               | Desnormalizado para agregados                      |
| `encuestador_id`                                       | `uuid` → `encuestadores.id`         |                                                    |
| `cuestionario_version`                                 | `integer` → `cuestionarios.version` |                                                    |
| `consentimiento_version`                               | `text` **not null**                 | Sin esto no hay encuesta (regla 2)                 |
| `payload`                                              | `jsonb`                             | Respuestas por `pregunta_id`                       |
| `abierta_en`, `cerrada_en`                             | `timestamptz`                       | Duración real (regla 6)                            |
| `lat_apertura`, `lng_apertura`, `precision_apertura_m` | `double precision` nullable         | Dato, no validación                                |
| `lat_cierre`, `lng_cierre`, `precision_cierre_m`       | `double precision` nullable         | Dato, no validación                                |
| `dispositivo_id`                                       | `text`                              | Para depurar sincronizaciones                      |
| `sincronizada_en`                                      | `timestamptz`                       |                                                    |

### `no_respuestas`

| Columna                     | Tipo                                                                       | Notas                 |
| --------------------------- | -------------------------------------------------------------------------- | --------------------- |
| `id`                        | `uuid` PK                                                                  |                       |
| `vivienda_id`               | `uuid` → `viviendas.id`                                                    |                       |
| `barrio_id`                 | `uuid` → `barrios.id`                                                      |                       |
| `encuestador_id`            | `uuid` → `encuestadores.id`                                                |                       |
| `motivo`                    | enum `sin_moradores\|rechazo\|deshabitada\|no_accesible\|volver_mas_tarde` | Obligatorio (regla 3) |
| `intento`                   | `integer` ≥ 1                                                              |                       |
| `observacion`               | `text` nullable                                                            |                       |
| `lat`, `lng`, `precision_m` | `double precision` nullable                                                |                       |
| `registrada_en`             | `timestamptz`                                                              |                       |

### `audios` ✅ implementada

El audio es temporal: la fila sobrevive, los bytes no. Ver `docs/audio-y-transcripcion.md`.

| Columna                                                     | Tipo                                                                                    | Notas                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `id`                                                        | `uuid` PK                                                                               | UUID v7 generado al recibirlo                      |
| `ticket`                                                    | `uuid`                                                                                  | Sin FK entre schemas                               |
| `pregunta_id`                                               | `text`                                                                                  | Pregunta abierta del cuestionario                  |
| `mime`, `bytes`, `duracion_segundos`, `sha256`              | —                                                                                       | Metadatos que sobreviven a la purga                |
| `ruta_relativa`                                             | `text` nullable                                                                         | Dónde están los bytes. **`null` = ya se borraron** |
| `estado`                                                    | enum `pendiente / procesando / transcripto / error / purgado / purgado_sin_transcribir` |                                                    |
| `intentos`, `error_detalle`                                 | —                                                                                       | Reintentos de desgrabación                         |
| `creado_en`, `transcripto_en`, `purgado_en`, `purga_motivo` | —                                                                                       | Cuándo y por qué dejaron de existir los bytes      |

### `transcripciones` ✅ implementada

`id`, `audio_id` (FK a `audios`), `ticket`, `pregunta_id`, `texto`, `idioma`,
`proveedor`, `modelo`, `metadata` (respuesta cruda del proveedor, sin audio),
`revisada_por_persona`, `duracion_proceso_ms`, `creada_en`.

### `codificaciones`

Agrupamiento temático de las transcripciones (fase 7): `id`, `transcripcion_id`,
`cluster_id`, `etiqueta`, `cita_textual`, `barrio_id`, `proveedor`, `creada_en`.

### `derivaciones`

| Columna                       | Tipo                                                                  | Notas                                            |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `id`                          | `uuid` PK                                                             |                                                  |
| `ticket`                      | `uuid`                                                                | Sin FK a `identificada`                          |
| `barrio_id`                   | `uuid` → `barrios.id`                                                 |                                                  |
| `competencia`                 | enum `municipal\|provincial\|nacional\|privada`                       | Obligatorio (regla 4)                            |
| `area_destino`                | `text`                                                                |                                                  |
| `estado`                      | enum `recibida\|derivada\|en_proceso\|resuelta\|fuera_de_competencia` |                                                  |
| `orden_trabajo_nro`           | `text` nullable                                                       | Sin esto no hay plantilla `compromiso` (regla 4) |
| `creada_en`, `actualizada_en` | `timestamptz`                                                         |                                                  |

### `informes_barrio`

Una carilla A4/A3 imprimible por barrio, con los compromisos asumidos.
`id`, `barrio_id`, `cuestionario_version`, `generado_en`, `generado_por`, `contenido`
(`jsonb`), `publicado` (`boolean`).

### `usuarios`

| Columna          | Tipo                                                            | Notas                                     |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------- |
| `id`             | `uuid` PK                                                       |                                           |
| `usuario`        | `text` único                                                    |                                           |
| `hash_password`  | `text`                                                          | bcrypt                                    |
| `nombre_visible` | `text`                                                          | Personal municipal, no vecinos            |
| `rol`            | enum `encuestador\|coordinador_barrio\|area\|conduccion\|admin` |                                           |
| `barrio_id`      | `uuid` nullable                                                 | Para `encuestador` y `coordinador_barrio` |
| `area`           | `text` nullable                                                 | Para rol `area`                           |
| `activo`         | `boolean`                                                       |                                           |
| `ultimo_acceso`  | `timestamptz` nullable                                          |                                           |

### `audit_log` ✅ implementada

| Columna       | Tipo                              | Notas                                                               |
| ------------- | --------------------------------- | ------------------------------------------------------------------- |
| `id`          | `bigserial` PK                    |                                                                     |
| `usuario_id`  | `uuid` → `usuarios.id`            |                                                                     |
| `accion`      | `text`                            | `cruce_ticket_identidad`, `export_csv`, `publicacion_cuestionario`… |
| `ticket`      | `uuid` nullable                   |                                                                     |
| `motivo`      | `text` **not null** en los cruces | Texto escrito por la persona (regla 1)                              |
| `metadata`    | `jsonb`                           |                                                                     |
| `ocurrido_en` | `timestamptz`                     |                                                                     |

Append-only: sin `update` ni `delete` desde la aplicación.

---

## Schema `identificada`

Acceso exclusivo del rol `admin`, siempre auditado. Ninguna API pública lee de acá.

### `contactos`

| Columna              | Tipo            | Notas                                                                                   |
| -------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `ticket`             | `uuid` PK       | El puente. Sin FK a `analitica`                                                         |
| `nombre`, `apellido` | `text`          |                                                                                         |
| `dni_ultimos`        | `text(3)`       | Solo los últimos 3 dígitos: alcanza para la consulta del vecino y no reconstruye el DNI |
| `email`, `telefono`  | `text` nullable |                                                                                         |
| `domicilio`          | `text`          |                                                                                         |
| `barrio_nombre`      | `text`          | Texto, no FK                                                                            |
| `creado_en`          | `timestamptz`   |                                                                                         |

Índice por `(apellido, dni_ultimos)` para la consulta pública del ticket.

### `acuses`

| Columna       | Tipo                                            | Notas                                         |
| ------------- | ----------------------------------------------- | --------------------------------------------- |
| `id`          | `uuid` PK                                       |                                               |
| `ticket`      | `uuid`                                          |                                               |
| `plantilla`   | enum `acuse\|derivacion\|compromiso`            | `compromiso` exige orden de trabajo (regla 4) |
| `competencia` | enum `municipal\|provincial\|nacional\|privada` |                                               |
| `canal`       | enum `email\|telefono\|presencial`              |                                               |
| `enviado_en`  | `timestamptz` nullable                          | Null = generado pero no enviado               |
| `cuerpo`      | `text`                                          | Lo que efectivamente se le dijo al vecino     |

---

## Índices previstos

- `respuestas (barrio_id, cerrada_en)` — tablero y cobertura.
- `no_respuestas (barrio_id, motivo)` — tasa de no-respuesta, métrica de primer nivel.
- `viviendas (barrio_id, estado)` — lista de trabajo del encuestador.
- `derivaciones (barrio_id, estado)`, `derivaciones (competencia)` — seguimiento.
- `audit_log (usuario_id, ocurrido_en)` y `audit_log (accion, ocurrido_en)` — auditoría.
- `audios (estado, creado_en)` — cola de desgrabación y barrido de purga.
- `identificada.contactos (apellido, dni_ultimos)` — consulta del vecino.

## Retención y baja

TODO (a definir con la Dirección y la asesoría letrada): por cuánto tiempo se conservan
los datos del schema `identificada` una vez cerrado el operativo y entregada la
devolución, y cuál es el procedimiento de baja a pedido del titular (Ley 25.326).
