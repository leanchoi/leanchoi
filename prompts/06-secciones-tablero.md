# Prompt 7 — Secciones del tablero (F4)

> Primer valor visible para el usuario. Si tu herramienta tiene navegador integrado,
> usalo para verificar de verdad en lugar de asumir que renderiza.

```
Repo de especificación: github.com/leanchoi/leanchoi, rama
claude/esquel-data-ecosystem-integration-qbxuv2.
Leé AGENTS.md, docs/06-productivizacion.md §5 (jerarquía de lectura) y
docs/03-pipeline-datos.md §6 (patrones DuckDB-WASM).

ANTES DE EMPEZAR: leé web/src/App.tsx, web/src/db/duckdb.ts, web/src/state/filtros.ts,
charts/ y tokens.css. Igualá lo que ya existe. NO introduzcas una librería de gráficos,
de UI ni de estado: el proyecto usa SVG/Canvas nativos y estado reactivo propio.

SUPERFICIE DE CAMBIO
  web/src/secciones/aereos/      nuevo
  web/src/secciones/mercado/     nuevo
  web/src/secciones/integrada/   nuevo
  web/src/App.tsx                SOLO tres entradas de menú y sus rutas perezosas
Ningún componente, token ni vista preexistente se modifica (I2).

ESTRUCTURA — jerarquía de tres niveles, no pestañas paralelas
Esta es la respuesta concreta a "no queremos pestañas aisladas". El cruce no se logra
poniendo tres curvas juntas: se logra con una estructura narrativa.

  NIVEL 1 · TITULAR      6 tarjetas con semáforo, una pantalla, sin scroll. 15 segundos.
    ocupación proyectada 8 semanas · riesgo del acuerdo COR vs piso 80% · brecha de
    paquete vs Bariloche · fuga de puerta de entrada · alerta más severa · cobertura
  NIVEL 2 · DIAGNÓSTICO  por qué. Descomposición, comparación con el cluster, señal
    dominante, tarjeta de insight con su acción. Filtros YA APLICADOS desde el nivel 1.
  NIVEL 3 · EVIDENCIA    series completas, cross-filtering libre, tabla, cobertura por
    celda, descarga CSV, enlace a la ficha metodológica.

TRES REGLAS QUE SOSTIENEN LA ESTRUCTURA
  1. El nivel 1 NUNCA crece. Seis tarjetas. Agregar una exige sacar otra. Es lo único que
     frena la proliferación, porque la presión siempre es aditiva.
  2. Todo nivel 1 baja a un nivel 2 con el filtro puesto.
  3. El nivel 3 es completo y aburrido a propósito. Es donde se verifica.
La tarjeta de cobertura no es relleno: es lo que hace creíble al resto.

SECCIONES
  Aéreos      tarifario comparativo patagónico · semáforo de frecuencias y butacas (ANAC)
              · curva de evolución tarifaria · Índice de Fuga de Puerta de Entrada
  Mercado     benchmark regional · ADR por tipología · curva de anticipación con punto de
              congelamiento l_90
  Integrada   gráfico maestro tripartito · calculadora TTCI (con N* e IC) · descomposición
              del desvío · panel de alerta temprana · tablero de riesgo de acuerdo

RENDIMIENTO — patrones en specs/sql/03_duckdb_wasm_patterns.sql
  · Sentencias PREPARADAS con parámetros. Nunca concatenar el estado de la UI en SQL.
  · Devolvé SIEMPRE agregados (decenas o cientos de filas). El costo dominante no es
    escanear en WASM, es materializar objetos JS. Una consulta que devuelve 200 filas es
    instantánea aunque escanee 100.000; una que devuelve 50.000 congela la interfaz.
  · Pivoteá con FILTER (WHERE ...) en SQL, no en JavaScript.
  · Sin joins en caliente entre tablas grandes; solo contra dimensiones.
  · Debounce ~120 ms + cancelación por contador de generación, una conexión secuencial.
  · Carga perezosa por sección: las tablas de aéreos no se descargan hasta abrir la pestaña.
  · NO actives COOP/COEP para multithreading en esta fase: rompe recursos de terceros sin
    CORP y con tablas dentro del presupuesto la ganancia es marginal.

EL TTCI SE CALCULA EN EL NAVEGADOR
Es lo que permite mover "noches" y "pasajeros" y ver el resultado al instante. El ETL
emite solo los componentes. Ojo con la aritmética: el aéreo escala con PASAJEROS y el
alojamiento con UNIDADES. Sumarlos sin separar los escalados es el error del informe
original (docs/00 H4).

DEGRADACIÓN (I4, I13)
Con meta.json marcando un dataset no disponible: la sección muestra su estado y la fecha
del último dato bueno, y el resto del tablero funciona normal. Prohibida la pantalla en
blanco. Cobertura insuficiente -> "sin señal", nunca verde.

CRITERIOS DE ACEPTACIÓN
  1. Todas las vistas preexistentes se comportan EXACTAMENTE igual (revisión visual +
     tests existentes en verde).
  2. Carga inicial <= 3 MB transferidos; las tablas de aéreos no se descargan hasta abrir
     la sección. Medilo en la pestaña Red del navegador.
  3. Cross-filter p95 < 100 ms con el dataset completo.
  4. Con un dataset marcado no disponible, degrada con mensaje.
  5. Se respetan tokens.css y las pautas: tablas compactas, alto contraste, insignias
     translúcidas, panel lateral intacto.
  6. Series con cobertura <80% marcadas preliminares (I8).
  7. Quitar las tres entradas de App.tsx y borrar los directorios devuelve el tablero al
     estado previo (I7).
```
