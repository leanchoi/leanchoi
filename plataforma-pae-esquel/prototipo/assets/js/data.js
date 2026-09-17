/* ============================================================
   TROCHA · datos de demostración
   ⚠️ TODAS LAS CIFRAS DE ESTE ARCHIVO SON SINTÉTICAS.
   Se generaron para que las visualizaciones tengan forma
   realista y se pueda discutir la interfaz. NO describen la
   realidad del PAE. Ver CONTEXTO-Y-SUPUESTOS.md.
   ============================================================ */
window.DEMO = {

  meses: ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],

  /* Ejecución presupuestaria — devengado vs plan, con proyección */
  ejecucion: {
    plan:      [10.2, 20.4, 30.6, 40.8, 51.0, 61.2, 71.4, 81.6, 91.8, 102.0],
    devengado: [ 9.8, 19.9, 30.1, 39.4, 49.1, 59.8, 70.2, 80.6, 90.9,  99.4]
  },

  /* Poder de compra real del monto — índice base 100 = mes de resolución.
     Es el indicador que hoy no existe y que hace visible la licuación. */
  poderCompra: [100, 96.4, 92.8, 89.1, 86.0, 83.2, 80.4, 77.9, 75.3, 73.1],

  /* Embudo del ciclo */
  embudo: [
    { label: 'Postulaciones iniciadas', value: 412, note: '' },
    { label: 'Presentadas completas',   value: 361, note: '−12%' },
    { label: 'Admitidas',               value: 284, note: '−21%' },
    { label: 'Activas al cierre',       value: 259, note: '−9%' },
    { label: 'Con regularidad al día',  value: 241, note: '−7%' },
    { label: 'Egresadas del nivel',     value:  63, note: 'cohorte' }
  ],

  /* Cartograma esquemático de barrios.
     13 de las 18 juntas vecinales: son las identificadas en fuentes
     públicas. El listado completo debe pedirse a la Dirección de
     Juntas Vecinales. */
  barrios: [
    { label: 'Ceferino',      value: 34, display: '34', note: '8 en riesgo · junta a regularizar' },
    { label: '28 de Junio',   value: 31, display: '31', note: '5 en riesgo · sede de alta actividad' },
    { label: 'Estación',      value: 27, display: '27', note: '6 en riesgo' },
    { label: 'Winter', value: 24, display: '24', note: '4 en riesgo' },
    { label: 'Don Bosco',     value: 22, display: '22', note: '3 en riesgo' },
    { label: 'Malvinas',      value: 21, display: '21', note: '5 en riesgo' },
    { label: 'Los Sauces',    value: 19, display: '19', note: '2 en riesgo' },
    { label: 'Matadero',      value: 18, display: '18', note: '4 en riesgo' },
    { label: 'S. Cabral',  value: 16, display: '16', note: '2 en riesgo' },
    { label: 'Bella Vista',   value: 14, display: '14', note: '1 en riesgo' },
    { label: 'Englund',    value: 12, display: '12', note: '2 en riesgo' },
    { label: 'Bs. Aires',  value: 11, display: '11', note: '1 en riesgo' },
    { label: 'Centro',        value: 10, display: '10', note: '1 en riesgo' }
  ],

  /* Horas de compromiso comunitario, por sede */
  horasSede: [
    { label: '28 de Junio',  value: 412, display: '412 h', tipNote: '96% validadas' },
    { label: 'Ceferino',     value: 388, display: '388 h', tipNote: '91% validadas' },
    { label: 'Estación',     value: 301, display: '301 h', tipNote: '94% validadas' },
    { label: 'Don Bosco',    value: 244, display: '244 h', tipNote: '89% validadas' },
    { label: 'Malvinas',     value: 198, display: '198 h', tipNote: '97% validadas' },
    { label: 'Los Sauces',   value: 121, display: '121 h', tipNote: '85% validadas' },
    { label: 'Bella Vista',  value:  64, display: '64 h',  tipNote: '92% validadas' }
  ],

  /* Permanencia por nivel, dos ciclos */
  permanencia: {
    labels: ['Primario', 'Secundario', 'Superior', 'F. Profesional'],
    ciclo_anterior: [96, 84, 79, 88],
    ciclo_actual:   [97, 89, 86, 91]
  },

  /* Alertas abiertas fuera de plazo */
  alertas: [
    { id: 'AL-2411', est: 'M. G.',  nivel: 'Superior',   motivo: 'Regularidad vencida hace 22 días', sev: 'crit', sla: '−2 d',  resp: 'Equipo Ext. Educativa' },
    { id: 'AL-2406', est: 'J. P.',  nivel: 'Secundario', motivo: 'Horas al 41% de lo esperado',       sev: 'bad',  sla: '−1 d',  resp: 'Sede Ceferino' },
    { id: 'AL-2398', est: 'L. R.',  nivel: 'Superior',   motivo: 'Sin contacto efectivo hace 51 días', sev: 'bad', sla: 'hoy',   resp: 'Equipo Ext. Educativa' },
    { id: 'AL-2395', est: 'S. A.',  nivel: 'Secundario', motivo: 'Rechazo bancario del pago',          sev: 'warn', sla: '1 d',   resp: 'Tesorería' },
    { id: 'AL-2390', est: 'D. C.',  nivel: 'Superior',   motivo: '2 faltas consecutivas sin aviso',    sev: 'warn', sla: '2 d',   resp: 'Sede 28 de Junio' }
  ],

  /* Mesa de territorio — cola de validación */
  validaciones: [
    { est: 'C. M.', sede: '28 de Junio', proyecto: 'Apoyo escolar secundario', horas: 3, fecha: 'hoy 14:20',  geo: 'dentro',  ev: true },
    { est: 'R. T.', sede: 'Ceferino',    proyecto: 'Alfabetización digital',   horas: 2, fecha: 'hoy 11:05',  geo: 'dentro',  ev: true },
    { est: 'F. L.', sede: 'Estación',    proyecto: 'Vivero y arbolado',        horas: 4, fecha: 'ayer 16:40', geo: 'fuera',   ev: true },
    { est: 'N. S.', sede: 'Don Bosco',   proyecto: 'Campaña de salud barrial', horas: 3, fecha: 'ayer 09:30', geo: 'sin dato', ev: false },
    { est: 'A. V.', sede: '28 de Junio', proyecto: 'Apoyo escolar secundario', horas: 2, fecha: 'ayer 15:10', geo: 'dentro',  ev: true }
  ],

  /* Sugerencias del motor de matching */
  matching: [
    { est: 'C. M.', carrera: 'Prof. de Matemática', proyecto: 'Apoyo escolar a becarios de secundario', sede: '28 de Junio', afinidad: 94 },
    { est: 'R. T.', carrera: 'Tec. en Informática', proyecto: 'Alfabetización digital adultos mayores',  sede: 'Ceferino',    afinidad: 91 },
    { est: 'N. S.', carrera: 'Enfermería',          proyecto: 'Campaña de salud en sede barrial',        sede: 'Don Bosco',   afinidad: 88 },
    { est: 'F. L.', carrera: 'Tec. Forestal',       proyecto: 'Vivero y arbolado urbano',                sede: 'Estación',    afinidad: 86 },
    { est: 'P. O.', carrera: 'Turismo',             proyecto: 'Relevamiento de senderos',                sede: 'Los Sauces',  afinidad: 79 }
  ],

  /* Minigráficos de las tarjetas de indicador */
  sparks: {
    permanencia: [81, 82, 80, 83, 84, 85, 84, 86, 87, 88, 89, 91],
    costo:       [412, 408, 405, 399, 396, 391, 388, 384, 380, 377, 374, 371],
    horas:       [52, 58, 61, 66, 64, 71, 74, 78, 81, 84, 86, 87],
    sla:         [62, 65, 71, 69, 74, 78, 81, 83, 86, 88, 90, 92]
  }
};
