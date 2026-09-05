#!/usr/bin/env python3
"""
F0 — Spike de validación de Métrica Aéreos.

Ejecutar EN EL VPS antes de escribir el colector (docs/01 §6, docs/04 F0).
Todas las pruebas son de SOLO LECTURA: no modifica nada, no crea nada.

    python3 f0_validacion.py --all
    python3 f0_validacion.py --check 1 2 7
    python3 f0_validacion.py --check 8 --plazas-hoteleras 1800 \
        --pernoctes-mes 32000 --frecuencias-semana 3 --butacas 96

Dependencias opcionales (el script degrada a SKIP si faltan):
    pip install fast-flights psycopg[binary]

NOTA: este script fue especificado, no ejecutado, en el entorno donde se redactó
la revisión — los dominios .gob.ar estaban bloqueados por el proxy de egreso y no
había acceso al VPS. Verificar cada prueba en su primera corrida real.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, timedelta

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

PASS, FAIL, WARN, SKIP = "PASS", "FAIL", "WARN", "SKIP"


@dataclass
class Resultado:
    codigo: str
    titulo: str
    estado: str = SKIP
    detalle: str = ""
    notas: list[str] = field(default_factory=list)


def http_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _fast_flights():
    try:
        import fast_flights  # noqa: F401
        return fast_flights
    except ImportError:
        return None


def _buscar(origen: str, destino: str, dias: int):
    """Devuelve (ok, itinerarios, error). Adaptar a la API de la versión instalada."""
    ff = _fast_flights()
    if ff is None:
        return None, [], "fast-flights no instalado"
    fecha = (date.today() + timedelta(days=dias)).isoformat()
    try:
        res = ff.get_flights(
            flight_data=[ff.FlightData(date=fecha, from_airport=origen, to_airport=destino)],
            trip="one-way",
            seat="economy",
            passengers=ff.Passengers(adults=1),
            fetch_mode="common",
        )
        return True, list(getattr(res, "flights", []) or []), ""
    except Exception as exc:  # noqa: BLE001
        return False, [], f"{type(exc).__name__}: {exc}"


# ---------------------------------------------------------------------------
# F0-1 — ¿Google Flights lista Flybondi y JetSMART?  LA PRUEBA QUE DECIDE.
# ---------------------------------------------------------------------------
def check_1() -> Resultado:
    r = Resultado("F0-1", "Cobertura de low-cost en Google Flights (BUE→BRC)")
    r.notas.append("Verificación manual equivalente: abrir en un navegador\n"
                   "  https://www.google.com/travel/flights?hl=es-AR&gl=AR&curr=ARS\n"
                   "  y buscar Buenos Aires → Bariloche a 30 días. Revisar si aparecen "
                   "Flybondi y JetSMART.")
    ok, vuelos, err = _buscar("BUE", "BRC", 30)
    if ok is None:
        r.estado, r.detalle = SKIP, err
        return r
    if not ok:
        r.estado, r.detalle = FAIL, err
        return r
    nombres = " | ".join(str(getattr(v, "name", "")) for v in vuelos).lower()
    fo = "flybondi" in nombres
    wj = "jetsmart" in nombres or "jet smart" in nombres
    r.detalle = f"{len(vuelos)} itinerarios · Flybondi={fo} · JetSMART={wj}"
    if fo and wj:
        r.estado = PASS
    elif fo or wj:
        r.estado = WARN
        r.notas.append("Cobertura parcial: agregar scraping semanal del operador ausente "
                       "solo para BUE-BRC, como corrector de nivel.")
    else:
        r.estado = FAIL
        r.notas.append("BIFURCACIÓN: agregar scraping semanal de flybondi.com solo BUE-BRC. "
                       "NO usar Amadeus Self-Service (excluye low-cost y sesga la "
                       "comparación en la dirección que invalida la tesis — H6).")
    return r


# ---------------------------------------------------------------------------
# F0-2 — Ruta núcleo BUE→EQS en tres horizontes
# ---------------------------------------------------------------------------
def check_2() -> Resultado:
    r = Resultado("F0-2", "Ruta núcleo BUE→EQS a 30/60/90 días")
    filas, faltantes = [], 0
    for dias in (30, 60, 90):
        ok, vuelos, err = _buscar("BUE", "EQS", dias)
        if ok is None:
            r.estado, r.detalle = SKIP, err
            return r
        if not ok or not vuelos:
            faltantes += 1
            filas.append(f"T+{dias}: 0 ({err or 'sin resultados'})")
        else:
            filas.append(f"T+{dias}: {len(vuelos)}")
        time.sleep(random.uniform(15, 45))
    r.detalle = " · ".join(filas)
    r.estado = PASS if faltantes == 0 else (WARN if faltantes < 3 else FAIL)
    if faltantes:
        r.notas.append("Revisar cabeceras completas y parámetros hl/gl/curr; "
                       "probar el engine google_flights de SerpApi como contraste.")
    return r


# ---------------------------------------------------------------------------
# F0-3 — Tolerancia de la IP del VPS a 30 consultas espaciadas
# ---------------------------------------------------------------------------
def check_3(n: int = 30) -> Resultado:
    r = Resultado("F0-3", f"{n} consultas espaciadas desde la IP del VPS")
    if _fast_flights() is None:
        r.estado, r.detalle = SKIP, "fast-flights no instalado"
        return r
    destinos = ["BRC", "EQS", "CPC", "PMY", "REL", "USH", "FTE", "CRD", "MDZ", "NQN"]
    ok_n = vacias = errores = 0
    t0 = time.time()
    for i in range(n):
        ok, vuelos, _ = _buscar("BUE", destinos[i % len(destinos)], 30 + i)
        if ok and vuelos:
            ok_n += 1
        elif ok:
            vacias += 1
        else:
            errores += 1
        if i < n - 1:
            time.sleep(random.uniform(15, 45))
    mins = (time.time() - t0) / 60
    r.detalle = f"ok={ok_n} vacías={vacias} errores={errores} · {mins:.1f} min"
    if errores == 0:
        r.estado = PASS
    elif errores <= 2:
        r.estado = WARN
        r.notas.append("Subir el espaciado a 60 s y recalcular el presupuesto de docs/01 §4.3.")
    else:
        r.estado = FAIL
        r.notas.append("Bloqueo desde IP de datacenter. Reevaluar SerpApi como motor primario "
                       "antes que introducir proxies residenciales (H13-c).")
    return r


# ---------------------------------------------------------------------------
# F0-4 / F0-5 — Datos abiertos oficiales vía CKAN
# ---------------------------------------------------------------------------
def _ckan(portal: str, dataset: str, codigo: str, titulo: str,
          pistas: tuple[str, ...]) -> Resultado:
    r = Resultado(codigo, titulo)
    url = f"{portal}/api/3/action/package_show?id={dataset}"
    try:
        data = http_json(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        r.estado, r.detalle = FAIL, f"{type(exc).__name__}: {exc}"
        r.notas.append(f"Probar el espejo del otro portal, o abrir {portal}/dataset/{dataset} "
                       "en un navegador y descargar el recurso manualmente.")
        return r
    recursos = data.get("result", {}).get("resources", [])
    if not recursos:
        r.estado, r.detalle = FAIL, "package_show sin recursos"
        return r
    r.estado = PASS
    r.detalle = f"{len(recursos)} recursos"
    for rec in recursos[:8]:
        r.notas.append(f"- [{rec.get('format','?')}] {rec.get('name','(sin nombre)')} "
                       f"-> {rec.get('url','')}")
    r.notas.append("INSPECCIÓN MANUAL OBLIGATORIA antes de escribir el parser:")
    r.notas.append("  · nombres exactos de columna: " + ", ".join(pistas))
    r.notas.append("  · ¿códigos IATA (EQS) u OACI (SAVE)?")
    r.notas.append("  · ¿se suprimen celdas de bajo volumen? Con 3 frecuencias semanales, "
                   "Esquel puede caer bajo el umbral de secreto estadístico (docs/05 §5).")
    return r


def check_4() -> Resultado:
    return _ckan("https://datos.yvera.gob.ar", "conectividad-aerea", "F0-4",
                 "ANAC/SIAC — Conectividad Aérea",
                 ("origen", "destino", "pasajeros", "butacas", "vuelos", "fecha"))


def check_5() -> Resultado:
    return _ckan("https://datos.yvera.gob.ar", "encuesta-ocupacion-hotelera-parahotelera-eoh",
                 "F0-5", "EOH — Ocupación hotelera oficial",
                 ("region", "provincia", "localidad", "pernoctes", "tasa_ocupacion"))


# ---------------------------------------------------------------------------
# F0-6 — Contrato de lectura sobre Métrica
# ---------------------------------------------------------------------------
def check_6(dsn: str | None) -> Resultado:
    r = Resultado("F0-6", "Contrato de lectura sobre PostgreSQL de Métrica")
    if not dsn:
        r.estado = SKIP
        r.detalle = "sin DSN (usar --dsn o la variable de entorno METRICA_RO_DSN)"
        return r
    try:
        import psycopg
    except ImportError:
        r.estado, r.detalle = SKIP, "psycopg no instalado"
        return r
    try:
        with psycopg.connect(dsn, application_name="esquel_data_etl_f0") as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_name FROM information_schema.tables
                     WHERE table_schema = 'public' ORDER BY table_name
                """)
                tablas = [t[0] for t in cur.fetchall()]
                t0 = time.time()
                cur.execute("SELECT count(*) FROM price_observations")
                n = cur.fetchone()[0]
                dt = time.time() - t0
        r.estado = PASS
        r.detalle = f"{len(tablas)} tablas · {n:,} observaciones · count en {dt:.1f} s"
        r.notas.append("Tablas: " + ", ".join(tablas[:25]))
        r.notas.append("Mapear estos nombres reales en specs/sql/02_metrica_contract.sql "
                       "y luego medir el p95 de las dos consultas del contrato.")
        r.notas.append("VERIFICAR TAMBIÉN que el rol NO pueda escribir: un INSERT de prueba "
                       "debe fallar con 'permission denied' (criterio 1 de F2).")
    except Exception as exc:  # noqa: BLE001
        r.estado, r.detalle = FAIL, f"{type(exc).__name__}: {exc}"
    return r


