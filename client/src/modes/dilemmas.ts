/**
 * Los dilemas del Modo Candidato.
 *
 * Cada carta es una decisión de campaña con dos o tres salidas, y ninguna es
 * gratis: lo que te suma rosca te resta imagen, lo que te llena la caja te sube
 * el escándalo. Ese es todo el juego.
 *
 * Cuatro variables:
 *   cajaCampana    la guita para operar
 *   roscaPolitica  el apoyo de punteros y concejales
 *   imagenPublica  cómo te ven en los barrios
 *   nivelEscandalo cuánto le falta al carpetazo para explotar
 */

export interface DilemmaOption {
  readonly id: string;
  readonly label: string;
  /** Lo que pasa después, en una línea. */
  readonly outcome: string;
  readonly effects: {
    readonly caja?: number;
    readonly rosca?: number;
    readonly imagen?: number;
    readonly escandalo?: number;
  };
  /** Sólo aparece si el arquetipo es este. */
  readonly onlyFor?: 'oficialista' | 'outsider' | 'caudillo';
}

export interface Dilemma {
  readonly id: string;
  /** Quién te trae el problema. */
  readonly source: string;
  readonly title: string;
  readonly text: string;
  readonly options: readonly DilemmaOption[];
  /** Turno mínimo en el que puede salir: los quilombos grandes vienen después. */
  readonly minTurn?: number;
}

