# Ficha metodológica — Esquel DATA 360°

> GENERADO POR `specs/scripts/gen_catalogo.py`. No editar a mano.
> Catálogo v1 · 28 indicadores · 11 reglas.

Grados de confianza: **A** oficial · **B** observado con cobertura suficiente · **C** modelado · **D** insuficiente. Solo A y B se publican fuera del organismo.

## Calidad

### `cobertura_captura_pct` — Cobertura de captura

| | |
|---|---|
| **Definición** | Consultas exitosas sobre consultas planificadas en la celda. |
| **Fórmula** | `runs_ok / runs_planificados` |
| **Unidad / grano** | pct · ruta, periodo |
| **Fuentes** | air_scrape_runs |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | Ninguna serie se publica sin este número al lado. Bajo 0,80 la serie se marca preliminar. Distinguir "no había vuelo" de "no se pudo medir" es lo que separa un observatorio de una planilla. |
| **Decisión que habilita** | Habilita o bloquea la publicación de cualquier indicador derivado. |
| **Destinatarios** | gestion, publico |
| **Referencia** | docs/01#3 |

### `frescura_dias` — Frescura del dato

| | |
|---|---|
| **Definición** | Días transcurridos desde la última actualización exitosa del dataset. |
| **Fórmula** | `hoy - ultima_actualizacion_ok` |
| **Unidad / grano** | dias · dataset |
| **Fuentes** | meta.json |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | ANAC tiene 1-3 meses de rezago por diseño; el scraping, horas. Mostrar siempre hasta qué fecha llega cada fuente evita que se lean como contemporáneas. |
| **Decisión que habilita** | Advertencia visible en cada sección del tablero. |
| **Destinatarios** | gestion, prestadores, publico |
| **Referencia** | docs/03#7 |

## Conectividad

### `frecuencias_semanales` — Frecuencias semanales de llegada

| | |
|---|---|
| **Definición** | Vuelos programados que arriban al destino por semana. |
| **Fórmula** | `count(vuelos) / semanas` |
| **Unidad / grano** | vuelos · ruta, mes |
| **Fuentes** | ext_anac_mensual, air_fact_leadtime |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | En Esquel NO es constante: 6 semanales de base (diario salvo martes), 7 en agosto-septiembre por la ruta COR, y hasta 9 en Tulipanes. Todo indicador derivado de capacidad debe ser un PERFIL MENSUAL, nunca un escalar. |
| **Decisión que habilita** | Insumo de negociación de frecuencias y de todo cálculo de capacidad. |
| **Destinatarios** | gestion, lobby |
| **Referencia** | docs/02#4 |

### `butacas_mes` — Butacas ofrecidas por mes

| | |
|---|---|
| **Definición** | Asientos comercializables que arriban al destino en el mes. |
| **Fórmula** | `frecuencias_semanales * asientos_equipo * 4.33` |
| **Unidad / grano** | plazas · ruta, mes |
| **Fuentes** | ext_anac_mensual |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | ANAC publica butacas reales; no estimar desde el tipo de avión. |
| **Decisión que habilita** | Denominador del factor de ocupación y techo del canal aéreo. |
| **Destinatarios** | gestion, lobby |
| **Referencia** | docs/02#4.1 |

### `lf_real` — Factor de ocupación aéreo real

| | |
|---|---|
| **Definición** | Pasajeros transportados sobre butacas ofrecidas. |
| **Fórmula** | `pax_aereos / butacas_mes` |
| **Unidad / grano** | pct · ruta, mes |
| **Fuentes** | ext_anac_mensual |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | Dato oficial de ANAC, no inferido por scraping. El umbral 0,80 no es estadístico: es el piso contractual del programa de Conectividad Sostenible. |
| **Decisión que habilita** | Dispara el análisis de riesgo fiscal y sustenta pedidos de frecuencia. |
| **Destinatarios** | gestion, lobby, publico |
| **Referencia** | docs/07#2 |

### `sigma_aereo_pct` — Cuota estructural máxima del canal aéreo