# ---------------------------------------------------------------------------
# F0-7 — COR→EQS: confirmar que solo hay itinerarios con conexión
# ---------------------------------------------------------------------------
def check_7() -> Resultado:
    r = Resultado("F0-7", "COR→EQS: estructura de conexiones")
    ok, vuelos, err = _buscar("COR", "EQS", 30)
    if ok is None:
        r.estado, r.detalle = SKIP, err
        return r
    if not ok or not vuelos:
        r.estado, r.detalle = WARN, err or "sin resultados"
        r.notas.append("Si nunca devuelve itinerarios, modelar Córdoba solo como BUE con "
                       "tramo previo COR-AEP.")
        return r
    directos = sum(1 for v in vuelos if "nonstop" in str(getattr(v, "stops", "")).lower()
                   or str(getattr(v, "stops", "")) == "0")
    r.estado = PASS
    r.detalle = f"{len(vuelos)} itinerarios · directos={directos}"
    if directos:
        r.notas.append("INESPERADO: se detectaron directos COR-EQS. Contrastar con horarios "
                       "publicados; puede ser estacional o un error de parseo.")
    else:
        r.notas.append("Confirmado: todo COR-EQS es con conexión. Registrar stops_count y "
                       "duración total; el TTCI desde Córdoba debe incorporar costo de tiempo.")
    return r