export const DILEMMAS: readonly Dilemma[] = [
  {
    id: 'puntero_badenes',
    source: 'El puntero del Badén',
    title: 'Quiere la lista',
    text: 'Te dice que mueve trescientos votos en el barrio, pero quiere dos lugares en la lista y la camioneta los fines de semana.',
    options: [
      {
        id: 'dar',
        label: 'Dale los dos lugares',
        outcome: 'El barrio se te llena de pintadas tuyas en una noche.',
        effects: { rosca: 14, imagen: -4, escandalo: 6 },
      },
      {
        id: 'uno',
        label: 'Ofrecele uno solo',
        outcome: 'Se va rezongando, pero se va con algo.',
        effects: { rosca: 6, escandalo: 2 },
      },
      {
        id: 'nada',
        label: 'Decile que la lista se arma por consenso',
        outcome: 'Se ríe en tu cara y llama al de enfrente.',
        effects: { rosca: -10, imagen: 6 },
      },
    ],
  },
  {
    id: 'sobre_del_empresario',
    source: 'Un empresario de la construcción',
    title: 'El sobre',
    text: 'Te invita a comer y te deja un sobre sobre la mesa. No dice nada. Vos tampoco.',
    options: [
      {
        id: 'tomar',
        label: 'Guardarlo sin abrirlo',
        outcome: 'La campaña respira. Alguien en el restaurante sacó una foto.',
        effects: { caja: 22, escandalo: 16 },
      },
      {
        id: 'devolver',
        label: 'Devolverlo delante del mozo',
        outcome: 'El gesto llega a la radio antes que vos a tu casa.',
        effects: { imagen: 14, caja: -6, rosca: -4 },
      },
    ],
  },
  {
    id: 'nieve_barrio',
    source: 'Una vecina de Ceferino',
    title: 'Nevó tres días',
    text: 'El barrio está tapado, la máquina municipal no aparece y hay gente sin leña.',
    options: [
      {
        id: 'ir',
        label: 'Ir con la camioneta y repartir leña',
        outcome: 'Te sacan cien fotos con la pala en la mano. Y la espalda te va a doler.',
        effects: { imagen: 18, caja: -10 },
      },
      {
        id: 'denunciar',
        label: 'Grabar un video denunciando al intendente',
        outcome: 'Se viraliza. La mitad te aplaude, la otra mitad dice que hacés política con la nieve.',
        effects: { imagen: 8, rosca: -6, escandalo: 4 },
      },
      {
        id: 'delegar',
        label: 'Mandar a los muchachos',
        outcome: 'Reparten, pero la foto se la sacan ellos.',
        effects: { imagen: 6, rosca: 6, caja: -6 },
      },
    ],
  },
  {
    id: 'radio_incomoda',
    source: 'La radio del centro',
    title: 'Te invitan al aire',
    text: 'Quieren preguntarte por la obra de la costanera. La que sigue sin terminar desde tu gestión anterior.',
    options: [
      {
        id: 'ir',
        label: 'Ir y bancarte las preguntas',
        outcome: 'Zafás, medio transpirado, pero zafás.',
        effects: { imagen: 10, escandalo: -6 },
      },
      {
        id: 'mandar',
        label: 'Mandar al vocero',
        outcome: 'El vocero se enreda y empeora todo.',
        effects: { imagen: -8, escandalo: 6 },
      },
      {
        id: 'evitar',
        label: 'Decir que estás de viaje',
        outcome: 'Te ven esa tarde en el supermercado.',
        effects: { imagen: -12, escandalo: 8 },
      },
    ],
  },
  {
    id: 'interna_comite',
    source: 'La interna del comité',
    title: 'Se quieren quedar con la caja',
    text: 'Dos concejales de tu propio bando piden manejar los fondos de campaña "para ordenar".',
    options: [
      {
        id: 'ceder',
        label: 'Cederles la caja',
        outcome: 'Te sacás la interna de encima y te quedás sin plata propia.',
        effects: { rosca: 16, caja: -18 },
      },
      {
        id: 'pelear',
        label: 'Plantarte',
        outcome: 'Ganás la pulseada. Te van a hacer pagar cada peso.',
        effects: { rosca: -14, caja: 8, escandalo: 4 },
      },
    ],
    minTurn: 4,
  },
  {
    id: 'spot_drone',
    source: 'Tu community manager',
    title: 'El spot con drone',
    text: 'Propone un spot con drone sobrevolando La Hoya y música épica. Sale una fortuna.',
    options: [
      {
        id: 'hacerlo',
        label: 'Hacerlo',
        outcome: 'Queda espectacular. En los comentarios te preguntan cuánto costó.',
        effects: { imagen: 14, caja: -16, escandalo: 4 },
      },
      {
        id: 'casero',
        label: 'Grabarlo con el celular en la plaza',
        outcome: 'Sale bastante berreta, pero la gente lo comparte igual.',
        effects: { imagen: 6, caja: -2 },
      },
    ],
  },
  {
    id: 'foto_ministro',
    source: 'Rawson',
    title: 'Viene el ministro',
    text: 'Baja el ministro a inaugurar media obra. Quiere la foto con vos al lado.',
    options: [
      {
        id: 'foto',
        label: 'Sacarte la foto',
        outcome: 'La provincia te abre la billetera.',
        effects: { caja: 16, rosca: 12, imagen: -6 },
      },
      {
        id: 'faltar',
        label: 'Faltar con una excusa',
        outcome: 'En Rawson no se olvidan de estas cosas.',
        effects: { rosca: -12, imagen: 8 },
      },
    ],
    minTurn: 3,
  },
  {
    id: 'denuncia_anonima',
    source: 'Un sobre anónimo',
    title: 'Te llegó una carpeta',
    text: 'Alguien te dejó documentación sobre el candidato de enfrente. Es material sensible.',
    options: [
      {
        id: 'filtrar',
        label: 'Filtrarla a un periodista amigo',
        outcome: 'Sale en la tapa. Todos saben de dónde salió.',
        effects: { imagen: 6, escandalo: 14, rosca: 6 },
      },
      {
        id: 'guardar',
        label: 'Guardarla por si acaso',
        outcome: 'Dormís peor, pero tenés un as en la manga.',
        effects: { rosca: 4, escandalo: 4 },
      },
      {
        id: 'quemar',
        label: 'Quemarla',
        outcome: 'Nadie se entera. Vos sí.',
        effects: { imagen: 4, escandalo: -8 },
      },
    ],
    minTurn: 5,
  },
  {
    id: 'acto_final',
    source: 'El cierre de campaña',
    title: 'El escenario',
    text: 'Podés hacer el acto en la Plaza San Martín, en el club del barrio o en un asado de mil personas.',
    options: [
      {
        id: 'plaza',
        label: 'La plaza, con escenario y todo',
        outcome: 'Se llena. Sale carísimo.',
        effects: { imagen: 16, caja: -20, rosca: 6 },
      },
      {
        id: 'club',
        label: 'El club del barrio',
        outcome: 'Se llena igual y sobra guita.',
        effects: { imagen: 8, rosca: 8, caja: -6 },
      },
      {
        id: 'asado',
        label: 'Asado para mil',
        outcome: 'Va todo el mundo. Al día siguiente hablan del asado, no de vos.',
        effects: { imagen: 10, rosca: 14, caja: -16, escandalo: 4 },
      },
    ],
    minTurn: 8,
  },
  {
    id: 'encuesta_propia',
    source: 'Tu encuestador',
    title: 'La encuesta no da',
    text: 'Estás cuatro puntos abajo. Te ofrece "ajustar la metodología" y publicarla igual.',
    options: [
      {
        id: 'ajustar',
        label: 'Publicarla ajustada',
        outcome: 'Levanta el ánimo del comité. Alguien la va a chequear.',
        effects: { rosca: 10, escandalo: 12 },
      },
      {
        id: 'real',
        label: 'Publicar la real',
        outcome: 'Sos el único que publica una encuesta que lo pone abajo. Raro. Y creíble.',
        effects: { imagen: 12, rosca: -6 },
      },
      {
        id: 'cajon',
        label: 'Al cajón',
        outcome: 'No la ve nadie.',
        effects: { escandalo: -2 },
      },
    ],
  },
  {
    id: 'militante_preso',
    source: 'El comité, tres de la mañana',
    title: 'Cayó un pegatinero',
    text: 'A dos militantes los llevó la policía pegando afiches en propiedad privada.',
    options: [
      {
        id: 'ir',
        label: 'Ir personalmente a la comisaría',
        outcome: 'Salís a las seis de la mañana con los dos y una lealtad eterna.',
        effects: { rosca: 14, imagen: -4 },
      },
      {
        id: 'abogado',
        label: 'Mandar al abogado',
        outcome: 'Se resuelve. Nadie te lo agradece demasiado.',
        effects: { rosca: 4, caja: -6 },
      },
      {
        id: 'despegar',
        label: 'Decir que no son tuyos',
        outcome: 'Se enteran. Todos.',
        effects: { rosca: -18, imagen: -8 },
      },
    ],
    minTurn: 2,
  },
  {
    id: 'comercio_sponsor',
    source: 'Un comercio del centro',
    title: 'Quiere auspiciar',
    text: 'Te ofrece financiar los volantes a cambio de que le arregles un problema de habilitación.',
    options: [
      {
        id: 'aceptar',
        label: 'Aceptar',
        outcome: 'Volantes gratis por un mes.',
        effects: { caja: 14, escandalo: 12 },
      },
      {
        id: 'rechazar',
        label: 'Rechazar y pagar los volantes',
        outcome: 'Duele el bolsillo, duerme tranquilo.',
        effects: { caja: -8, imagen: 6 },
      },
    ],
  },
];

