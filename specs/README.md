# specs/ — Artefactos implementables

Acompañan a `docs/`. Cada archivo es directamente utilizable; los supuestos que
requieren verificación están marcados en cada encabezado.

| Archivo | Qué es | Verificar antes de usar |
|---|---|---|
| [`sql/01_air_schema.sql`](sql/01_air_schema.sql) | DDL corregido del subsistema aéreo. Reemplaza la §3.4 del informe original; corrige los 9 defectos de H3 | Es el **contrato lógico** de la capa plata. Se materializa como Parquet (docs/03 §3); solo se instancia en PostgreSQL si aparece un consumidor server-side |
| [`sql/02_metrica_contract.sql`](sql/02_metrica_contract.sql) | Consultas de solo lectura contra Métrica. No crea objetos ni vistas materializadas | **Nombres de tabla asumidos.** Mapear al esquema real en F0-6 |
| [`sql/03_duckdb_wasm_patterns.sql`](sql/03_duckdb_wasm_patterns.sql) | Seis patrones de consulta en el navegador + antipatrones | Adaptar los nombres de columna a los que emita el ETL en F3 |
| [`config/aeropuertos.csv`](config/aeropuertos.csv) | 23 aeropuertos con IATA, OACI y coordenadas | **Coordenadas semilla.** Validar contra OurAirports antes de publicar cualquier tarifa/km |
| [`config/rutas_muestreo.json`](config/rutas_muestreo.json) | Matriz de cadencia completa: 22 rutas, 4 niveles, 3 conjuntos de fechas | Recalcular el presupuesto si F0-3 obliga a bajar el ritmo |
| [`catalogo/indicadores.yaml`](catalogo/indicadores.yaml) | **Fuente única de verdad**: 28 indicadores, 16 campos obligatorios. De acá se generan los tipos del tablero, los validadores del ETL y la ficha metodológica |
| [`catalogo/insights.yaml`](catalogo/insights.yaml) | 11 reglas declarativas del motor de insights, con su acción y destinatario. Incluye las reglas que deliberadamente **no** existen y por qué |
| [`scripts/gen_catalogo.py`](scripts/gen_catalogo.py) | Generador de la capa semántica. `--check` en CI: si lo generado difiere de lo commiteado, el build falla |
| [`scripts/f0_validacion.py`](scripts/f0_validacion.py) | Las 9 pruebas del spike F0, todas de solo lectura | **Especificado, no ejecutado** contra servicios reales: en el entorno de redacción no había acceso al VPS y los dominios `.gob.ar` estaban bloqueados. Verificar en la primera corrida |

## Uso rápido

```bash
# Regenerar la capa semántica desde el catálogo (probado en este repo)
python3 specs/scripts/gen_catalogo.py
python3 specs/scripts/gen_catalogo.py --check      # para CI

# Perfil estacional de sigma_aereo + riesgo fiscal del acuerdo. Sin red.
python3 specs/scripts/f0_validacion.py --check 8 9 \
    --butacas 96 --pernoctes-mes <real_del_OIT> --plazas-hoteleras <real_del_OIT> \
    --tarifa-referencia <ars> --lf-proyectado 0.71 --semanas-acuerdo 9

# Spike completo, en el VPS
pip install fast-flights 'psycopg[binary]'
export METRICA_RO_DSN='postgresql://esquel_ro:...@localhost:5432/metrica'
python3 specs/scripts/f0_validacion.py --all
```

> Los valores que aparecen en los ejemplos de la documentación son **ilustrativos**.
> Los reales salen del ETL del OIT (pernoctes, plazas) y de ANAC (butacas, frecuencias).

## `generated/` — no editar a mano

`generated/web/indicadores.ts`, `generated/etl/indicadores.py` y
`generated/docs/ficha-metodologica.md` son salida de `gen_catalogo.py`. En el repo real
van a `web/src/generated/`, `etl/generated/` y `docs/generated/`; acá quedan bajo
`generated/` para que se vea el resultado sin tener el proyecto delante.