# ---------------------------------------------------------------------------
# F0-8 — Cuota estructural del canal aéreo, como PERFIL MENSUAL.
# Corregido en la 2ª revisión: Esquel no tiene frecuencia constante (6 de base,
# 7 con la ruta COR en ago-sep, hasta 9 en Tulipanes). σ_aéreo es un perfil, no
# un escalar. Ver docs/07 §1.
# ---------------------------------------------------------------------------
PERFIL_EQS = {"ene": 6, "feb": 6, "mar": 6, "abr": 6, "may": 6, "jun": 6,
              "jul": 6, "ago": 7, "sep": 7, "oct": 9, "nov": 9, "dic": 6}


def check_8(perfil: dict[str, float], butacas: float | None, lf_max: float,
            estadia: float, pernoctes_mes: float | None,
            plazas_hoteleras: float | None) -> Resultado:
    r = Resultado("F0-8", "Cuota estructural del canal aéreo (perfil mensual de σ_aéreo)")
    if not butacas or not pernoctes_mes:
        r.estado = SKIP
        r.detalle = "faltan parámetros: --butacas --pernoctes-mes [--plazas-hoteleras]"
        r.notas.append("Butacas reales: ANAC (F0-4), no el tipo de avión. "
                       "Pernoctes: ETL del OIT.")
        return r
    r.estado = PASS
    filas, sigmas = [], []
    for mes, frec in perfil.items():
        but_mes = frec * butacas * 4.33
        pernoctes_max = but_mes * lf_max * estadia
        sigma = pernoctes_max / pernoctes_mes
        sigmas.append(sigma)
        filas.append(f"{mes} f={frec:g} butacas={but_mes:,.0f} σ={sigma:.1%}")
    lo, hi = min(sigmas), max(sigmas)
    r.detalle = f"σ_aéreo entre {lo:.1%} (base) y {hi:.1%} (pico) · amplitud {hi/lo - 1:+.0%}"
    r.notas.append("Perfil mensual:")
    for f in filas:
        r.notas.append("  " + f)
    r.notas.append(f"Valor marginal de UNA frecuencia semanal: "
                   f"{butacas * 4.33 * 0.85 * estadia:,.0f} pernoctes/mes (a LF=0,85). "
                   f"Multiplicar por el gasto diario per cápita de demanda.py para el "
                   f"derrame mensual por frecuencia (docs/02 §4.3).")
    if plazas_hoteleras:
        isa_lo = min(perfil.values()) * butacas * 4.33 * lf_max / (plazas_hoteleras * 30) * 1000
        isa_hi = max(perfil.values()) * butacas * 4.33 * lf_max / (plazas_hoteleras * 30) * 1000
        r.notas.append(f"ISA entre {isa_lo:.1f} y {isa_hi:.1f} butacas-llegada por cada "
                       f"1.000 plazas-noche hoteleras. Comparar con BRC y CPC.")
    if hi < 0.15:
        r.notas.append("LECTURA: incluso en el pico el canal aéreo no mueve la ocupación. "
                       "Pauta terrestre de forma permanente; el subsistema aéreo vale como "
                       "instrumento de evidencia para gestión y lobby.")
    elif lo < 0.15 <= hi:
        r.notas.append("LECTURA: el canal aéreo es MARGINAL en temporada base y RELEVANTE en "
                       "el pico. La política de pauta debe ser estacional, y el monitor de "
                       "alerta temprana solo es operativamente crítico en los meses de pico.")
    else:
        r.notas.append("LECTURA: el canal aéreo es un canal de volumen todo el año. El monitor "
                       "de alerta temprana es operativamente crítico.")
    r.notas.append("DISCUTIR ESTE PERFIL CON LEANDRO ANTES DE SEGUIR CON F1b.")
    return r


