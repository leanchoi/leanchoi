"""
Observatorio de Inteligencia Turística — capa de transformación (ETL).

El paquete convierte la planilla operativa del Observatorio en un modelo
dimensional en Parquet, listo para ser consultado desde el navegador con
DuckDB-WASM.

Módulos:
    config       carga y valida los archivos de etl/config
    sources      lectura del libro Excel o de Google Sheets
    normalize    canonicalización de categorías, alojamientos y estados
    calendario   dimensión de fechas, feriados, eventos y temporadas
    indicadores  metodología oficial de ocupación (extrapolación + mínimos)
    demanda      turistas, pernoctes, estadía y derrame económico
    emit         escritura de Parquet + meta.json
"""

__version__ = "1.0.0"
