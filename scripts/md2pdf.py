"""
Convierte un Markdown a PDF con Chromium headless.

    python scripts/md2pdf.py docs/prompt-antigravity-v12.md salida.pdf

Usa el Chromium que ya viene con Playwright en el entorno, asi que no hace
falta instalar pandoc ni wkhtmltopdf. La hoja de estilo esta pensada para
documentos de trabajo: tablas legibles, bloques de codigo que no se cortan a
la mitad de una pagina, y titulos que no quedan huerfanos al pie.
"""
import sys
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "DejaVu Sans", "Liberation Sans", system-ui, sans-serif;
  font-size: 10.2pt; line-height: 1.55; color: #1a1a1a; margin: 0;
}
h1 {
  font-size: 20pt; line-height: 1.2; margin: 0 0 4pt; letter-spacing: -.01em;
  padding-bottom: 8pt; border-bottom: 2.5pt solid #111;
}
h1 + blockquote { margin-top: 10pt; }
h2 {
  font-size: 14pt; margin: 22pt 0 7pt; padding-top: 10pt;
  border-top: .7pt solid #d4d4d4; letter-spacing: -.01em;
  break-after: avoid; page-break-after: avoid;
}
h3 { font-size: 11.4pt; margin: 15pt 0 5pt; break-after: avoid; }
h4 { font-size: 10.4pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 8pt; padding-left: 17pt; }
li { margin-bottom: 3pt; }
li > p { margin-bottom: 3pt; }
strong { font-weight: 650; }
code {
  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
  font-size: 8.7pt; background: #f2f2f0; padding: .8pt 3pt;
  border-radius: 2pt; border: .4pt solid #e2e2de;
}
pre {
  background: #f7f7f5; border: .6pt solid #e2e2de; border-left: 2.5pt solid #999;
  padding: 8pt 10pt; border-radius: 3pt; overflow-x: auto;
  margin: 0 0 9pt; break-inside: avoid; page-break-inside: avoid;
}
pre code { background: none; border: none; padding: 0; font-size: 8.3pt;
  line-height: 1.42; white-space: pre-wrap; word-break: break-word; }
blockquote {
  margin: 0 0 9pt; padding: 7pt 11pt; background: #fbfaf7;
  border-left: 2.5pt solid #b8b099; color: #3a3a3a; font-size: 9.7pt;
}
blockquote p:last-child { margin-bottom: 0; }
table {
  border-collapse: collapse; width: 100%; margin: 0 0 10pt; font-size: 9.1pt;
  break-inside: avoid; page-break-inside: avoid;
}
th, td { border: .5pt solid #d8d8d4; padding: 4.5pt 6pt; text-align: left;
  vertical-align: top; }
th { background: #f2f2ef; font-weight: 650; }
tr:nth-child(even) td { background: #fafaf8; }
hr { border: none; border-top: .8pt solid #ccc; margin: 18pt 0; }
a { color: #1a1a1a; text-decoration: none; border-bottom: .5pt solid #bbb; }
em { color: #333; }
"""

TPL = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>{titulo}</title><style>{css}</style></head><body>{cuerpo}</body></html>"""


def main(entrada: str, salida: str) -> None:
    texto = Path(entrada).read_text(encoding="utf-8")
    cuerpo = markdown.markdown(
        texto, extensions=["tables", "fenced_code", "sane_lists", "attr_list"])
    html = TPL.format(titulo=Path(entrada).stem, css=CSS, cuerpo=cuerpo)

    tmp = Path(salida).with_suffix(".html")
    tmp.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        nav = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        pag = nav.new_page()
        pag.goto(f"file://{tmp.resolve()}", wait_until="networkidle")
        pag.pdf(path=salida, format="A4", print_background=True,
                margin={"top": "18mm", "bottom": "20mm",
                        "left": "16mm", "right": "16mm"},
                display_header_footer=True,
                header_template="<div></div>",
                footer_template=(
                    '<div style="width:100%;font-size:7.5pt;color:#999;'
                    'font-family:sans-serif;padding:0 16mm;display:flex;'
                    'justify-content:space-between;">'
                    '<span>Guillotina</span>'
                    '<span class="pageNumber"></span></div>'))
        nav.close()
    tmp.unlink(missing_ok=True)
    print(f"{salida}  ({Path(salida).stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
