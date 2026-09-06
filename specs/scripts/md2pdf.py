#!/usr/bin/env python3
"""Convierte los .md del repo a PDF con tipografía de lectura.

Antigravity y otros clientes no aceptan adjuntos .md, así que todo prompt o
documento que se entregue para pegar en un agente sale en PDF.

Sin dependencias: markdown -> HTML -> Chromium headless --print-to-pdf.

    python3 specs/scripts/md2pdf.py prompts/00e-superficie-de-oferta.md
    python3 specs/scripts/md2pdf.py --all            # todos los prompts
    python3 specs/scripts/md2pdf.py --all --docs     # prompts + docs
"""
from __future__ import annotations

import argparse
import html
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "pdf"

CHROMIUM = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
]

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
       color: #14181d; margin: 0; -webkit-print-color-adjust: exact; }
h1 { font-size: 19pt; line-height: 1.25; margin: 0 0 2mm; letter-spacing: -.2pt; }
h2 { font-size: 13.5pt; margin: 8mm 0 2.5mm; padding-bottom: 1.5mm;
     border-bottom: 1px solid #d8dde3; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h1+p, h2+p, h3+p { margin-top: 0; }
p { margin: 0 0 3mm; }
a { color: #1a5fb4; text-decoration: none; }
code { font: 9pt/1.4 "SF Mono", "Cascadia Mono", Consolas, monospace;
       background: #eef1f5; padding: .5mm 1.2mm; border-radius: 2px; }
pre { background: #f6f8fa; border: 1px solid #dde3ea; border-left: 3px solid #6b7785;
      border-radius: 3px; padding: 3.5mm 4mm; margin: 0 0 4mm;
      page-break-inside: auto; }
pre code { background: none; padding: 0; font-size: 8.4pt; line-height: 1.42;
           white-space: pre-wrap; word-break: break-word; }
blockquote { margin: 0 0 4mm; padding: 2.5mm 4mm; background: #fff8e6;
             border-left: 3px solid #d99b1c; page-break-inside: avoid; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 0 0 4mm; font-size: 9pt;
        page-break-inside: avoid; }
th { text-align: left; background: #eef1f5; border-bottom: 1.5px solid #c3ccd6; }
th, td { padding: 1.6mm 2.2mm; border-bottom: 1px solid #e3e8ee; vertical-align: top; }
td:nth-child(n+2) { font-variant-numeric: tabular-nums; }
ul, ol { margin: 0 0 3.5mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
hr { border: none; border-top: 1px solid #d8dde3; margin: 6mm 0; }
strong { font-weight: 650; }
.pie { margin-top: 8mm; padding-top: 2.5mm; border-top: 1px solid #d8dde3;
       font-size: 8pt; color: #6b7785; }
"""


def en_linea(t: str) -> str:
    """Marcado de línea. El código va primero y queda protegido del resto."""
    trozos: list[str] = []

    def guardar(m: re.Match) -> str:
        trozos.append(f"<code>{html.escape(m.group(1))}</code>")
        return f"\x00{len(trozos) - 1}\x00"

    t = re.sub(r"`([^`]+)`", guardar, t)
    t = html.escape(t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?!\w)", r"<em>\1</em>", t)
    return re.sub(r"\x00(\d+)\x00", lambda m: trozos[int(m.group(1))], t)


def fila(linea: str) -> list[str]:
    return [c.strip() for c in linea.strip().strip("|").split("|")]


def a_html(md: str) -> tuple[str, str]:
    lineas = md.split("\n")
    out: list[str] = []
    titulo = ""
    i = 0
    while i < len(lineas):
        ln = lineas[i]

        if ln.startswith("```"):                                   # código
            i += 1
            buf = []
            while i < len(lineas) and not lineas[i].startswith("```"):
                buf.append(lineas[i]); i += 1
            out.append("<pre><code>" + html.escape("\n".join(buf)) + "</code></pre>")
            i += 1; continue

        if (i + 1 < len(lineas) and ln.strip().startswith("|")       # tabla
                and re.match(r"^\s*\|[\s:|-]+\|\s*$", lineas[i + 1])):
            cab = fila(ln); i += 2
            cuerpo = []
            while i < len(lineas) and lineas[i].strip().startswith("|"):
                cuerpo.append(fila(lineas[i])); i += 1
            th = "".join(f"<th>{en_linea(c)}</th>" for c in cab)
            tr = "".join("<tr>" + "".join(f"<td>{en_linea(c)}</td>" for c in f) + "</tr>"
                         for f in cuerpo)
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
            continue

        if ln.startswith(">"):                                     # cita
            buf = []
            while i < len(lineas) and lineas[i].startswith(">"):
                buf.append(lineas[i].lstrip(">").strip()); i += 1
            partes = "".join(f"<p>{en_linea(p)}</p>"
                             for p in re.split(r"\n\s*\n", "\n".join(buf)) if p.strip())
            out.append(f"<blockquote>{partes}</blockquote>"); continue

        if re.match(r"^(-{3,}|\*{3,})\s*$", ln):
            out.append("<hr>"); i += 1; continue

        m = re.match(r"^(#{1,4})\s+(.*)$", ln)                      # títulos
        if m:
            n = len(m.group(1)); txt = m.group(2).strip()
            if n == 1 and not titulo:
                titulo = re.sub(r"<[^>]+>", "", en_linea(txt))
            out.append(f"<h{n}>{en_linea(txt)}</h{n}>"); i += 1; continue

        if re.match(r"^\s*([-*+]|\d+[.)])\s+", ln):                 # listas
            ordenada = bool(re.match(r"^\s*\d+[.)]\s+", ln))
            items = []
            while i < len(lineas) and re.match(r"^\s*([-*+]|\d+[.)])\s+", lineas[i]):
                items.append(re.sub(r"^\s*([-*+]|\d+[.)])\s+", "", lineas[i])); i += 1
                while (i < len(lineas) and lineas[i].startswith(("   ", "\t"))
                       and lineas[i].strip()):
                    items[-1] += " " + lineas[i].strip(); i += 1
            tag = "ol" if ordenada else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{en_linea(x)}</li>" for x in items)
                       + f"</{tag}>"); continue

        if not ln.strip():
            i += 1; continue

        buf = []                                                    # párrafo
        while i < len(lineas) and lineas[i].strip() and not re.match(
                r"^(#{1,4}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|\|)", lineas[i]):
            buf.append(lineas[i].strip()); i += 1
        out.append(f"<p>{en_linea(' '.join(buf))}</p>")

    return titulo, "\n".join(out)


def convertir(md_path: pathlib.Path, chrome: str, salida: pathlib.Path) -> pathlib.Path:
    titulo, cuerpo = a_html(md_path.read_text(encoding="utf-8"))
    titulo = titulo or md_path.stem
    doc = (f"<!doctype html><html lang=es><head><meta charset=utf-8>"
           f"<title>{html.escape(titulo)}</title><style>{CSS}</style></head><body>"
           f"{cuerpo}"
           f"<div class=pie>Esquel DATA 360° · {html.escape(md_path.as_posix())} · "
           f"generado con specs/scripts/md2pdf.py</div></body></html>")
    salida.mkdir(parents=True, exist_ok=True)
    pdf = salida / (md_path.stem + ".pdf")
    with tempfile.TemporaryDirectory() as tmp:
        htm = pathlib.Path(tmp) / "d.html"
        htm.write_text(doc, encoding="utf-8")
        subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--no-pdf-header-footer", "--virtual-time-budget=8000",
             f"--user-data-dir={tmp}/perfil",
             f"--print-to-pdf={pdf}", htm.as_uri()],
            check=True, capture_output=True, timeout=120)
    return pdf


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archivos", nargs="*")
    ap.add_argument("--all", action="store_true", help="todos los prompts")
    ap.add_argument("--docs", action="store_true", help="sumar docs/ y la raíz")
    ap.add_argument("--out", default=str(SALIDA))
    a = ap.parse_args()

    chrome = next((c for c in CHROMIUM if shutil.which(c) or pathlib.Path(c).is_file()),
                  shutil.which("chromium") or "")
    if not chrome:
        print("No se encontró Chromium. Instalado por Playwright en "
              "PLAYWRIGHT_BROWSERS_PATH; nunca ejecutar `playwright install` (I6).",
              file=sys.stderr)
        return 1

    objetivos = [pathlib.Path(x) for x in a.archivos]
    if a.all:
        objetivos += sorted((RAIZ / "prompts").glob("*.md"))
    if a.docs:
        objetivos += sorted((RAIZ / "docs").glob("*.md")) + [RAIZ / "AGENTS.md"]
    objetivos = [p if p.is_absolute() else RAIZ / p for p in objetivos]
    if not objetivos:
        ap.print_help(); return 2

    for p in objetivos:
        if not p.is_file():
            print(f"  falta {p}", file=sys.stderr); continue
        pdf = convertir(p, chrome, pathlib.Path(a.out))
        print(f"  {p.relative_to(RAIZ)}  ->  {pdf.relative_to(RAIZ)}  "
              f"({pdf.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