| | |
|---|---|
| **Definición** | Porcentaje máximo de los pernoctes del mes que el canal aéreo podría aportar con los aviones llenos. |
| **Fórmula** | `(butacas_mes * lf_max * estadia_media_aerea) / pernoctes_mes` |
| **Unidad / grano** | pct · destino, mes |
| **Fuentes** | ext_anac_mensual, oit_pernoctes |
| **Confianza** | B (cobertura mínima 100%) |
| **Interpretación** | PERFIL MENSUAL, no un número. Con 6 frecuencias base y 9 en Tulipanes, la cuota del pico supera en ~50% a la de temporada baja. Define cuánta pauta tiene sentido dirigir al canal aéreo en cada mes. |
| **Decisión que habilita** | Fija el reparto estructural de presupuesto entre emisores aéreos y terrestres. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#4.2 |

### `isa_idx` — Índice de Suficiencia Aérea

| | |
|---|---|
| **Definición** | Butacas de llegada por cada 1.000 plazas-noche hoteleras disponibles. |
| **Fórmula** | `(butacas_mes * lf_max) / (plazas_hoteleras * dias_mes) * 1000` |
| **Unidad / grano** | idx · destino, mes |
| **Fuentes** | ext_anac_mensual, oit_plazas |
| **Confianza** | B (cobertura mínima 100%) |
| **Interpretación** | Mide el desbalance entre inversión hotelera local y conectividad. |
| **Decisión que habilita** | Argumento central del pedido de frecuencias ante ANAC y Aerolíneas. |
| **Destinatarios** | lobby, publico |
| **Referencia** | docs/02#4.1 |

### `valor_marginal_frecuencia` — Valor marginal de una frecuencia semanal

| | |
|---|---|
| **Definición** | Pernoctes mensuales adicionales que genera una frecuencia semanal más. |
| **Fórmula** | `asientos_equipo * 4.33 * lf_esperado * estadia_media_aerea` |
| **Unidad / grano** | pernoctes · ruta |
| **Fuentes** | ext_anac_mensual, oit_estadia |
| **Confianza** | C (cobertura mínima 100%) |
| **Interpretación** | Multiplicado por el gasto diario per cápita da el derrame por frecuencia. |
| **Decisión que habilita** | Convierte "queremos más vuelos" en una propuesta con impacto cuantificado. |
| **Destinatarios** | lobby |
| **Referencia** | docs/02#4.3 |

## Costo

### `tarifa_rt_med_ars` — Tarifa aérea ida y vuelta (mediana)

| | |
|---|---|
| **Definición** | Mediana de tarifa por pasajero, ida y vuelta, dentro de la celda. |
| **Fórmula** | `median(price_ars) por (ruta, flight_date, lead_bucket)` |
| **Unidad / grano** | ars · ruta, flight_date, lead_bucket |
| **Fuentes** | air_fact_leadtime |
| **Confianza** | B (cobertura mínima 80%) |
| **Interpretación** | Comparable SOLO dentro de la misma celda de anticipación. Comparar tarifas a distinto lead time mide el paso del tiempo, no competitividad. |
| **Decisión que habilita** | Insumo del TTCI y de las alertas de precio. |
| **Destinatarios** | gestion, prestadores |
| **Referencia** | docs/02#1 |

### `tarifa_km_ars` — Tarifa por kilómetro

| | |
|---|---|
| **Definición** | Tarifa mediana dividida por la distancia geodésica. |
| **Fórmula** | `tarifa_rt_med_ars / distancia_km` |
| **Unidad / grano** | ars · ruta, mes |
| **Fuentes** | air_fact_leadtime, air_dim_rutas |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | DESCRIPTIVO Y COMUNICABLE, no probatorio. El costo aéreo no es lineal en la distancia. Para evidencia usar ipa_residual_pp. |
| **Decisión que habilita** | Comunicación pública y prensa. |
| **Destinatarios** | publico |
| **Referencia** | docs/02#3.1 |

### `ipa_residual_pp` — Sobreprecio aéreo no explicado

