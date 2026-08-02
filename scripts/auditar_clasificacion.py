#!/usr/bin/env python3
"""
Auditoría READ-ONLY del clasificador y del scraper de Media Abrojal.

No escribe absolutamente nada en la base. Solo lee y produce un informe.

Uso en el VPS:
    python3 auditar_clasificacion.py \
        --db /opt/red43_allsite/masters/red43_allsite_enriched_v1.sqlite \
        --out auditoria.md

Responde empíricamente cuatro preguntas que el informe de Antigravity da por
resueltas pero no demuestra:

  1. ¿Cuántas notas de turismo REALES quedaron fuera de turismo?
     (falsos negativos por haber puesto Turismo al final de la cascada)
  2. ¿Cuántas notas tocan más de un área a la vez?
     (información que la cascada de etiqueta única descarta)
  3. ¿Tiene huecos la cobertura temporal del scraper?
     (histograma mensual: un mes con 0 notas es un bache)
  4. ¿Hay duplicados por reprocesamiento?
"""

import argparse
import os
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict

# --------------------------------------------------------------------------
# Léxicos temáticos. Deliberadamente NO son un clasificador: se usan solo para
# medir solapamiento entre áreas y detectar falsos negativos.
# --------------------------------------------------------------------------
LEXICO = {
    "turismo": [
        "la hoya", "los alerces", "la trochita", "futalaufquen", "parque nacional",
        "hotel", "hoteler", "hostel", "cabana", "camping", "turist", "turismo",
        "ocupacion hotelera", "temporada alta", "temporada invernal", "excursion",
        "agencia de viajes", "guia de turismo", "visitante", "pernocte", "esqui",
    ],
    "deportes": [
        "futbol", "partido", "torneo", "maraton", "campeonato", "deportiv",
        "seleccion", "gol", "atleta", "liga ", "copa ", "podio", "carrera",
    ],
    "salud": [
        "hospital", "pami", "vacuna", "salud mental", "enfermer", "medic",
        "sanitari", "epidemi", "dengue", "obra social", "quirofano", "paciente",
    ],
    "policial": [
        "policia", "delito", "robo", "homicidio", "detenid", "accidente",
        "incendio", "judicial", "fiscal", "juzgado", "condena", "siniestro",
    ],
    "politica": [
        "concejo deliberante", "eleccion", "intendent", "gobernador", "diputad",
        "senador", "decreto", "ordenanza", "legislatura", "ministro", "gabinete",
    ],
    "economia": [
        "paritaria", "inflacion", "alquiler", "tarifa", "comercio", "industria",
        "salario", "impuesto", "credito", "pyme", "produccion", "empleo",
    ],
    "obras_publicas": [
        "obra publica", "repavimenta", "pavimento", "vialidad", "saneamiento",
        "cloaca", "agua potable", "red de gas", "alumbrado", "infraestructura",
        "licitacion", "inaugur", "plan vial", "puente", "asfalto",
    ],
    "ambiente": [
        "incendio forestal", "alerta meteorolog", "emergencia climatica",
        "ambient", "residuos", "reciclaje", "fauna", "plaga", "puma", "cotorra",
        "sequia", "nevada", "viento",
    ],
    "cultura": [
        "festival", "teatro", "recital", "muestra", "artista", "musico",
        "biblioteca", "cultural", "exposicion", "cine",
    ],
}

CANDIDATOS_TABLA = ("nota", "note", "article", "articul", "post", "news")
CANDIDATOS_BUCKET = ("bucket", "categoria", "category", "tipologia", "tipo",
                     "grupo", "seccion", "area", "clasificacion", "taxonomia")
CANDIDATOS_TITULO = ("titulo", "title", "headline", "encabezado")
CANDIDATOS_CUERPO = ("cuerpo", "body", "contenido", "content", "texto", "text",
                     "resumen", "summary", "bajada", "descripcion")
CANDIDATOS_FECHA = ("fecha_publicacion", "published_at", "fecha", "date",
                    "pub_date", "created_at", "scraped_at", "fecha_scraping")
CANDIDATOS_URL = ("url", "link", "enlace", "permalink")


def normalizar(texto):
    """minúsculas sin acentos, para comparar de forma robusta"""
    if not texto:
        return ""
    t = unicodedata.normalize("NFD", str(texto))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.lower()


def elegir_columna(columnas, candidatos):
    norm = {normalizar(c): c for c in columnas}
    for cand in candidatos:                       # match exacto primero
        if cand in norm:
            return norm[cand]
    for cand in candidatos:                       # luego por substring
        for n, original in norm.items():
            if cand in n:
                return original
    return None


