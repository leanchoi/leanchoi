// GENERADO POR specs/scripts/gen_catalogo.py — NO EDITAR A MANO.
// Fuente: specs/catalogo/indicadores.yaml (v1)

export type IndicadorId =
  | 'frecuencias_semanales'
  | 'butacas_mes'
  | 'lf_real'
  | 'sigma_aereo_pct'
  | 'isa_idx'
  | 'valor_marginal_frecuencia'
  | 'tarifa_rt_med_ars'
  | 'tarifa_km_ars'
  | 'ipa_residual_pp'
  | 'gap_competencia_pp'
  | 'prima_monopolio_ar_pct'
  | 'ttci_ars'
  | 'ttci_pppn_ars'
  | 'brecha_paquete_pct'
  | 'n_estrella_noches'
  | 'ic_compensabilidad'
  | 'ifpe_pct'
  | 'adr_med_ars'
  | 'ocupacion_implicita_pct'
  | 'pace_rel_ratio'
  | 'l90_dias'
  | 'ocupacion_oit_pct'
  | 'multiplicador_pernoctes_pax'
  | 'lf_proyectado_pct'
  | 'exposicion_fiscal_ars'
  | 'iat_idx'
  | 'pernoctes_en_riesgo'
  | 'cobertura_captura_pct'
  | 'frescura_dias';

export type ReglaId =
  | 'riesgo_fiscal_umbral'
  | 'oportunidad_frecuencia'
  | 'capacidad_agotada'
  | 'paquete_expulsivo'
  | 'fuga_puerta_entrada'
  | 'compensacion_imposible'
  | 'n_estrella_inalcanzable'
  | 'ventana_pauta_cerrandose'
  | 'desacople_regional'
  | 'gap_no_explicado'
  | 'cobertura_insuficiente';

export type Familia = 'calidad' | 'conectividad' | 'costo' | 'demanda' | 'mercado' | 'riesgo';
export type Unidad  = 'ars' | 'dias' | 'idx' | 'noches' | 'pct' | 'pernoctes' | 'plazas' | 'pp' | 'ratio' | 'usd' | 'vuelos';
export type Confianza = 'A' | 'B' | 'C' | 'D';

export interface Indicador {
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
}