| | |
|---|---|
| **Definición** | Parte de la brecha tarifaria que no explican distancia, competencia ni frecuencias, según el modelo hedónico. |
| **Fórmula** | `ln(F_eqs/F_ref) - beta1*ln(dist) - beta2*ln(1+n) - beta3*ln(freq)` |
| **Unidad / grano** | pp · ruta, mes |
| **Fuentes** | air_fact_leadtime, air_dim_rutas |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Se reporta SIEMPRE junto a los componentes explicados. Conceder lo que tiene explicación estructural es lo que vuelve difícil de refutar al residuo. |
| **Decisión que habilita** | Sustento técnico ante ANAC y Secretaría de Transporte. |
| **Destinatarios** | lobby |
| **Referencia** | docs/02#3.2 |

### `gap_competencia_pp` — Brecha atribuible a falta de competencia

| | |
|---|---|
| **Definición** | Contribución del número de operadores a la brecha tarifaria vs benchmark. |
| **Fórmula** | `beta2 * ln((1+n_eqs)/(1+n_ref))` |
| **Unidad / grano** | pp · ruta, mes |
| **Fuentes** | air_fact_leadtime |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Esquel tiene un operador; Bariloche, tres. Este componente suele dominar y es el que cambia el diagnóstico de "Aerolíneas cobra caro" a "la ruta no tiene competencia". |
| **Decisión que habilita** | Orienta el reclamo hacia política de competencia, no solo tarifaria. |
| **Destinatarios** | lobby |
| **Referencia** | docs/02#3.2 |

### `ttci_ars` — Índice de Costo Total de Viaje

| | |
|---|---|
| **Definición** | Costo de bolsillo del viaje completo para un grupo y estadía dados. |
| **Fórmula** | `pax*tarifa_rt + traslado_grupo + noches*unidades*adr` |
| **Unidad / grano** | ars · destino, gateway, fecha, lead_bucket |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Se calcula en el NAVEGADOR porque depende de parámetros del usuario. El aéreo escala con pasajeros y el alojamiento con unidades: nunca sumarlos sin separar los escalados. |
| **Decisión que habilita** | Comparación de destinos y diseño de paquetes promocionales. |
| **Destinatarios** | gestion, prestadores, publico |
| **Referencia** | docs/02#2.1 |

### `ttci_pppn_ars` — Costo total por persona y por noche

| | |
|---|---|
| **Definición** | TTCI normalizado, única forma comparable entre grupos y estadías. |
| **Fórmula** | `ttci_ars / (pax * noches)` |
| **Unidad / grano** | ars · destino, gateway, fecha |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Métrica titular de competitividad de costo. |
| **Decisión que habilita** | Posicionamiento de precio del destino. |
| **Destinatarios** | gestion, prestadores |
| **Referencia** | docs/02#2.1 |

### `brecha_paquete_pct` — Brecha de paquete vs benchmark

| | |
|---|---|
| **Definición** | Sobrecosto porcentual del paquete de Esquel respecto de Bariloche. |
| **Fórmula** | `ttci_esquel / ttci_bariloche - 1` |
| **Unidad / grano** | pct · fecha, lead_bucket |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Al ser un ratio es inmune a la inflación y a la elección de tipo de cambio. Por eso es el indicador titular y no la tarifa en pesos. |
| **Decisión que habilita** | Señal S1 del monitor de alerta temprana. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#8.2 |

### `n_estrella_noches` — Umbral de estadía compensatoria

| | |
|---|---|
| **Definición** | Noches a partir de las cuales la ventaja de precio hotelero de Esquel compensa el sobreprecio aéreo frente a Bariloche. |
| **Fórmula** | `pax*(costo_pax_eqs - costo_pax_brc) / (unidades*(adr_brc - adr_eqs))` |
| **Unidad / grano** | noches · fecha |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Si supera la estadía media real, la ventaja hotelera NUNCA se materializa para el turista típico y el mensaje de "más barato" es falso. |
| **Decisión que habilita** | Segmentación del marketing hacia estadías largas, o replanteo del mensaje. |
| **Destinatarios** | gestion, prestadores |
| **Referencia** | docs/02#2.3 |