def temas_de(texto):
    n = normalizar(texto)
    return {tema for tema, kws in LEXICO.items() if any(k in n for k in kws)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", default="auditoria.md")
    ap.add_argument("--muestra", type=int, default=20)
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"ERROR: no existe la base {args.db}")

    # file:...?mode=ro  -> garantiza que no se puede escribir
    uri = f"file:{os.path.abspath(args.db)}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    out = []
    w = out.append
    w("# Auditoría de clasificación y scraper — Media Abrojal\n")
    w(f"Base: `{args.db}`  ({os.path.getsize(args.db) / 1e6:.1f} MB)\n")

    # ---------------------------------------------------------------- tablas
    tablas = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    w(f"\n## Tablas\n\n```\n{', '.join(tablas)}\n```\n")

    tabla = None
    mejor = -1
    for t in tablas:
        if any(c in normalizar(t) for c in CANDIDATOS_TABLA):
            try:
                n = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            except sqlite3.Error:
                continue
            if n > mejor:
                mejor, tabla = n, t
    if not tabla:
        sys.exit(f"No pude identificar la tabla de notas. Tablas: {tablas}")

    columnas = [r[1] for r in cur.execute(f'PRAGMA table_info("{tabla}")')]
    col_titulo = elegir_columna(columnas, CANDIDATOS_TITULO)
    col_cuerpo = elegir_columna(columnas, CANDIDATOS_CUERPO)
    col_fecha = elegir_columna(columnas, CANDIDATOS_FECHA)
    col_url = elegir_columna(columnas, CANDIDATOS_URL)
    cols_bucket = [c for c in columnas
                   if any(k in normalizar(c) for k in CANDIDATOS_BUCKET)]

    total = cur.execute(f'SELECT COUNT(*) FROM "{tabla}"').fetchone()[0]
    w(f"\nTabla de notas: **`{tabla}`** — **{total:,}** filas\n")
    w(f"\nColumnas detectadas: título=`{col_titulo}`  cuerpo=`{col_cuerpo}`  "
      f"fecha=`{col_fecha}`  bucket(s)=`{cols_bucket}`\n")
    w(f"\n<details><summary>Todas las columnas</summary>\n\n```\n"
      f"{', '.join(columnas)}\n```\n</details>\n")

    # ------------------------------------------------- distribución por bucket
    w("\n---\n\n## 1. Distribución por bucket\n")
    for cb in cols_bucket:
        w(f"\n### `{cb}`\n\n| valor | notas | % |\n|---|---:|---:|\n")
        filas = cur.execute(
            f'SELECT COALESCE("{cb}",\'(null)\') v, COUNT(*) n FROM "{tabla}" '
            f'GROUP BY v ORDER BY n DESC LIMIT 40').fetchall()
        for r in filas:
            w(f"| {r['v']} | {r['n']:,} | {100.0 * r['n'] / total:.2f}% |\n")

    # ------------------------------------------------ cobertura temporal
    w("\n---\n\n## 2. Cobertura temporal del scraper\n")
    if col_fecha:
        w(f"\nColumna usada: `{col_fecha}`\n\n")
        rango = cur.execute(
            f'SELECT MIN("{col_fecha}"), MAX("{col_fecha}") FROM "{tabla}" '
            f'WHERE "{col_fecha}" IS NOT NULL AND "{col_fecha}" != \'\'').fetchone()
        w(f"Rango: **{rango[0]}** → **{rango[1]}**\n")
        w("\nNotas por mes (un mes ausente o anómalamente bajo = bache del scraper):\n\n")
        w("| mes | notas |\n|---|---:|\n")
        filas = cur.execute(
            f'SELECT substr("{col_fecha}",1,7) m, COUNT(*) n FROM "{tabla}" '
            f'WHERE "{col_fecha}" IS NOT NULL AND "{col_fecha}" != \'\' '
            f'GROUP BY m ORDER BY m DESC LIMIT 30').fetchall()
        for r in filas:
            w(f"| {r['m']} | {r['n']:,} |\n")
        vacias = cur.execute(
            f'SELECT COUNT(*) FROM "{tabla}" WHERE "{col_fecha}" IS NULL '
            f'OR "{col_fecha}" = \'\'').fetchone()[0]
        w(f"\nNotas **sin fecha**: {vacias:,} ({100.0 * vacias / total:.2f}%)\n")
    else:
        w("\n_No se detectó columna de fecha._\n")

    # ------------------------------------------------------- duplicados
    w("\n## 3. Duplicados\n")
    if col_url:
        dup = cur.execute(
            f'SELECT COUNT(*) FROM (SELECT "{col_url}" FROM "{tabla}" '
            f'WHERE "{col_url}" IS NOT NULL GROUP BY "{col_url}" '
            f'HAVING COUNT(*) > 1)').fetchone()[0]
        w(f"\nURLs duplicadas: **{dup:,}**\n")
    if col_titulo:
        dupt = cur.execute(
            f'SELECT COUNT(*) FROM (SELECT "{col_titulo}" FROM "{tabla}" '
            f'WHERE "{col_titulo}" IS NOT NULL GROUP BY "{col_titulo}" '
            f'HAVING COUNT(*) > 1)').fetchone()[0]
        w(f"\nTítulos duplicados: **{dupt:,}**\n")

    # ------------------------------------- análisis de contenido (multi-tema)
    w("\n---\n\n## 4. Solapamiento temático y falsos negativos\n")
    if not col_titulo:
        w("\n_Sin columna de título, no puedo analizar contenido._\n")
        con.close()
        open(args.out, "w", encoding="utf-8").write("".join(out))
        return

    campos = [col_titulo] + ([col_cuerpo] if col_cuerpo else [])
    sel = ", ".join(f'"{c}"' for c in campos)
    cb = cols_bucket[0] if cols_bucket else None
    sel_full = f'{sel}, "{cb}"' if cb else sel

    n_temas = Counter()
    combos = Counter()
    por_bucket_temas = defaultdict(Counter)
    turismo_fuera = []
    n_multi = 0
    n_con_tema = 0
    leidas = 0

    for row in cur.execute(f'SELECT {sel_full} FROM "{tabla}"'):
        leidas += 1
        texto = " ".join(str(row[c] or "") for c in campos)
        temas = temas_de(texto)
        if not temas:
            continue
        n_con_tema += 1
        n_temas[len(temas)] += 1
        if len(temas) > 1:
            n_multi += 1
            combos["+".join(sorted(temas))] += 1
        if cb:
            bucket_actual = normalizar(row[cb])
            for t in temas:
                por_bucket_temas[row[cb]][t] += 1
            # falso negativo de turismo: habla de turismo pero no está en turismo
            if "turismo" in temas and "turismo" not in bucket_actual:
                if len(turismo_fuera) < args.muestra:
                    turismo_fuera.append(
                        (row[cb], str(row[col_titulo])[:110]))

    w(f"\nNotas analizadas: {leidas:,} — con al menos un tema detectado: "
      f"{n_con_tema:,}\n")
    w(f"\n**Notas que tocan más de un área: {n_multi:,} "
      f"({100.0 * n_multi / max(n_con_tema, 1):.1f}% de las temáticas)**\n")
    w("\nEsto es lo que una cascada de etiqueta única descarta: cada una de "
      "esas notas se fuerza a un solo bucket y desaparece de los demás.\n")

    w("\n| temas por nota | cantidad |\n|---|---:|\n")
    for k in sorted(n_temas):
        w(f"| {k} | {n_temas[k]:,} |\n")

    w("\n### Combinaciones más frecuentes\n\n| combinación | notas |\n|---|---:|\n")
    for c, n in combos.most_common(15):
        w(f"| {c} | {n:,} |\n")

    if cb:
        w(f"\n### Falsos negativos de turismo\n")
        w(f"\nNotas con indicadores reales de turismo que quedaron en OTRO "
          f"bucket de `{cb}`:\n\n")
        if turismo_fuera:
            w("| bucket asignado | título |\n|---|---|\n")
            for b, t in turismo_fuera:
                w(f"| `{b}` | {t.replace('|', '/')} |\n")
        else:
            w("_Ninguno detectado._\n")

        w(f"\n### Composición temática real de cada bucket\n")
        w("\nSi un bucket tiene mayoría de un tema que no es el suyo, está mal armado.\n\n")
        for bucket, cnt in sorted(por_bucket_temas.items(),
                                  key=lambda x: -sum(x[1].values()))[:15]:
            tot = sum(cnt.values())
            top = ", ".join(f"{t} {100.0 * n / tot:.0f}%"
                            for t, n in cnt.most_common(5))
            w(f"- **`{bucket}`** ({tot:,}): {top}\n")

    con.close()
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("".join(out))
    print(f"OK -> {args.out}")
    print(f"   {total:,} notas | {n_multi:,} multi-tema | "
          f"{len(turismo_fuera)} ejemplos de turismo mal ubicado")


if __name__ == "__main__":
    main()