/** Dilemas propios de cada arquetipo: la campaña no le pasa igual a todos. */
export const ARCHETYPE_DILEMMAS: readonly Dilemma[] = [
  {
    id: 'oficialista_gestion',
    source: 'Tu propia gestión',
    title: 'Te preguntan por los ocho años',
    text: 'En cada acto alguien levanta la mano y pregunta qué hiciste en dos mandatos.',
    options: [
      {
        id: 'defender',
        label: 'Defender la gestión con datos',
        outcome: 'Convencés a los convencidos.',
        effects: { rosca: 8, imagen: -2 },
        onlyFor: 'oficialista',
      },
      {
        id: 'autocritica',
        label: 'Hacer autocrítica',
        outcome: 'Sorprende. A los tuyos no les gusta nada.',
        effects: { imagen: 16, rosca: -12 },
        onlyFor: 'oficialista',
      },
    ],
  },
  {
    id: 'outsider_equipo',
    source: 'La prensa',
    title: '¿Y el equipo?',
    text: 'Te preguntan quiénes te acompañan. No tenés a casi nadie.',
    options: [
      {
        id: 'inventar',
        label: 'Anunciar nombres que todavía no confirmaron',
        outcome: 'Dos desmienten a las tres horas.',
        effects: { imagen: -6, escandalo: 14, rosca: 4 },
        onlyFor: 'outsider',
      },
      {
        id: 'honesto',
        label: 'Decir que el equipo se arma con la gente',
        outcome: 'Aplausos en la calle, risas en el comité.',
        effects: { imagen: 12, rosca: -8 },
        onlyFor: 'outsider',
      },
    ],
  },
  {
    id: 'caudillo_capital',
    source: 'El centro',
    title: 'Fuera de tu barrio no te conocen',
    text: 'Arrasás en la periferia y en el centro no te registra nadie.',
    options: [
      {
        id: 'centro',
        label: 'Poner toda la plata en el centro',
        outcome: 'Ganás algo de imagen y descuidás tu propio barrio.',
        effects: { imagen: 12, caja: -14, rosca: -6 },
        onlyFor: 'caudillo',
      },
      {
        id: 'barrio',
        label: 'Reforzar lo que ya tenés',
        outcome: 'Tu barrio te vota entero. El centro sigue sin saber quién sos.',
        effects: { rosca: 14, imagen: -4 },
        onlyFor: 'caudillo',
      },
    ],
  },
];