# ---------------------------------------------------------------------------
# F0-9 — Riesgo fiscal del acuerdo de Conectividad Sostenible (docs/07 §2).
# El piso del 80% no es un umbral estadístico: es el punto donde empieza a salir
# plata del erario provincial.
# ---------------------------------------------------------------------------
def check_9(butacas: float | None, semanas: float, piso: float,
            tarifa_ref: float | None, lf_proyectado: float | None) -> Resultado:
    r = Resultado("F0-9", "Exposición fiscal del acuerdo de Conectividad Sostenible")
    if not butacas:
        r.estado, r.detalle = SKIP, "falta --butacas"
        return r
    butacas_periodo = butacas * semanas
    r.estado = PASS
    r.detalle = f"{butacas_periodo:,.0f} butacas en el período del acuerdo ({semanas:g} semanas)"
    r.notas.append(f"Piso contractual: {piso:.0%}. Asientos que hay que vender para "
                   f"alcanzarlo: {butacas_periodo * piso:,.0f}")
    r.notas.append("Sensibilidad — asientos bajo el piso según LF de cierre:")
    for lf in (0.55, 0.65, 0.75, piso, 0.85):
        faltan = max(0.0, piso - lf) * butacas_periodo
        linea = f"  LF={lf:.0%} -> {faltan:>6.0f} asientos"
        if tarifa_ref:
            linea += f"  ≈ {faltan * tarifa_ref:>12,.0f} ARS de exposición"
        r.notas.append(linea)
    if lf_proyectado is not None:
        faltan = max(0.0, piso - lf_proyectado) * butacas_periodo
        if faltan > 0:
            r.estado = WARN
            r.notas.append(f"PROYECCIÓN ACTUAL: LF={lf_proyectado:.0%} -> {faltan:.0f} asientos "
                           f"bajo el piso." + (f" Exposición ≈ {faltan * tarifa_ref:,.0f} ARS."
                                               if tarifa_ref else ""))
            r.notas.append("Comparar el costo de la pauta necesaria contra ese monto: es la "
                           "única métrica del sistema con retorno directamente medible.")
        else:
            r.notas.append(f"PROYECCIÓN ACTUAL: LF={lf_proyectado:.0%} — por encima del piso, "
                           "sin exposición fiscal.")
    r.notas.append("Antecedente: la temporada 2025 de COR-EQS cerró sobre 85% (verificar "
                   "contra ANAC en F0-4).")
    return r