### `ic_compensabilidad` — Índice de Compensabilidad

| | |
|---|---|
| **Definición** | ADR que Esquel necesitaría para igualar el paquete, sobre el ADR observado. |
| **Fórmula** | `adr_requerido / adr_observado` |
| **Unidad / grano** | ratio · fecha, noches |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Por debajo del costo variable de operación, la compensación es IMPOSIBLE: es la prueba formal de que el diferencial no es atribuible al sector hotelero. |
| **Decisión que habilita** | Defensa técnica del sector alojamiento local. |
| **Destinatarios** | prestadores, publico |
| **Referencia** | docs/02#2.4 |

### `ifpe_pct` — Índice de Fuga de Puerta de Entrada

| | |
|---|---|
| **Definición** | Proporción de fechas en que llegar a Esquel es más barato por otro aeropuerto. |
| **Fórmula** | `fechas_con_gateway_optimo_distinto_de_EQS / fechas_totales` |
| **Unidad / grano** | pct · origen, periodo |
| **Fuentes** | air_gateway_costs, ota_fact_dia |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Alto significa que el aeropuerto de Esquel está siendo esquivado por sus propios visitantes: la ruta no tiene poca demanda, tiene demanda que se va por otra puerta. |
| **Decisión que habilita** | Industrializar el corredor BRC-Esquel, o reclamar paridad tarifaria. |
| **Destinatarios** | gestion, lobby |
| **Referencia** | docs/02#2.2 |

## Demanda

### `ocupacion_oit_pct` — Ocupación hotelera oficial

| | |
|---|---|
| **Definición** | Ocupación relevada por el Observatorio, bajo sus reglas de mínimos muestrales. |
| **Fórmula** | `definida en etl/indicadores.py` |
| **Unidad / grano** | pct · destino, mes |
| **Fuentes** | oit_ocupacion |
| **Confianza** | A (cobertura mínima 100%) |
| **Interpretación** | Variable dependiente de todo el modelo de correlación. |
| **Decisión que habilita** | Evaluación general de la gestión turística. |
| **Destinatarios** | gestion, publico |
| **Referencia** | docs/02#7 |

### `multiplicador_pernoctes_pax` — Pernoctes por pasajero aéreo

| | |
|---|---|
| **Definición** | Pernoctes totales del mes divididos por pasajeros aéreos llegados. |
| **Fórmula** | `pernoctes_mes / pax_aereos_mes` |
| **Unidad / grano** | ratio · destino, mes |
| **Fuentes** | ext_anac_mensual, oit_pernoctes |
| **Confianza** | B (cobertura mínima 100%) |
| **Interpretación** | Con ~100 meses de serie ANAC+OIT se puede medir su estabilidad y estacionalidad. Es la traducción empírica entre conectividad y demanda, y reemplaza al supuesto de estadía media. |
| **Decisión que habilita** | Calibra el valor marginal por frecuencia y el techo del canal aéreo. |
| **Destinatarios** | gestion, lobby |
| **Referencia** | docs/07#3 |

## Mercado

### `adr_med_ars` — Tarifa diaria promedio (mediana)

| | |
|---|---|
| **Definición** | Mediana del precio por unidad-noche publicado en OTA. |
| **Fórmula** | `median(price_ars) por (destino, fecha, tipologia)` |
| **Unidad / grano** | ars · destino, fecha, tipologia |
| **Fuentes** | ota_fact_dia |
| **Confianza** | B (cobertura mínima 80%) |
| **Interpretación** | Precio de oferta publicada, no precio transaccionado. |
| **Decisión que habilita** | Benchmarking de precios para prestadores. |
| **Destinatarios** | prestadores, gestion |
| **Referencia** | docs/03#2.3 |

### `ocupacion_implicita_pct` — Ocupación implícita OTA