export const INDICADORES: readonly Indicador[] = [
  {"id": "frecuencias_semanales", "nombre": "Frecuencias semanales de llegada", "familia": "conectividad", "unidad": "vuelos", "confianza": "A", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Vuelos programados que arriban al destino por semana.", "interpretacion": "En Esquel NO es constante: 6 semanales de base (diario salvo martes), 7 en agosto-septiembre por la ruta COR, y hasta 9 en Tulipanes. Todo indicador derivado de capacidad debe ser un PERFIL MENSUAL, nunca un escalar.", "decision": "Insumo de negociación de frecuencias y de todo cálculo de capacidad.", "destinatarios": ["gestion", "lobby"], "doc": "docs/02#4"},
  {"id": "butacas_mes", "nombre": "Butacas ofrecidas por mes", "familia": "conectividad", "unidad": "plazas", "confianza": "A", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Asientos comercializables que arriban al destino en el mes.", "interpretacion": "ANAC publica butacas reales; no estimar desde el tipo de avión.", "decision": "Denominador del factor de ocupación y techo del canal aéreo.", "destinatarios": ["gestion", "lobby"], "doc": "docs/02#4.1"},
  {"id": "lf_real", "nombre": "Factor de ocupación aéreo real", "familia": "conectividad", "unidad": "pct", "confianza": "A", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Pasajeros transportados sobre butacas ofrecidas.", "interpretacion": "Dato oficial de ANAC, no inferido por scraping. El umbral 0,80 no es estadístico: es el piso contractual del programa de Conectividad Sostenible.", "decision": "Dispara el análisis de riesgo fiscal y sustenta pedidos de frecuencia.", "destinatarios": ["gestion", "lobby", "publico"], "doc": "docs/07#2"},
  {"id": "sigma_aereo_pct", "nombre": "Cuota estructural máxima del canal aéreo", "familia": "conectividad", "unidad": "pct", "confianza": "B", "coberturaMinima": 1.0, "direccion": "neutro", "definicion": "Porcentaje máximo de los pernoctes del mes que el canal aéreo podría aportar con los aviones llenos.", "interpretacion": "PERFIL MENSUAL, no un número. Con 6 frecuencias base y 9 en Tulipanes, la cuota del pico supera en ~50% a la de temporada baja. Define cuánta pauta tiene sentido dirigir al canal aéreo en cada mes.", "decision": "Fija el reparto estructural de presupuesto entre emisores aéreos y terrestres.", "destinatarios": ["gestion"], "doc": "docs/02#4.2"},
  {"id": "isa_idx", "nombre": "Índice de Suficiencia Aérea", "familia": "conectividad", "unidad": "idx", "confianza": "B", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Butacas de llegada por cada 1.000 plazas-noche hoteleras disponibles.", "interpretacion": "Mide el desbalance entre inversión hotelera local y conectividad.", "decision": "Argumento central del pedido de frecuencias ante ANAC y Aerolíneas.", "destinatarios": ["lobby", "publico"], "doc": "docs/02#4.1"},
  {"id": "valor_marginal_frecuencia", "nombre": "Valor marginal de una frecuencia semanal", "familia": "conectividad", "unidad": "pernoctes", "confianza": "C", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Pernoctes mensuales adicionales que genera una frecuencia semanal más.", "interpretacion": "Multiplicado por el gasto diario per cápita da el derrame por frecuencia.", "decision": "Convierte \"queremos más vuelos\" en una propuesta con impacto cuantificado.", "destinatarios": ["lobby"], "doc": "docs/02#4.3"},
  {"id": "tarifa_rt_med_ars", "nombre": "Tarifa aérea ida y vuelta (mediana)", "familia": "costo", "unidad": "ars", "confianza": "B", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Mediana de tarifa por pasajero, ida y vuelta, dentro de la celda.", "interpretacion": "Comparable SOLO dentro de la misma celda de anticipación. Comparar tarifas a distinto lead time mide el paso del tiempo, no competitividad.", "decision": "Insumo del TTCI y de las alertas de precio.", "destinatarios": ["gestion", "prestadores"], "doc": "docs/02#1"},
  {"id": "tarifa_km_ars", "nombre": "Tarifa por kilómetro", "familia": "costo", "unidad": "ars", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Tarifa mediana dividida por la distancia geodésica.", "interpretacion": "DESCRIPTIVO Y COMUNICABLE, no probatorio. El costo aéreo no es lineal en la distancia. Para evidencia usar ipa_residual_pp.", "decision": "Comunicación pública y prensa.", "destinatarios": ["publico"], "doc": "docs/02#3.1"},
  {"id": "ipa_residual_pp", "nombre": "Sobreprecio aéreo no explicado", "familia": "costo", "unidad": "pp", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Parte de la brecha tarifaria que no explican distancia, competencia ni frecuencias, según el modelo hedónico.", "interpretacion": "Se reporta SIEMPRE junto a los componentes explicados. Conceder lo que tiene explicación estructural es lo que vuelve difícil de refutar al residuo.", "decision": "Sustento técnico ante ANAC y Secretaría de Transporte.", "destinatarios": ["lobby"], "doc": "docs/02#3.2"},
  {"id": "gap_competencia_pp", "nombre": "Brecha atribuible a falta de competencia", "familia": "costo", "unidad": "pp", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Contribución del número de operadores a la brecha tarifaria vs benchmark.", "interpretacion": "Esquel tiene un operador; Bariloche, tres. Este componente suele dominar y es el que cambia el diagnóstico de \"Aerolíneas cobra caro\" a \"la ruta no tiene competencia\".", "decision": "Orienta el reclamo hacia política de competencia, no solo tarifaria.", "destinatarios": ["lobby"], "doc": "docs/02#3.2"},
  {"id": "prima_monopolio_ar_pct", "nombre": "Prima de monopolio intra-aerolínea", "familia": "costo", "unidad": "pct", "confianza": "B", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Sobreprecio por kilómetro de Aerolíneas Argentinas en su ruta monopólica frente a su propia tarifa en una ruta competitiva de distancia similar.", "interpretacion": "Compara a la MISMA aerolínea consigo misma, controlando por distancia. Elimina de un solo golpe las explicaciones por costo de flota, estructura de la compañía o mercado emisor: la única variable que cambia es la presencia de competencia. Es la comparación más difícil de refutar del sistema, y más sólida que el ratio EQS/BRC entre operadores distintos. Primera medición del spike: 3,0x a 5,6x por km sobre una sola celda — grado C hasta completar la celda (invariante I15).", "decision": "Núcleo del paquete de evidencia ante ANAC y Secretaría de Transporte.", "destinatarios": ["lobby", "publico"], "doc": "docs/02#3.2"},
  {"id": "ttci_ars", "nombre": "Índice de Costo Total de Viaje", "familia": "costo", "unidad": "ars", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Costo de bolsillo del viaje completo para un grupo y estadía dados.", "interpretacion": "Se calcula en el NAVEGADOR porque depende de parámetros del usuario. El aéreo escala con pasajeros y el alojamiento con unidades: nunca sumarlos sin separar los escalados.", "decision": "Comparación de destinos y diseño de paquetes promocionales.", "destinatarios": ["gestion", "prestadores", "publico"], "doc": "docs/02#2.1"},
  {"id": "ttci_pppn_ars", "nombre": "Costo total por persona y por noche", "familia": "costo", "unidad": "ars", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "TTCI normalizado, única forma comparable entre grupos y estadías.", "interpretacion": "Métrica titular de competitividad de costo.", "decision": "Posicionamiento de precio del destino.", "destinatarios": ["gestion", "prestadores"], "doc": "docs/02#2.1"},
  {"id": "brecha_paquete_pct", "nombre": "Brecha de paquete vs benchmark", "familia": "costo", "unidad": "pct", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Sobrecosto porcentual del paquete de Esquel respecto de Bariloche.", "interpretacion": "Al ser un ratio es inmune a la inflación y a la elección de tipo de cambio. Por eso es el indicador titular y no la tarifa en pesos.", "decision": "Señal S1 del monitor de alerta temprana.", "destinatarios": ["gestion"], "doc": "docs/02#8.2"},
  {"id": "n_estrella_noches", "nombre": "Umbral de estadía compensatoria", "familia": "costo", "unidad": "noches", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Noches a partir de las cuales la ventaja de precio hotelero de Esquel compensa el sobreprecio aéreo frente a Bariloche.", "interpretacion": "Si supera la estadía media real, la ventaja hotelera NUNCA se materializa para el turista típico y el mensaje de \"más barato\" es falso.", "decision": "Segmentación del marketing hacia estadías largas, o replanteo del mensaje.", "destinatarios": ["gestion", "prestadores"], "doc": "docs/02#2.3"},
  {"id": "ic_compensabilidad", "nombre": "Índice de Compensabilidad", "familia": "costo", "unidad": "ratio", "confianza": "C", "coberturaMinima": 0.8, "direccion": "alto", "definicion": "ADR que Esquel necesitaría para igualar el paquete, sobre el ADR observado.", "interpretacion": "Por debajo del costo variable de operación, la compensación es IMPOSIBLE: es la prueba formal de que el diferencial no es atribuible al sector hotelero.", "decision": "Defensa técnica del sector alojamiento local.", "destinatarios": ["prestadores", "publico"], "doc": "docs/02#2.4"},
  {"id": "ifpe_pct", "nombre": "Índice de Fuga de Puerta de Entrada", "familia": "costo", "unidad": "pct", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Proporción de fechas en que llegar a Esquel es más barato por otro aeropuerto.", "interpretacion": "Alto significa que el aeropuerto de Esquel está siendo esquivado por sus propios visitantes: la ruta no tiene poca demanda, tiene demanda que se va por otra puerta.", "decision": "Industrializar el corredor BRC-Esquel, o reclamar paridad tarifaria.", "destinatarios": ["gestion", "lobby"], "doc": "docs/02#2.2"},
  {"id": "adr_med_ars", "nombre": "Tarifa diaria promedio (mediana)", "familia": "mercado", "unidad": "ars", "confianza": "B", "coberturaMinima": 0.8, "direccion": "neutro", "definicion": "Mediana del precio por unidad-noche publicado en OTA.", "interpretacion": "Precio de oferta publicada, no precio transaccionado.", "decision": "Benchmarking de precios para prestadores.", "destinatarios": ["prestadores", "gestion"], "doc": "docs/03#2.3"},
  {"id": "ocupacion_implicita_pct", "nombre": "Ocupación implícita OTA", "familia": "mercado", "unidad": "pct", "confianza": "C", "coberturaMinima": 0.8, "direccion": "alto", "definicion": "Proporción de listings observados que ya no están disponibles.", "interpretacion": "NO es ocupación real: es un proxy de disponibilidad en OTA. Nombrarla siempre \"implícita\" en el tablero para no confundirla con la del OIT ni con la EOH.", "decision": "Señal temprana de ritmo de reservas.", "destinatarios": ["gestion", "prestadores"], "doc": "docs/03#2.3"},
  {"id": "pace_rel_ratio", "nombre": "Pace de reservas relativo", "familia": "mercado", "unidad": "ratio", "confianza": "B", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Disponibilidad actual sobre la de referencia a igual anticipación.", "interpretacion": "Más disponibilidad de la esperada a igual anticipación es la señal más temprana de una temporada floja. Es la única señal que ya se puede calcular hoy con lo que Métrica viene capturando.", "decision": "Señal S4 del monitor. Dispara promoción antes de que sea tarde.", "destinatarios": ["gestion"], "doc": "docs/02#8.2"},
  {"id": "l90_dias", "nombre": "Punto de congelamiento de reservas", "familia": "mercado", "unidad": "dias", "confianza": "C", "coberturaMinima": 0.8, "direccion": "alto", "definicion": "Anticipación a la que ya está tomado el 90% de las reservas finales.", "interpretacion": "Cualquier campaña lanzada después de este punto llega tarde por definición.", "decision": "Fija el calendario operativo de la pauta publicitaria.", "destinatarios": ["gestion"], "doc": "docs/02#5.2"},
  {"id": "ocupacion_oit_pct", "nombre": "Ocupación hotelera oficial", "familia": "demanda", "unidad": "pct", "confianza": "A", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Ocupación relevada por el Observatorio, bajo sus reglas de mínimos muestrales.", "interpretacion": "Variable dependiente de todo el modelo de correlación.", "decision": "Evaluación general de la gestión turística.", "destinatarios": ["gestion", "publico"], "doc": "docs/02#7"},
  {"id": "multiplicador_pernoctes_pax", "nombre": "Pernoctes por pasajero aéreo", "familia": "demanda", "unidad": "ratio", "confianza": "B", "coberturaMinima": 1.0, "direccion": "neutro", "definicion": "Pernoctes totales del mes divididos por pasajeros aéreos llegados.", "interpretacion": "Con ~100 meses de serie ANAC+OIT se puede medir su estabilidad y estacionalidad. Es la traducción empírica entre conectividad y demanda, y reemplaza al supuesto de estadía media.", "decision": "Calibra el valor marginal por frecuencia y el techo del canal aéreo.", "destinatarios": ["gestion", "lobby"], "doc": "docs/07#3"},
  {"id": "lf_proyectado_pct", "nombre": "Factor de ocupación aéreo proyectado", "familia": "riesgo", "unidad": "pct", "confianza": "C", "coberturaMinima": 0.8, "direccion": "alto", "definicion": "Proyección del LF de una ruta para una semana futura.", "interpretacion": "Se reporta como banda, nunca como punto.", "decision": "Insumo del riesgo fiscal del acuerdo de Conectividad Sostenible.", "destinatarios": ["gestion"], "doc": "docs/07#2"},
  {"id": "exposicion_fiscal_ars", "nombre": "Exposición fiscal del acuerdo de conectividad", "familia": "riesgo", "unidad": "ars", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Monto que la provincia o el municipio debería aportar si el factor de ocupación cierra por debajo del piso contractual del 80%.", "interpretacion": "Convierte cada punto de ocupación en pesos públicos. Es la métrica que le da retorno medible a la inversión en promoción: gastar en pauta para no pagar subsidio tiene una relación costo-beneficio calculable.", "decision": "Autoriza promoción intensiva de la ruta, o anticipa la previsión presupuestaria. Es el producto ancla del observatorio.", "destinatarios": ["gestion", "lobby"], "doc": "docs/07#2"},
  {"id": "iat_idx", "nombre": "Índice de Alerta Temprana", "familia": "riesgo", "unidad": "idx", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Compuesto de brecha de paquete, aceleración tarifaria, capacidad y pace.", "interpretacion": "Solo se emite alerta con 21 <= lead <= 75 días. Con cobertura bajo 80% el estado es \"sin señal\", nunca verde.", "decision": "Reasignación de pauta y gestión de conectividad.", "destinatarios": ["gestion"], "doc": "docs/02#8.3"},
  {"id": "pernoctes_en_riesgo", "nombre": "Pernoctes en riesgo", "familia": "riesgo", "unidad": "pernoctes", "confianza": "C", "coberturaMinima": 0.8, "direccion": "bajo", "definicion": "Pernoctes que se perderían si el ritmo actual de reservas se sostiene.", "interpretacion": "Dimensiona la respuesta; multiplicado por el gasto diario da el derrame en riesgo.", "decision": "Define el tamaño de la reasignación presupuestaria.", "destinatarios": ["gestion"], "doc": "docs/02#8.5"},
  {"id": "cobertura_captura_pct", "nombre": "Cobertura de captura", "familia": "calidad", "unidad": "pct", "confianza": "A", "coberturaMinima": 1.0, "direccion": "alto", "definicion": "Consultas exitosas sobre consultas planificadas en la celda.", "interpretacion": "Ninguna serie se publica sin este número al lado. Bajo 0,80 la serie se marca preliminar. Distinguir \"no había vuelo\" de \"no se pudo medir\" es lo que separa un observatorio de una planilla.", "decision": "Habilita o bloquea la publicación de cualquier indicador derivado.", "destinatarios": ["gestion", "publico"], "doc": "docs/01#3"},
  {"id": "frescura_dias", "nombre": "Frescura del dato", "familia": "calidad", "unidad": "dias", "confianza": "A", "coberturaMinima": 1.0, "direccion": "bajo", "definicion": "Días transcurridos desde la última actualización exitosa del dataset.", "interpretacion": "ANAC tiene 1-3 meses de rezago por diseño; el scraping, horas. Mostrar siempre hasta qué fecha llega cada fuente evita que se lean como contemporáneas.", "decision": "Advertencia visible en cada sección del tablero.", "destinatarios": ["gestion", "prestadores", "publico"], "doc": "docs/03#7"}
] as const;

export const PORid: Record<IndicadorId, Indicador> =
  Object.fromEntries(INDICADORES.map(i => [i.id, i])) as Record<IndicadorId, Indicador>;

/** Etiqueta de confianza para el semáforo. Ver docs/06 §5. */
export const ETIQUETA_CONFIANZA: Record<Confianza, string> = {
  A: 'Oficial',
  B: 'Observado',
  C: 'Modelado',
  D: 'Insuficiente',
};

/** Un indicador es publicable fuera del organismo solo con confianza A o B. */
export const esPublicable = (i: Indicador): boolean => i.confianza === 'A' || i.confianza === 'B';

/** Serie preliminar: se marca visualmente cuando no llega a su cobertura mínima. */
export const esPreliminar = (i: Indicador, cobertura: number): boolean =>
  cobertura < i.coberturaMinima;
