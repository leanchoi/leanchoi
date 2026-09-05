# Prompt 4 — Colector completo (F1b)

```
Repo de especificación: github.com/leanchoi/leanchoi, rama
claude/esquel-data-ecosystem-integration-qbxuv2. Leé AGENTS.md y docs/01-motor-aereos.md.

PUNTO DE PARTIDA: F1a ya corre y acumula (prompt 1). No lo rompas: si algo falla, el
colector mínimo tiene que seguir capturando. El histórico es lo único irrecuperable.

AMPLIACIONES

1. Cobertura completa de cadencia — specs/config/rutas_muestreo.json:
     tier 3 (PMY, REL, CRD, USH, FTE) cada 3 días
     tier 4 (12 rutas domésticas) semanal, 4 anticipaciones fijas
     conjuntos "rolling" (T+1..T+30, cada 3 días) y "checkpoints" (T+45..180, semanal)
   Las rutas tier 4 parecen prescindibles y NO lo son: sin ellas el modelo hedónico de
   paridad (docs/02 §3.2) no tiene identificación. Costo marginal ínfimo.
   Presupuesto objetivo ~160 consultas/día, tope duro 250.

2. Compactación bronce -> plata: Parquet particionado por observed_date, 03:30.
   Criterio de aceptación clave: reprocesar bronce -> plata debe reproducir plata BIT A
   BIT. Es lo que garantiza que un bug de parser no destruya el histórico.

3. Canario de rendimiento de parseo.
   Alerta si los itinerarios extraídos por consulta caen >30% respecto de la mediana
   móvil de 7 días. Es la única defensa real contra la degradación silenciosa: un
   rediseño de Google no produce un error, produce cero filas o filas mal mapeadas.

4. Fallback SerpApi (engine google_flights).
   Solo tiers 1-2, solo conjunto ancla, solo dentro de la ventana accionable
   (21 <= lead <= 75). Tope mensual duro con contador PERSISTENTE que corta al llegar.
   Es el fallback correcto porque mide EL MISMO UNIVERSO que el motor primario y por lo
   tanto preserva la comparabilidad de la serie. Amadeus no (AGENTS.md §6).

5. Segunda moneda: consultar USD solo para fechas ancla de tiers 1-2. Para el resto,
   convertir con fx_daily de Métrica y registrar fx_source en cada fila.

6. Sonda Playwright — OPCIONAL, habilitada solo si el resto está estable.
   <=20 consultas/semana contra aerolineas.com.ar, solo AEP-EQS y AEP-BRC, solo para
   familias tarifarias y disponibilidad declarada, que es lo único que Google no da.
   Reutilizá el runtime instalado vía PLAYWRIGHT_BROWSERS_PATH; jamás playwright install
   (I6). Si el WAF devuelve 403: registralo y seguí. NINGÚN indicador puede depender de
   esta sonda (I9). Si te consume más de un día, dejala deshabilitada y avisá.

CRITERIOS DE ACEPTACIÓN
  1. Siete noches consecutivas con cobertura >= 90%.
  2. RSS < 200 MB, duración < 120 min, sin solape con Métrica.
  3. Reprocesar bronce -> plata reproduce plata bit a bit.
  4. El canario dispara en una prueba con fixture degradada a propósito.
  5. El contador de SerpApi corta efectivamente al llegar al tope (probalo bajándolo a 2).
  6. Tests de contrato del parser en verde.
```