# ---------------------------------------------------------------------------
def distancias_semilla(csv_path: str) -> None:
    import csv as _csv
    try:
        with open(csv_path, encoding="utf-8") as fh:
            filas = [ln for ln in fh if not ln.startswith("#")]
    except OSError as exc:
        print(f"  (no se pudo leer {csv_path}: {exc})")
        return
    ap = {r["iata"]: r for r in _csv.DictReader(filas)}
    if "AEP" not in ap:
        return
    o = ap["AEP"]
    print("\nDistancias geodésicas desde AEP (coordenadas SEMILLA, sin validar):")
    base = None
    for code in ("EQS", "BRC", "CPC", "PMY", "REL", "CRD", "USH", "FTE"):
        if code not in ap:
            continue
        d = haversine_km(float(o["latitude"]), float(o["longitude"]),
                         float(ap[code]["latitude"]), float(ap[code]["longitude"]))
        if code == "BRC":
            base = d
        print(f"  AEP-{code}: {d:8.1f} km")
    if base and "EQS" in ap:
        d_eqs = haversine_km(float(o["latitude"]), float(o["longitude"]),
                             float(ap["EQS"]["latitude"]), float(ap["EQS"]["longitude"]))
        print(f"\n  Esquel está {(d_eqs / base - 1) * 100:+.1f}% más lejos que Bariloche.")
        print("  La distancia no puede explicar una brecha tarifaria de dos o tres dígitos.")


def main() -> int:
    p = argparse.ArgumentParser(description="F0 — Spike de validación de Métrica Aéreos")
    p.add_argument("--all", action="store_true")
    p.add_argument("--check", nargs="+", type=int, choices=range(1, 10), default=[])
    p.add_argument("--dsn", default=os.environ.get("METRICA_RO_DSN"))
    p.add_argument("--frecuencias-semana", type=float,
                   help="atajo: usa una frecuencia constante en lugar del perfil")
    p.add_argument("--perfil-frecuencias", type=str,
                   help='JSON mes->frecuencias, ej. \'{"ene":6,"oct":9}\'')
    p.add_argument("--semanas-acuerdo", type=float, default=9.0)
    p.add_argument("--piso-contractual", type=float, default=0.80)
    p.add_argument("--tarifa-referencia", type=float)
    p.add_argument("--lf-proyectado", type=float)
    p.add_argument("--butacas", type=float)
    p.add_argument("--lf-max", type=float, default=0.90)
    p.add_argument("--estadia-media", type=float, default=4.0)
    p.add_argument("--pernoctes-mes", type=float)
    p.add_argument("--plazas-hoteleras", type=float)
    p.add_argument("--aeropuertos-csv",
                   default=os.path.join(os.path.dirname(__file__), "..", "config",
                                        "aeropuertos.csv"))
    args = p.parse_args()

    perfil = dict(PERFIL_EQS)
    if args.perfil_frecuencias:
        perfil = json.loads(args.perfil_frecuencias)
    elif args.frecuencias_semana:
        perfil = {m: args.frecuencias_semana for m in PERFIL_EQS}

    pedidos = list(range(1, 10)) if args.all else args.check
    if not pedidos:
        p.print_help()
        return 2

    print("=" * 78)
    print("F0 — SPIKE DE VALIDACIÓN · MÉTRICA AÉREOS")
    print("=" * 78)
    distancias_semilla(os.path.abspath(args.aeropuertos_csv))

    resultados: list[Resultado] = []
    for n in pedidos:
        print(f"\n--- Ejecutando F0-{n} ...", flush=True)
        if   n == 1: res = check_1()
        elif n == 2: res = check_2()
        elif n == 3: res = check_3()
        elif n == 4: res = check_4()
        elif n == 5: res = check_5()
        elif n == 6: res = check_6(args.dsn)
        elif n == 7: res = check_7()
        elif n == 8: res = check_8(perfil, args.butacas, args.lf_max,
                                   args.estadia_media, args.pernoctes_mes,
                                   args.plazas_hoteleras)
        else:        res = check_9(args.butacas, args.semanas_acuerdo,
                                   args.piso_contractual, args.tarifa_referencia,
                                   args.lf_proyectado)
        resultados.append(res)
        print(f"    [{res.estado}] {res.detalle}")
        for nota in res.notas:
            print(f"      {nota}")

    print("\n" + "=" * 78)
    print("RESUMEN")
    print("=" * 78)
    for r in resultados:
        print(f"  [{r.estado:4}] {r.codigo}  {r.titulo}")
        if r.detalle:
            print(f"          {r.detalle}")
    fallos = sum(1 for r in resultados if r.estado == FAIL)
    print(f"\n  {len(resultados)} pruebas · {fallos} FAIL")
    if fallos:
        print("  Revisar las bifurcaciones de docs/04 §F0 antes de avanzar a F1.")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
