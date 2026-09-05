# Prompt 8 — Modelos analíticos y monitor de alerta (F5 + F6)

> Paralelizable con el prompt 7.

```
Repo de especificación: github.com/leanchoi/leanchoi, rama
claude/esquel-data-ecosystem-integration-qbxuv2.
Leé AGENTS.md y docs/02-modelo-analitico.md COMPLETO, más docs/07 §2 y §4.

Implementá etl/modelos/: ttci.py, paridad.py, capacidad.py, elasticidad.py,
descomposicion.py, alerta.py, evento.py

REGLA TRANSVERSAL, la que más se viola
TODA comparación se hace DENTRO DE CELDA: (ruta x bucket de anticipación x día de semana
x temporada). Comparar observaciones con distinta anticipación mide el paso del tiempo,
no competitividad, y produce un monitor que está siempre en rojo. Estadístico robusto:
  z = (x - mediana_celda) / (1.4826 * MAD_celda), recortado a [-4, 4]

MÓDULOS

ttci.py       Componentes por PUERTA DE ENTRADA (EQS directo, BRC +290 km, REL/PMY/CRD
              +600 km). El TTCI final se calcula en el navegador. Emitir:
              n_estrella (umbral de estadía compensatoria), ic_compensabilidad,
              ifpe (Índice de Fuga de Puerta de Entrada).

paridad.py    Modelo hedónico: ln F ~ ln dist + ln(1+n_operadores) + ln freq + f(lead) +
              efectos fijos de mes y aerolínea. Descomponer el gap EQS/BRC en
              contribuciones aditivas: distancia, competencia, frecuencias, RESIDUAL.
              · numpy.linalg.lstsq con dummies alcanza; IC por bootstrap de bloques por
                ruta (500 réplicas).
              · Requiere >=15 rutas y >=6 meses. Con menos, emitir SOLO el ratio
                descriptivo, etiquetado como tal.
              · Si competencia y frecuencia correlacionan >0,8, reportarlas como BLOQUE
                CONJUNTO, no por separado.
              · Reportar siempre R2 y número de rutas.
              El output valioso es la frase completa: "del +X% de brecha, la distancia
              explica A pp, la falta de competencia B pp, las frecuencias C pp, y quedan
              D pp sin explicar (IC 95%: ...)". Conceder lo explicable es lo que vuelve
              difícil de refutar al residuo.

capacidad.py  sigma_aereo COMO PERFIL MENSUAL, nunca escalar (Esquel varía ~50% entre
              base y pico). ISA, valor marginal por frecuencia. Butacas REALES de ANAC.

elasticidad.py  Panel con efectos fijos de destino y de mes. Requiere >=24 meses x >=6
              destinos. Antes de eso: BANDA a priori [-1,3 ; -0,6], y todo resultado
              derivado se muestra como RANGO, nunca como punto. Reportar asociación, no
              causalidad.

descomposicion.py  Factor regional -> desvío local -> componente aéreo y hotelero
              (ponderados por w_A y w_L) -> componente de capacidad -> RESIDUO EXPLÍCITO.
              El componente de capacidad SOLO aplica si LF del año anterior >= 0,85:
              perder plazas resta pernoctes únicamente si los aviones venían llenos.
              Gates de suficiencia: si alguno falla, emitir "evidencia insuficiente" en
              lugar de una barra. NADA de dictámenes categóricos (docs/00 H10).

evento.py     Estudio de eventos sobre el programa de Conectividad Sostenible (docs/07 §4).
              Tratadas: COR-EQS (2025 y 2026), Viedma (4->6 frecuencias), Río Cuarto,
              Merlo, Reconquista (alta Y baja), COR-Posadas. Control: destinos sin cambios
              de oferta. Emitir el GRÁFICO DE EVENTO COMPLETO, no un número suelto: los
              coeficientes previos al tratamiento son la prueba de tendencias paralelas y
              el lector tiene que poder verla. Reportar como cota superior: las rutas se
              agregan donde se espera demanda.

alerta.py     Cuatro señales (brecha de paquete, aceleración tarifaria, presión de
              capacidad, pace de alojamiento) -> IAT = 0,30*S1 + 0,15*S2 + 0,30*S3 + 0,25*S4
              · Ventana de accionabilidad: alerta SOLO con 21 <= lead <= 75. Fuera de ella
                se calcula y almacena, pero no se emite.
              · Histéresis: dispara con 3 de las últimas 5 corridas sobre el umbral;
                cierra con 3 consecutivas bajo (umbral - 10); enfriamiento de 7 días por
                (destino, semana objetivo).
              · Compuerta de cobertura: <80% -> "sin señal", NUNCA verde (I13).
              · Arranque en frío: fase 0 usa comparación TRANSVERSAL (EQS vs BRC hoy, misma
                anticipación), que funciona desde la primera corrida porque ambas rutas se
                muestrean simultáneamente. Fase 1 (mes 3+) intra-temporada. Fase 2 (mes 12+)
                interanual.
              · Prescripción según SEÑAL DOMINANTE, no según nivel: "agotado" (S3) y "caro"
                (S1/S2) requieren acciones OPUESTAS. Si no hay asientos, ninguna inversión
                publicitaria convierte.

RIESGO FISCAL — el producto ancla (docs/07 §2)
  exposicion = max(0, 0,80 - lf_proyectado) * butacas_periodo * tarifa_referencia
El piso del 80% no es estadístico: es la cláusula del programa de Conectividad Sostenible
por debajo de la cual la provincia aporta fondos públicos. Es la única métrica del sistema
con retorno directamente medible: gastar $X en pauta para no pagar $Y de subsidio.
Proyección del LF: fase 0 con ANAC del mismo período del año anterior; fase 1 sumando el
pace de tarifas propio (la tarifa sube al agotarse las clases bajas, así que una tarifa
plana a 30 días es señal de avión vacío); fase 2 calibrando contra el LF real de ANAC.

CRITERIOS DE ACEPTACIÓN
  1. Un test unitario por fórmula, con caso sintético de resultado conocido.
  2. Con datos deliberadamente insuficientes, la descomposición emite "evidencia
     insuficiente" en vez de una barra.
  3. La elasticidad se emite como banda hasta cumplir 24 meses x 6 destinos.
  4. Histéresis verificada con una serie sintética OSCILANTE que no debe producir alertas
     intermitentes.
  5. Cobertura <80% -> "sin señal", verificado.
  6. "Agotado" y "caro" producen recomendaciones distintas.
  7. Backtest sobre el histórico disponible: ninguna alerta roja en semanas que
     resultaron normales.
  8. Todo indicador nuevo con entrada en specs/catalogo/indicadores.yaml (I11).
```
