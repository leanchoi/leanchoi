#!/usr/bin/env python3
"""
Generador de la capa semántica a partir del catálogo.

Una sola fuente de verdad (specs/catalogo/*.yaml) produce:
  · tipos y metadatos para el tablero  (TypeScript)
  · validadores para el ETL            (Python)
  · ficha metodológica pública         (Markdown)

Ejecutar en CI: si la salida difiere de lo commiteado, el build falla. Eso es lo
que garantiza que el tablero, el ETL y la documentación no puedan divergir.

    python3 specs/scripts/gen_catalogo.py            # genera
    python3 specs/scripts/gen_catalogo.py --check    # solo valida (para CI)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

import yaml

RAIZ = pathlib.Path(__file__).resolve().parents[2]
CAT = RAIZ / "specs" / "catalogo"

CAMPOS = ["id", "nombre", "familia", "definicion", "formula", "unidad", "grano",
          "fuentes", "confianza", "cobertura_minima", "direccion", "interpretacion",
          "decision", "destinatarios", "doc", "version"]

UNIDADES = {"ars", "usd", "pct", "ratio", "idx", "noches", "pernoctes", "plazas",
            "dias", "vuelos", "pp"}
FAMILIAS = {"conectividad", "costo", "mercado", "demanda", "riesgo", "calidad"}
CONFIANZA = {"A", "B", "C", "D"}
DIRECCION = {"alto", "bajo", "neutro"}


def cargar() -> tuple[dict, dict]:
    ind = yaml.safe_load((CAT / "indicadores.yaml").read_text(encoding="utf-8"))
    ins = yaml.safe_load((CAT / "insights.yaml").read_text(encoding="utf-8"))
    return ind, ins


def validar(ind: dict, ins: dict) -> list[str]:
    errores: list[str] = []
    vistos: set[str] = set()
    for i in ind["indicadores"]:
        pid = i.get("id", "(sin id)")
        for c in CAMPOS:
            if c not in i or i[c] in (None, "", []):
                errores.append(f"{pid}: falta el campo obligatorio '{c}'")
        if pid in vistos:
            errores.append(f"{pid}: id duplicado")
        vistos.add(pid)
        if i.get("familia") not in FAMILIAS:
            errores.append(f"{pid}: familia inválida '{i.get('familia')}'")
        if i.get("unidad") not in UNIDADES:
            errores.append(f"{pid}: unidad inválida '{i.get('unidad')}'")
        if i.get("confianza") not in CONFIANZA:
            errores.append(f"{pid}: confianza inválida '{i.get('confianza')}'")
        if i.get("direccion") not in DIRECCION:
            errores.append(f"{pid}: direccion inválida '{i.get('direccion')}'")
        # Regla de admisión: sin decisión asociada, el indicador es ruido.
        if len(str(i.get("decision", ""))) < 20:
            errores.append(f"{pid}: 'decision' vacía o trivial — no cumple la regla de admisión")

    for r in ins["reglas"]:
        rid = r.get("id", "(sin id)")
        if not r.get("accion"):
            errores.append(f"regla {rid}: sin 'accion' — no debería existir")
        for ref in list(r.get("requiere", [])) + list(r.get("evidencia", [])):
            if ref not in vistos:
                errores.append(f"regla {rid}: referencia al indicador inexistente '{ref}'")
    return errores


def ts(ind: dict, ins: dict) -> str:
    filas = []
    for i in ind["indicadores"]:
        filas.append("  " + json.dumps({
            "id": i["id"], "nombre": i["nombre"], "familia": i["familia"],
            "unidad": i["unidad"], "confianza": i["confianza"],
            "coberturaMinima": i["cobertura_minima"], "direccion": i["direccion"],
            "definicion": i["definicion"].strip(),
            "interpretacion": " ".join(i["interpretacion"].split()),
            "decision": " ".join(i["decision"].split()),
            "destinatarios": i["destinatarios"], "doc": i["doc"],
        }, ensure_ascii=False))
    ids = "\n".join(f"  | '{i['id']}'" for i in ind["indicadores"])
    cuerpo = ",\n".join(filas)
    fams = " | ".join(f"'{f}'" for f in sorted(FAMILIAS))
    unis = " | ".join(f"'{u}'" for u in sorted(UNIDADES))
    reglas = "\n".join(f"  | '{r['id']}'" for r in ins["reglas"])
    return f"""// GENERADO POR specs/scripts/gen_catalogo.py — NO EDITAR A MANO.
// Fuente: specs/catalogo/indicadores.yaml (v{ind['version_catalogo']})

export type IndicadorId =
{ids};

export type ReglaId =
{reglas};

export type Familia = {fams};
export type Unidad  = {unis};
export type Confianza = 'A' | 'B' | 'C' | 'D';

export interface Indicador {{
  id: IndicadorId;
  nombre: string;
  familia: Familia;
  unidad: Unidad;
  confianza: Confianza;
  coberturaMinima: number;
  direccion: 'alto' | 'bajo' | 'neutro';
  definicion: string;
  interpretacion: string;
  decision: string;
  destinatarios: string[];
  doc: string;
}}

export const INDICADORES: readonly Indicador[] = [
{cuerpo}
] as const;

export const PORid: Record<IndicadorId, Indicador> =
  Object.fromEntries(INDICADORES.map(i => [i.id, i])) as Record<IndicadorId, Indicador>;

/** Etiqueta de confianza para el semáforo. Ver docs/06 §5. */
export const ETIQUETA_CONFIANZA: Record<Confianza, string> = {{
  A: 'Oficial',
  B: 'Observado',
  C: 'Modelado',
  D: 'Insuficiente',
}};

