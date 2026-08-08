#!/usr/bin/env python3
"""
Construye el dataset del Observatorio de Inteligencia Turística.

Uso
---
    # desde el libro Excel local (por defecto)
    python build.py --excel Completo_Ocupacion_2026.xlsx --salida ../web/public/data

    # desde el Google Sheet publicado (flujo de producción)
    python build.py --sheet-id 1_NKQkMCwztlKijisKoypiUzBaWXHskReVN5SAc_kAvc \
                    --salida ../web/public/data

El comando es idempotente: siempre reescribe la carpeta de salida completa.

Salvo que se pase ``--sin-validar``, si el libro trae la hoja
``Histórico - Ocupación Oficial`` se reconcilia fila a fila el resultado del ETL
contra los números que hoy publica la planilla. El proceso aborta si la
proporción de filas divergentes supera ``UMBRAL_DIFERENCIAS``; con
``--permitir-diferencias`` sigue igual y solo informa.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from oit import calendario, demanda, emit, indicadores, sources  # noqa: E402
from oit.config import cargar_config  # noqa: E402
from oit.normalize import normalizar_categoria, reporte_sin_clasificar  # noqa: E402

TOLERANCIA = 1e-6
# Porcentaje de filas que puede diferir antes de considerar rota la equivalencia.
# No es cero a propósito: la hoja oficial de la planilla se recalcula a mano y
# queda desactualizada cuando se da de alta o de baja un establecimiento, así
# que un residuo pequeño y *localizado* es esperable. Lo que no es aceptable es
# una divergencia difusa, que indicaría un error de metodología.
UMBRAL_DIFERENCIAS = 0.05


# --------------------------------------------------------------------------
# Reconciliación contra la planilla publicada
# --------------------------------------------------------------------------
def validar_contra_oficial(calculado: pd.DataFrame, oficial: pd.DataFrame, cfg) -> dict:
    """Compara el ETL con la hoja oficial y devuelve un informe de reconciliación."""
    if oficial is None or oficial.empty:
        return {"ejecutada": False, "motivo": "El libro no trae la hoja oficial."}

    ofi = oficial.copy()
    ofi.columns = [str(c).strip() for c in ofi.columns]
    requeridas = {
        "Fecha": "fecha",
        "Categoría": "categoria_raw",
        "UF Habilitada": "uf_habilitada_ofi",
        "UF Trabajando": "uf_trabajando_ofi",
        "Establecimientos con Datos": "n_relevados_ofi",
        "UF Ocupada Oficial (extrapolada)": "uf_ocupada_ofi",
        "PAX Ocupada Oficial (extrapolada)": "pax_ocupada_ofi",
    }
    faltantes = [c for c in requeridas if c not in ofi.columns]
    if faltantes:
        return {"ejecutada": False, "motivo": f"Faltan columnas en la hoja oficial: {faltantes}"}

    ofi = ofi.rename(columns=requeridas)[list(requeridas.values())]
    ofi["fecha"] = pd.to_datetime(ofi["fecha"], errors="coerce")
    ofi = ofi[ofi["fecha"].notna()]
    ofi["categoria"] = ofi["categoria_raw"].map(
        lambda v: normalizar_categoria(v, cfg.alias_categoria)
    )
    for col in [c for c in ofi.columns if c.endswith("_ofi")]:
        ofi[col] = pd.to_numeric(ofi[col], errors="coerce")

    m = calculado.merge(ofi, on=["fecha", "categoria"], how="inner", suffixes=("", "_o"))
    m["mes"] = m["fecha"].dt.month

    # La hoja oficial deja en 0 la extrapolación de las filas que no son
    # publicables; el ETL conserva el valor y lo marca como no publicable, así
    # que para comparar hay que aplicar el mismo blanqueo.
    m["uf_ocupada_pub"] = m["uf_ocupada_ext"].where(m["cumple_minimo"], 0.0).fillna(0.0)
    m["pax_ocupada_pub"] = m["pax_ocupada_ext"].where(m["cumple_minimo"], 0.0).fillna(0.0)

    def _dif(a: str, b: str) -> dict:
        d = (m[a].fillna(0) - m[b].fillna(0)).abs()
        fuera = d > TOLERANCIA
        n_fuera = int(fuera.sum())
        # Dónde se concentran las diferencias: si caen en pocos (categoría, mes),
        # es desactualización puntual de la planilla, no un error de método.
        focos = []
        if n_fuera:
            grupos = (
                m.loc[fuera]
                .groupby(["categoria", "mes"])
                .size()
                .sort_values(ascending=False)
                .head(6)
            )
            focos = [
                {"categoria": str(cat), "mes": int(mes), "filas": int(n)}
                for (cat, mes), n in grupos.items()
            ]
        idx = int(d.idxmax()) if len(d) else -1
        return {
            "max_dif": float(d.max()) if len(d) else 0.0,
            "filas_fuera_tolerancia": n_fuera,
            "share_fuera": float(n_fuera / len(m)) if len(m) else 0.0,
            "focos": focos,
            "ejemplo": (
                {
                    "fecha": str(m.loc[idx, "fecha"].date()),
                    "categoria": str(m.loc[idx, "categoria"]),
                    "calculado": float(m.loc[idx, a]) if pd.notna(m.loc[idx, a]) else None,
                    "oficial": float(m.loc[idx, b]) if pd.notna(m.loc[idx, b]) else None,
                }
                if idx >= 0 and float(d.max()) > TOLERANCIA
                else None
            ),
        }

    comparaciones = {
        "uf_habilitada": _dif("uf_habilitada", "uf_habilitada_ofi"),
        "uf_trabajando": _dif("uf_trabajando", "uf_trabajando_ofi"),
        "n_establecimientos_con_dato": _dif("n_relevados", "n_relevados_ofi"),
        "uf_ocupada_extrapolada": _dif("uf_ocupada_pub", "uf_ocupada_ofi"),
        "pax_ocupada_extrapolada": _dif("pax_ocupada_pub", "pax_ocupada_ofi"),
    }
    peor = max(c["share_fuera"] for c in comparaciones.values())
    exacto = all(c["filas_fuera_tolerancia"] == 0 for c in comparaciones.values())

    return {
        "ejecutada": True,
        "filas_comparadas": int(len(m)),
        "filas_solo_en_etl": int(len(calculado) - len(m)),
        "filas_solo_en_planilla": int(len(ofi) - len(m)),
        "coincide": bool(exacto),
        "dentro_de_umbral": bool(peor <= UMBRAL_DIFERENCIAS),
        "peor_share": float(peor),
        "umbral": UMBRAL_DIFERENCIAS,
        "tolerancia": TOLERANCIA,
        "comparaciones": comparaciones,
    }


# --------------------------------------------------------------------------
# Informe por consola
# --------------------------------------------------------------------------
def _pct(v) -> str:
    return "—" if v is None or not np.isfinite(v) else f"{v * 100:5.1f}%"


def imprimir_informe(meta: dict, val: dict) -> None:
    p = meta["periodo"]
    c = meta["calidad"]
    print("\n" + "═" * 74)
    print(f"  OBSERVATORIO DE INTELIGENCIA TURÍSTICA — {meta['destino']['nombre'].upper()}")
    print("═" * 74)
    print(f"  Período          {p['desde']} → {p['hasta']}  ({p['dias_con_relevamiento']} días)")
    print(f"  Parque           {meta['parque']['establecimientos']} establecimientos · "
          f"{meta['parque']['categorias']} categorías")
    print(f"  Registros        {c['registros']:,} filas · "
          f"{c['registros_relevados']:,} con respuesta ({_pct(c['tasa_respuesta_global'])})")
    print(f"  Días publicables {c['dias_publicables_oficial']}/{c['dias_totales']} "
          f"({_pct(c['tasa_dias_publicables'])}) con la regla de ≥{c['min_categorias_general']} categorías")

    print("\n  Cobertura por categoría (días publicables / días del período)")
    print("  " + "─" * 70)
    for row in sorted(c["cobertura_por_categoria"], key=lambda r: -(r["tasa_publicable"] or 0)):
        barra = "█" * int(round((row["tasa_publicable"] or 0) * 28))
        alerta = "  ⚠ sin dato publicable" if (row["tasa_publicable"] or 0) == 0 else ""
        print(f"  {row['categoria'][:31]:31} {_pct(row['tasa_publicable'])} "
              f"{barra:<28}{alerta}")

    if c["estados_sin_clasificar"]:
        print(f"\n  ⚠ Estados sin clasificar ({len(c['estados_sin_clasificar'])} variantes) — "
              "ampliar REGLAS_ESTADO en oit/normalize.py:")
        for e in c["estados_sin_clasificar"][:8]:
            print(f"      {e['n']:>5} × {e['valor'][:55]}")

    print("\n  Reconciliación contra la planilla oficial")
    print("  " + "─" * 70)
    if not val.get("ejecutada"):
        print(f"  ⊘ No ejecutada: {val.get('motivo')}")
    else:
        if val["coincide"]:
            estado = "✓ COINCIDE EXACTO"
        elif val["dentro_de_umbral"]:
            estado = f"✓ DENTRO DE UMBRAL (máx {_pct(val['peor_share'])} de filas, tope {_pct(val['umbral'])})"
        else:
            estado = "✗ FUERA DE UMBRAL"
        print(f"  {estado} sobre {val['filas_comparadas']:,} filas comparadas")
        for nombre, cmp_ in val["comparaciones"].items():
            marca = "✓" if cmp_["filas_fuera_tolerancia"] == 0 else "≈"
            print(f"    {marca} {nombre:28} {cmp_['filas_fuera_tolerancia']:>4} filas "
                  f"({_pct(cmp_['share_fuera'])})  máx. dif. {cmp_['max_dif']:.3g}")
            if cmp_["focos"]:
                focos = ", ".join(
                    f"{f['categoria'][:20]}/mes {f['mes']} ({f['filas']})" for f in cmp_["focos"][:3]
                )
                print(f"        concentradas en: {focos}")

    print("\n  Artefactos")
    print("  " + "─" * 70)
    total = 0
    for t in meta["tablas"]:
        total += t["bytes"]
        print(f"    {t['archivo']:34} {t['filas']:>7,} filas  {t['bytes'] / 1024:>8.1f} KB")
    print(f"    {'TOTAL':34} {'':>7}        {total / 1024:>8.1f} KB")
    print("═" * 74 + "\n")


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="ETL del Observatorio de Inteligencia Turística")
    origen = ap.add_mutually_exclusive_group()
    origen.add_argument("--excel", type=Path, help="Ruta al libro .xlsx")
    origen.add_argument("--sheet-id", type=str, help="ID del Google Sheet publicado")
    ap.add_argument("--salida", type=Path, default=Path("../web/public/data"),
                    help="Carpeta de salida de los Parquet + meta.json")
    ap.add_argument("--sin-validar", action="store_true",
                    help="Omite la comparación contra la hoja oficial")
    ap.add_argument("--permitir-diferencias", action="store_true",
                    help="No aborta si la validación encuentra diferencias")
    args = ap.parse_args()

    raiz = Path(__file__).resolve().parent
    if not args.excel and not args.sheet_id:
        args.excel = raiz / "Completo_Ocupacion_2026.xlsx"

    cfg = cargar_config()

    # 1) Lectura ------------------------------------------------------------
    if args.sheet_id:
        print(f"→ Descargando Google Sheet {args.sheet_id} …")
        libro = sources.desde_google_sheets(args.sheet_id)
        origen_hash = None
    else:
        print(f"→ Leyendo {args.excel} …")
        libro = sources.desde_excel(args.excel)
        origen_hash = emit.hash_archivo(Path(args.excel))

    limpios = libro.requerida(sources.HOJA_LIMPIOS)

    # 2) Transformación -----------------------------------------------------
    print("→ Normalizando el dato atómico …")
    hecho = indicadores.preparar_hecho_establecimiento(limpios, cfg)
    sin_clasificar = reporte_sin_clasificar(limpios, "Estado")

    print("→ Aplicando la metodología oficial …")
    categoria_dia = indicadores.construir_categoria_dia(hecho, cfg)
    dia = indicadores.construir_dia(categoria_dia, cfg)
    dim_aloj = indicadores.construir_dim_alojamiento(hecho)

    print("→ Construyendo calendario y eventos …")
    dim_cal = calendario.construir_dim_calendario(cfg)
    dim_evt = calendario.construir_dim_evento(cfg, libro.get(sources.HOJA_FINDES))

    print("→ Calculando demanda y derrame …")
    declarado = demanda.leer_declarado(libro.get(sources.HOJA_PASAJEROS))
    mes_q = demanda.construir_mes_quincena(categoria_dia, dim_cal, declarado, cfg)
    mes = demanda.construir_mes(mes_q, declarado)

    dim_cat = pd.DataFrame(
        [
            {
                "categoria": c.nombre,
                "etiqueta": c.etiqueta,
                "corta": c.corta,
                "grupo": c.grupo,
                "orden": c.orden,
                "minimo_requerido": c.minimo_requerido,
            }
            for c in sorted(cfg.categorias, key=lambda x: x.orden)
        ]
    )
    # Categorías presentes en el dato pero no declaradas en la config.
    huerfanas = sorted(set(hecho["categoria"]) - set(dim_cat["categoria"]))
    if huerfanas:
        print(f"  ⚠ Categorías sin configurar (se agregan al final): {huerfanas}")
        extra = pd.DataFrame(
            [
                {
                    "categoria": h,
                    "etiqueta": h.title(),
                    "corta": h.title()[:12],
                    "grupo": "Sin clasificar",
                    "orden": 900 + i,
                    "minimo_requerido": 1,
                }
                for i, h in enumerate(huerfanas)
            ]
        )
        dim_cat = pd.concat([dim_cat, extra], ignore_index=True)

    # 3) Validación ---------------------------------------------------------
    val = (
        {"ejecutada": False, "motivo": "Desactivada con --sin-validar"}
        if args.sin_validar
        else validar_contra_oficial(categoria_dia, libro.get(sources.HOJA_OFICIAL), cfg)
    )

    # 4) Escritura ----------------------------------------------------------
    salida = args.salida if args.salida.is_absolute() else (raiz / args.salida).resolve()
    if salida.exists():
        shutil.rmtree(salida)
    print(f"→ Escribiendo artefactos en {salida} …")

    tablas = [
        emit.escribir_tabla(hecho, salida, "fact_establecimiento_dia"),
        emit.escribir_tabla(categoria_dia, salida, "fact_categoria_dia"),
        emit.escribir_tabla(dia, salida, "fact_dia"),
        emit.escribir_tabla(mes_q, salida, "fact_mes_quincena"),
        emit.escribir_tabla(mes, salida, "fact_mes"),
        emit.escribir_tabla(dim_cal, salida, "dim_calendario"),
        emit.escribir_tabla(dim_cat, salida, "dim_categoria"),
        emit.escribir_tabla(dim_aloj, salida, "dim_alojamiento"),
        emit.escribir_tabla(dim_evt, salida, "dim_evento"),
    ]

    meta = emit.construir_meta(
        cfg, tablas, hecho, categoria_dia, dia, val,
        libro.origen, origen_hash, sin_clasificar,
    )
    emit.escribir_meta(meta, salida)

    imprimir_informe(meta, val)

    if (
        val.get("ejecutada")
        and not val["dentro_de_umbral"]
        and not args.permitir_diferencias
    ):
        print("✗ La divergencia con la planilla oficial supera el umbral. Revisar antes de publicar.")
        print("  (usar --permitir-diferencias si la divergencia es intencional)\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