| | |
|---|---|
| **Definición** | Proporción de listings observados que ya no están disponibles. |
| **Fórmula** | `1 - listings_disponibles / listings_observados` |
| **Unidad / grano** | pct · destino, fecha, lead_bucket |
| **Fuentes** | ota_fact_leadtime |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | NO es ocupación real: es un proxy de disponibilidad en OTA. Nombrarla siempre "implícita" en el tablero para no confundirla con la del OIT ni con la EOH. |
| **Decisión que habilita** | Señal temprana de ritmo de reservas. |
| **Destinatarios** | gestion, prestadores |
| **Referencia** | docs/03#2.3 |

### `pace_rel_ratio` — Pace de reservas relativo

| | |
|---|---|
| **Definición** | Disponibilidad actual sobre la de referencia a igual anticipación. |
| **Fórmula** | `disponibilidad_actual(lead) / disponibilidad_referencia(lead)` |
| **Unidad / grano** | ratio · destino, fecha, lead_bucket |
| **Fuentes** | ota_fact_leadtime |
| **Confianza** | B (cobertura mínima 80%) |
| **Interpretación** | Más disponibilidad de la esperada a igual anticipación es la señal más temprana de una temporada floja. Es la única señal que ya se puede calcular hoy con lo que Métrica viene capturando. |
| **Decisión que habilita** | Señal S4 del monitor. Dispara promoción antes de que sea tarde. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#8.2 |

### `l90_dias` — Punto de congelamiento de reservas

| | |
|---|---|
| **Definición** | Anticipación a la que ya está tomado el 90% de las reservas finales. |
| **Fórmula** | `min(lead) tal que reservado(lead) >= 0.90 * reservado_final` |
| **Unidad / grano** | dias · destino, temporada |
| **Fuentes** | ota_fact_leadtime |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Cualquier campaña lanzada después de este punto llega tarde por definición. |
| **Decisión que habilita** | Fija el calendario operativo de la pauta publicitaria. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#5.2 |

## Riesgo

### `lf_proyectado_pct` — Factor de ocupación aéreo proyectado

| | |
|---|---|
| **Definición** | Proyección del LF de una ruta para una semana futura. |
| **Fórmula** | `modelo sobre pace de tarifas y disponibilidad, calibrado con lf_real histórico` |
| **Unidad / grano** | pct · ruta, semana_objetivo |
| **Fuentes** | air_fact_leadtime, ext_anac_mensual |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Se reporta como banda, nunca como punto. |
| **Decisión que habilita** | Insumo del riesgo fiscal del acuerdo de Conectividad Sostenible. |
| **Destinatarios** | gestion |
| **Referencia** | docs/07#2 |

### `exposicion_fiscal_ars` — Exposición fiscal del acuerdo de conectividad

| | |
|---|---|
| **Definición** | Monto que la provincia o el municipio debería aportar si el factor de ocupación cierra por debajo del piso contractual del 80%. |
| **Fórmula** | `max(0, 0.80 - lf_proyectado) * butacas_periodo * tarifa_referencia` |
| **Unidad / grano** | ars · ruta, periodo_acuerdo |
| **Fuentes** | air_fact_leadtime, ext_anac_mensual |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Convierte cada punto de ocupación en pesos públicos. Es la métrica que le da retorno medible a la inversión en promoción: gastar en pauta para no pagar subsidio tiene una relación costo-beneficio calculable. |
| **Decisión que habilita** | Autoriza promoción intensiva de la ruta, o anticipa la previsión presupuestaria. Es el producto ancla del observatorio. |
| **Destinatarios** | gestion, lobby |
| **Referencia** | docs/07#2 |

### `iat_idx` — Índice de Alerta Temprana

| | |
|---|---|
| **Definición** | Compuesto de brecha de paquete, aceleración tarifaria, capacidad y pace. |
| **Fórmula** | `0.30*S1 + 0.15*S2 + 0.30*S3 + 0.25*S4` |
| **Unidad / grano** | idx · destino, semana_objetivo |
| **Fuentes** | x_fact_alertas |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Solo se emite alerta con 21 <= lead <= 75 días. Con cobertura bajo 80% el estado es "sin señal", nunca verde. |
| **Decisión que habilita** | Reasignación de pauta y gestión de conectividad. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#8.3 |

