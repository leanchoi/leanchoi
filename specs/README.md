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
| [`scripts/f0_validacion.py`](scripts/f0_validacion.py) | Las 8 pruebas del spike F0, todas de solo lectura | **Especificado, no ejecutado** contra servicios reales: en el entorno de redacción no había acceso al VPS y los dominios `.gob.ar` estaban bloqueados. Verificar en la primera corrida |

## Uso rápido

```bash
# Distancias geodésicas y cálculo de la cuota estructural del canal aéreo.
# Sin red: sirve para arrancar la discusión con datos propios del OIT.
python3 specs/scripts/f0_validacion.py --check 8 \
    --frecuencias-semana 3 --butacas 96 \
    --pernoctes-mes <real_del_OIT> --plazas-hoteleras <real_del_OIT>

# Spike completo, en el VPS
pip install fast-flights 'psycopg[binary]'
export METRICA_RO_DSN='postgresql://esquel_ro:...@localhost:5432/metrica'
python3 specs/scripts/f0_validacion.py --all
```

> Los valores que aparecen en los ejemplos de la documentación son **ilustrativos**.
> Los reales salen del ETL del OIT (pernoctes, plazas) y de ANAC (butacas, frecuencias).