/** Un indicador es publicable fuera del organismo solo con confianza A o B. */
export const esPublicable = (i: Indicador): boolean => i.confianza === 'A' || i.confianza === 'B';

/** Serie preliminar: se marca visualmente cuando no llega a su cobertura mínima. */
export const esPreliminar = (i: Indicador, cobertura: number): boolean =>
  cobertura < i.coberturaMinima;
"""


def py(ind: dict, ins: dict) -> str:
    d = {i["id"]: {k: i[k] for k in
                   ("nombre", "familia", "unidad", "confianza", "cobertura_minima",
                    "direccion", "grano", "fuentes", "doc")}
         for i in ind["indicadores"]}
    return f'''"""GENERADO POR specs/scripts/gen_catalogo.py — NO EDITAR A MANO.
Fuente: specs/catalogo/indicadores.yaml (v{ind["version_catalogo"]})
"""
from __future__ import annotations

VERSION_CATALOGO = {ind["version_catalogo"]}

INDICADORES: dict[str, dict] = {json.dumps(d, ensure_ascii=False, indent=4)}

REGLAS: tuple[str, ...] = {tuple(r["id"] for r in ins["reglas"])!r}


def validar_columnas(tabla: str, columnas: list[str]) -> list[str]:
    """Devuelve las columnas que no corresponden a ningún indicador del catálogo.

    Se llama desde emit.py antes de escribir cada tabla oro. Una columna que no
    está en el catálogo es un número sin definición, sin dueño y sin decisión
    asociada: exactamente lo que convierte un tablero en un despelote.
    """
    exentas = {{"fecha", "flight_date", "observed_date", "lead_dias", "lead_bucket",
               "destino", "origen", "ruta", "origin_iata", "dest_iata", "gateway_iata",
               "tipologia", "mes", "periodo", "semana_objetivo", "aerolinea", "corrida"}}
    return [c for c in columnas if c not in INDICADORES and c not in exentas]


def cobertura_suficiente(indicador: str, cobertura: float) -> bool:
    meta = INDICADORES.get(indicador)
    return meta is not None and cobertura >= meta["cobertura_minima"]


def es_publicable(indicador: str) -> bool:
    """Solo los indicadores oficiales u observados salen del organismo."""
    meta = INDICADORES.get(indicador)
    return meta is not None and meta["confianza"] in ("A", "B")
'''


def ficha(ind: dict, ins: dict) -> str:
    out = ["# Ficha metodológica — Esquel DATA 360°", "",
           "> GENERADO POR `specs/scripts/gen_catalogo.py`. No editar a mano.",
           f"> Catálogo v{ind['version_catalogo']} · "
           f"{len(ind['indicadores'])} indicadores · {len(ins['reglas'])} reglas.", "",
           "Grados de confianza: **A** oficial · **B** observado con cobertura "
           "suficiente · **C** modelado · **D** insuficiente. "
           "Solo A y B se publican fuera del organismo.", ""]
    for fam in sorted({i["familia"] for i in ind["indicadores"]}):
        out += [f"## {fam.capitalize()}", ""]
        for i in [x for x in ind["indicadores"] if x["familia"] == fam]:
            out += [
                f"### `{i['id']}` — {i['nombre']}",
                "",
                f"| | |", "|---|---|",
                f"| **Definición** | {i['definicion'].strip()} |",
                f"| **Fórmula** | `{i['formula']}` |",
                f"| **Unidad / grano** | {i['unidad']} · {', '.join(i['grano'])} |",
                f"| **Fuentes** | {', '.join(i['fuentes'])} |",
                f"| **Confianza** | {i['confianza']} (cobertura mínima {i['cobertura_minima']:.0%}) |",
                f"| **Interpretación** | {' '.join(i['interpretacion'].split())} |",
                f"| **Decisión que habilita** | {' '.join(i['decision'].split())} |",
                f"| **Destinatarios** | {', '.join(i['destinatarios'])} |",
                f"| **Referencia** | {i['doc']} |",
                "",
            ]
    out += ["## Reglas del motor de insights", "",
            "| Regla | Severidad | Se dispara cuando | Acción |", "|---|---|---|---|"]
    for r in ins["reglas"]:
        out.append(f"| `{r['id']}` | {r['severidad']} | `{r['cuando']}` | "
                   f"{' '.join(str(r['accion']).split())} |")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="valida y verifica que lo generado coincida con lo commiteado")
    ap.add_argument("--out-web", default="generated/web/indicadores.ts")
    ap.add_argument("--out-etl", default="generated/etl/indicadores.py")
    ap.add_argument("--out-doc", default="generated/docs/ficha-metodologica.md")
    a = ap.parse_args()

    ind, ins = cargar()
    errores = validar(ind, ins)
    if errores:
        print("VALIDACIÓN FALLIDA:", file=sys.stderr)
        for e in errores:
            print(f"  · {e}", file=sys.stderr)
        return 1
    print(f"Catálogo válido: {len(ind['indicadores'])} indicadores, "
          f"{len(ins['reglas'])} reglas.")

    salidas = {a.out_web: ts(ind, ins), a.out_etl: py(ind, ins), a.out_doc: ficha(ind, ins)}
    difiere = False
    for ruta, contenido in salidas.items():
        p = RAIZ / ruta
        if a.check:
            actual = p.read_text(encoding="utf-8") if p.exists() else ""
            if actual != contenido:
                print(f"DESACTUALIZADO: {ruta}", file=sys.stderr)
                difiere = True
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(contenido, encoding="utf-8")
            print(f"  escrito {ruta} ({len(contenido):,} bytes)")
    if a.check and difiere:
        print("Ejecutar: python3 specs/scripts/gen_catalogo.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