### `pernoctes_en_riesgo` — Pernoctes en riesgo

| | |
|---|---|
| **Definición** | Pernoctes que se perderían si el ritmo actual de reservas se sostiene. |
| **Fórmula** | `plazas_totales * 7 * max(0, ocupacion_esperada - ocupacion_proyectada)` |
| **Unidad / grano** | pernoctes · destino, semana_objetivo |
| **Fuentes** | x_fact_alertas, oit_plazas |
| **Confianza** | C (cobertura mínima 80%) |
| **Interpretación** | Dimensiona la respuesta; multiplicado por el gasto diario da el derrame en riesgo. |
| **Decisión que habilita** | Define el tamaño de la reasignación presupuestaria. |
| **Destinatarios** | gestion |
| **Referencia** | docs/02#8.5 |

## Reglas del motor de insights

| Regla | Severidad | Se dispara cuando | Acción |
|---|---|---|---|
| `riesgo_fiscal_umbral` | alta | `lf_proyectado_pct < 0.80 and lead_dias between 21 and 90` | Promoción intensiva y dirigida de la ruta. Cada asiento vendido por encima del piso es gasto público evitado: la pauta tiene retorno medible contra este número. |
| `oportunidad_frecuencia` | oportunidad | `lf_real > 0.88 sostenido durante 3 meses consecutivos` | Presentar el pedido de frecuencia con este paquete de evidencia. Un LF alto sostenido es el argumento más fuerte y el que menos se usa. |
| `capacidad_agotada` | alta | `senal_dominante == 'S3' and iat_idx >= 60` | Reasignar el 100% de la pauta de emisores aéreos de esa semana hacia emisores terrestres. Gestionar vuelo de refuerzo con Aerolíneas. |
| `paquete_expulsivo` | media | `senal_dominante in ('S1','S2') and brecha_paquete_pct > 0.35` | Reasignar ~40% de la pauta. Mantener presencia en el emisor aéreo con mensaje de valor de paquete, no de tarifa. Activar promoción conjunta con alojamiento para bajar el TTCI en lugar de competir contra la tarifa aérea. |
| `fuga_puerta_entrada` | media | `ifpe_pct > 0.30` | Dos caminos, no excluyentes: industrializar el corredor BRC-Esquel (transfers regulares, acuerdos con rentadoras, paquetes con traslado incluido) y usar la fuga medida como argumento de paridad tarifaria. |
| `compensacion_imposible` | informativa | `ic_compensabilidad < 0.75` | Usar como defensa técnica del sector alojamiento y para reencuadrar la discusión pública: el diferencial no es atribuible a los precios hoteleros locales. |
| `n_estrella_inalcanzable` | informativa | `n_estrella_noches > estadia_media_real * 1.5` | Segmentar la comunicación hacia estadías largas (temporada, larga estancia, teletrabajo) y retirar el mensaje genérico de "destino más económico", que el dato no sostiene. |
| `ventana_pauta_cerrandose` | media | `dias_hasta_temporada <= l90_dias + 14 and pace_rel_ratio > 1.15` | Ejecutar el presupuesto de promoción ahora, no más adelante. |
| `desacople_regional` | alta | `caida_esquel_pp < -5 and caida_cluster_pp > -2` | Abrir análisis de causa raíz sobre ese componente antes de asumir un factor externo. Es el caso en que la comparación con el benchmark cambia el diagnóstico. |
| `gap_no_explicado` | informativa | `ipa_residual_pp > 25 and modelo_valido == true` | Paquete de evidencia para ANAC y Secretaría de Transporte. Conceder lo explicable es lo que vuelve difícil de refutar al residuo. |
| `cobertura_insuficiente` | sistema | `cobertura_captura_pct < 0.80` | Revisar el colector antes de tomar decisiones sobre este ámbito. |
