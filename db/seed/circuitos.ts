/**
 * Datos de los circuitos de ejemplo del Sistema de Montaña de Esquel.
 *
 * IMPORTANTE: las trazas son sintéticas y las coordenadas aproximadas. Este
 * material sirve para mostrar la herramienta en funcionamiento; el contenido
 * definitivo surge del relevamiento colaborativo con la ficha común. Cada
 * circuito lleva una nota interna de gestión recordándolo.
 */

export type Anchor = { lat: number; lng: number; ele: number };

export interface SeedPoi {
  /** Posición sobre la traza, de 0 (salida) a 1 (llegada). */
  at: number;
  type:
    | "salida"
    | "llegada"
    | "cultural"
    | "naturaleza"
    | "mirador"
    | "pueblo"
    | "cruce"
    | "gastronomia"
    | "alojamiento"
    | "agua"
    | "precaucion"
    | "interes";
  name: string;
  description: string;
  /** Desplazamiento lateral en grados, para POIs que no están sobre la traza. */
  offsetLat?: number;
  offsetLng?: number;
}

export interface SeedCircuit {
  slug: string;
  name: string;
  summary: string;
  description: string;
  difficulty: "facil" | "moderada" | "dificil";
  activity: "senderismo" | "bici" | "auto" | "cabalgata" | "mixto";
  region: string;
  province: string;
  durationMin: number;
  status: "draft" | "published";
  systemState:
    | "relevado"
    | "en_gestion_de_acuerdo"
    | "publicable"
    | "uso_local_no_difundible"
    | "suspendido";
  soilSituation:
    | "publico"
    | "privado_con_acuerdo"
    | "privado_sin_acuerdo"
    | "titularidad_en_definicion"
    | "provincial_o_nacional";
  altNames: string;
  accessDescription: string;
  compatibleUses: string;
  incompatibleUses: string;
  seasonality: string;
  risks: string;
  conservationState: string;
  maintainedBy: string;
  background: string;
  contributedBy: string;
  reviewedBy: string;
  anchors: Anchor[];
  pois: SeedPoi[];
}

const NOTA_INTERNA =
  "Contenido de ejemplo cargado para la puesta en marcha de YATEN. " +
  "Traza sintética y coordenadas aproximadas: reemplazar por el relevamiento " +
  "real antes de dar la ficha por cerrada.";

export const NOTA_INTERNA_SEED = NOTA_INTERNA;

export const CIRCUITOS: SeedCircuit[] = [
  // ───────────────────────────────────────────────────────────
  {
    slug: "cerro-la-torta",
    name: "Cerro La Torta",
    summary:
      "Ascenso clásico periurbano al oeste de Esquel, con vista completa del valle y de la ciudad desde la cima achatada que le da nombre.",
    description: `## Cerro La Torta

Uno de los ascensos más frecuentados de Esquel por su cercanía al casco urbano
y por la vista que ofrece: desde la cima se domina el valle, la ciudad y, en
días despejados, buena parte del cordón cordillerano.

La marca distintiva del cerro es su **cima achatada**, que le da el nombre
popular. La subida es sostenida pero sin dificultad técnica.

**Recomendaciones**

- Llevar agua: no hay fuentes seguras en el recorrido.
- Viento fuerte habitual en el filo, incluso con buen tiempo abajo.
- Calzado con agarre: hay tramos de suelo suelto.`,
    difficulty: "moderada",
    activity: "senderismo",
    region: "Comarca Los Alerces",
    province: "Chubut",
    durationMin: 210,
    status: "published",
    systemState: "publicable",
    soilSituation: "publico",
    altNames: "La Torta, Cerro Torta",
    accessDescription:
      "Desde el oeste de la ciudad, tomando el camino de acceso hasta el pie del faldeo. Estacionamiento informal en la base. Sin transporte público hasta el inicio.",
    compatibleUses: "Senderismo, trail running, observación de aves y de flora.",
    incompatibleUses:
      "Vehículos motorizados en el faldeo: el suelo suelto se erosiona con facilidad y ya hay cárcavas abiertas por huellas previas.",
    seasonality:
      "Todo el año. Entre junio y septiembre puede haber nieve y hielo en el tramo superior.",
    risks:
      "Viento intenso en el filo. Tramo final con suelo suelto y pendiente. Sin señal de telefonía en el sector medio del ascenso.",
    conservationState:
      "Bueno en el tramo bajo. Erosión visible por apertura de huellas paralelas en la mitad superior.",
    maintainedBy: "Municipalidad de Esquel, con colaboración de clubes locales.",
    background:
      "Ascenso de uso histórico y cotidiano de los habitantes de Esquel, incorporado desde hace décadas a la práctica deportiva y recreativa de la ciudad.",
    contributedBy: "Subsecretaría de Turismo de Esquel",
    reviewedBy: "Pendiente de revisión en grupo de trabajo",
    anchors: [
      { lat: -42.9105, lng: -71.3395, ele: 610 },
      { lat: -42.9130, lng: -71.3480, ele: 780 },
      { lat: -42.9155, lng: -71.3550, ele: 990 },
      { lat: -42.9180, lng: -71.3610, ele: 1210 },
      { lat: -42.9205, lng: -71.3665, ele: 1420 },
      { lat: -42.9220, lng: -71.3700, ele: 1530 },
    ],
    pois: [
      {
        at: 0,
        type: "salida",
        name: "Base del faldeo — inicio de sendero",
        description:
          "Punto de partida al pie del cerro. Espacio para estacionar sobre el costado del camino. Desde acá el sendero sube en dirección oeste y es visible durante todo el ascenso.",
      },
      {
        at: 0.08,
        type: "precaucion",
        name: "Tranquera de ingreso",
        description:
          "Tranquera de acceso al faldeo. **Dejarla siempre como se la encontró.** Es la condición básica de convivencia con el uso ganadero de la zona.",
      },
      {
        at: 0.18,
        type: "naturaleza",
        name: "Estepa de coirón",
        description:
          "Primer tramo sobre estepa patagónica: coirón, neneo y arbustos bajos adaptados al viento. En primavera aparecen las primeras floraciones al costado del sendero.",
      },
      {
        at: 0.3,
        type: "mirador",
        name: "Primer balcón sobre la ciudad",
        description:
          "Rellano natural con la primera vista abierta de Esquel. Buen lugar para una pausa y para dimensionar la traza urbana desde la altura.",
      },
      {
        at: 0.42,
        type: "cruce",
        name: "Bifurcación del faldeo norte",
        description:
          "Cruce con la huella que rodea el faldeo norte. **Para la cima, seguir por la izquierda.** La huella de la derecha bordea el cerro sin subir.",
      },
      {
        at: 0.55,
        type: "interes",
        name: "Afloramiento rocoso",
        description:
          "Afloramiento de roca expuesta que funciona como referencia de altura y como reparo del viento. Punto habitual de descanso antes del tramo más empinado.",
      },
      {
        at: 0.68,
        type: "precaucion",
        name: "Tramo de suelo suelto",
        description:
          "Sector de pendiente sostenida con material suelto. Conviene subir en fila y no en abanico: la apertura de huellas paralelas es la principal causa de erosión del cerro.",
      },
      {
        at: 0.82,
        type: "mirador",
        name: "Filo — vista al cordón",
        description:
          "Salida al filo, con vista hacia el cordón cordillerano al oeste. **Zona de viento fuerte y constante**, incluso en días calmos abajo.",
      },
      {
        at: 1,
        type: "llegada",
        name: "Cima de La Torta",
        description:
          "Cima achatada que da nombre al cerro. Vista de 360°: la ciudad y el valle al este, la cordillera al oeste. El regreso se hace por la misma traza.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    slug: "cerro-veintiuno",
    name: "Cerro Veintiuno",
    summary:
      "Ascenso al sur de la ciudad sobre campo privado con acta de conformidad. Vista del valle de Esquel y del acceso sur.",
    description: `## Cerro Veintiuno

Ascenso al sur de Esquel, de uso deportivo frecuente. El circuito atraviesa un
predio privado y se recorre **bajo las condiciones acordadas con el titular**,
que constan en la ficha y deben respetarse.

Terreno abierto, sin bosque, con pendiente sostenida en el tramo medio. La
cima ofrece una vista despejada del valle y del acceso sur a la ciudad.

**Condiciones acordadas**

- Grupos de hasta 15 personas.
- Sin fuego, sin pernocte, sin mascotas sueltas.
- Tranqueras siempre cerradas.`,
    difficulty: "moderada",
    activity: "senderismo",
    region: "Comarca Los Alerces",
    province: "Chubut",
    durationMin: 180,
    status: "published",
    systemState: "publicable",
    soilSituation: "privado_con_acuerdo",
    altNames: "Cerro 21, El Veintiuno",
    accessDescription:
      "Acceso desde el sur de la ciudad por camino vecinal hasta la tranquera del predio. Estacionar sin obstruir el paso de vehículos rurales.",
    compatibleUses: "Senderismo y trail running, en grupos de hasta 15 personas.",
    incompatibleUses:
      "Fuego de cualquier tipo, pernocte, mascotas sueltas y vehículos motorizados: excluidos expresamente por el acta de conformidad con el titular.",
    seasonality:
      "Recomendable de octubre a mayo. En invierno el camino de acceso puede volverse intransitable con nieve o barro.",
    risks:
      "Presencia de ganado en el faldeo. Pendiente sostenida sin sombra: exposición al sol en verano. Viento en la cima.",
    conservationState: "Bueno. Sendero marcado y estable.",
    maintainedBy:
      "Titular del predio, con acompañamiento de la Subsecretaría de Turismo.",
    background:
      "Circuito de uso deportivo consolidado, incorporado al Sistema tras la firma del acta de conformidad con el titular del predio.",
    contributedBy: "Subsecretaría de Turismo de Esquel",
    reviewedBy: "Pendiente de revisión en grupo de trabajo",
    anchors: [
      { lat: -42.9480, lng: -71.3180, ele: 590 },
      { lat: -42.9525, lng: -71.3240, ele: 720 },
      { lat: -42.9570, lng: -71.3295, ele: 900 },
      { lat: -42.9610, lng: -71.3340, ele: 1080 },
      { lat: -42.9640, lng: -71.3375, ele: 1210 },
    ],
    pois: [
      {
        at: 0,
        type: "salida",
        name: "Tranquera de acceso — inicio",
        description:
          "Punto de inicio en la tranquera del predio. **El acceso está acordado con el titular**: pasar en silencio, dejar la tranquera cerrada y no salir de la huella marcada.",
      },
      {
        at: 0.1,
        type: "precaucion",
        name: "Zona de pastoreo",
        description:
          "Sector con presencia habitual de ganado. Rodear los animales sin acercarse ni apurarlos. **No ingresar con mascotas sueltas.**",
      },
      {
        at: 0.24,
        type: "agua",
        name: "Vertiente del faldeo",
        description:
          "Vertiente de caudal variable, seca en verano. **Verificar potabilidad antes de consumir**: es un curso de agua sin análisis.",
      },
      {
        at: 0.38,
        type: "mirador",
        name: "Balcón del acceso sur",
        description:
          "Vista del acceso sur a Esquel y del valle. Se distingue con claridad la traza de la ruta y la expansión urbana en esa dirección.",
      },
      {
        at: 0.5,
        type: "naturaleza",
        name: "Mata de neneo",
        description:
          "Parche bien conservado de neneo y coirón, con arbustos en cojín característicos de la estepa de altura. Refugio de fauna pequeña.",
      },
      {
        at: 0.63,
        type: "cruce",
        name: "Cruce de huellas",
        description:
          "Intersección con una huella de servicio del campo. **Seguir de frente**, en dirección a la cima. La huella lateral es de uso del establecimiento.",
      },
      {
        at: 0.78,
        type: "precaucion",
        name: "Pendiente expuesta al sol",
        description:
          "Tramo empinado sin sombra. En verano conviene encararlo temprano; el calor sobre el faldeo norte es intenso desde media mañana.",
      },
      {
        at: 1,
        type: "llegada",
        name: "Cima del Veintiuno",
        description:
          "Cima con vista del valle de Esquel y de los cordones vecinos. Regreso por la misma traza, respetando las condiciones acordadas.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    slug: "laguna-la-zeta",
    name: "Laguna La Zeta",
    summary:
      "Circuito recreativo familiar en el área municipal de La Zeta: laguna, bosque implantado, miradores sobre la ciudad y bajada suave de regreso.",
    description: `## Laguna La Zeta

El circuito más accesible del Sistema y el de mayor uso recreativo: un área
municipal a pocos minutos del centro de Esquel, con laguna, forestación
implantada, senderos anchos y miradores sobre la ciudad.

Apto para **familias, salidas escolares y primeras experiencias de montaña**.
Recorrido de pendiente suave, bien señalizado y con buena parte del trazado
sobre camino consolidado.

Es también el circuito de referencia para actividades de educación ambiental.`,
    difficulty: "facil",
    activity: "mixto",
    region: "Comarca Los Alerces",
    province: "Chubut",
    durationMin: 120,
    status: "published",
    systemState: "publicable",
    soilSituation: "publico",
    altNames: "La Zeta, Área Recreativa La Zeta",
    accessDescription:
      "Acceso pavimentado y luego de ripio desde el noroeste de la ciudad. Estacionamiento habilitado en el área recreativa. Llegada posible en bicicleta desde el centro.",
    compatibleUses:
      "Senderismo, ciclismo, salidas educativas, observación de aves, uso recreativo familiar.",
    incompatibleUses:
      "Fuego fuera de los sectores habilitados y circulación de vehículos motorizados fuera del camino principal.",
    seasonality:
      "Todo el año. En invierno el camino de acceso puede requerir precaución por hielo.",
    risks:
      "Bajo. Precaución con niños en la orilla de la laguna y en los sectores de mirador con desnivel.",
    conservationState:
      "Bueno. Área con mantenimiento municipal regular y señalización existente.",
    maintainedBy: "Municipalidad de Esquel.",
    background:
      "Área recreativa municipal consolidada, con forestación implantada y uso público sostenido durante todo el año. Es uno de los espacios de referencia para la recreación de la ciudad.",
    contributedBy: "Subsecretaría de Turismo de Esquel",
    reviewedBy: "Pendiente de revisión en grupo de trabajo",
    anchors: [
      { lat: -42.8845, lng: -71.3440, ele: 800 },
      { lat: -42.8800, lng: -71.3490, ele: 830 },
      { lat: -42.8770, lng: -71.3555, ele: 870 },
      { lat: -42.8800, lng: -71.3615, ele: 905 },
      { lat: -42.8860, lng: -71.3600, ele: 880 },
      { lat: -42.8890, lng: -71.3520, ele: 840 },
      { lat: -42.8845, lng: -71.3440, ele: 800 },
    ],
    pois: [
      {
        at: 0,
        type: "salida",
        name: "Área recreativa — inicio del circuito",
        description:
          "Punto de partida en el sector de estacionamiento del área recreativa. El circuito es **circular**: se regresa a este mismo punto.",
      },
      {
        at: 0.07,
        type: "interes",
        name: "Cartelería de bienvenida",
        description:
          "Panel informativo del área, con el mapa general y las recomendaciones de uso. Punto de encuentro habitual para grupos y salidas escolares.",
      },
      {
        at: 0.16,
        type: "agua",
        name: "Orilla de la laguna",
        description:
          "Costa de la laguna, el corazón del área recreativa. Buen sector para observación de aves acuáticas. **Precaución con niños en la orilla.**",
      },
      {
        at: 0.26,
        type: "naturaleza",
        name: "Bosque implantado",
        description:
          "Sector de forestación implantada que contrasta con la estepa circundante. Da sombra durante buena parte del recorrido y funciona como reparo del viento.",
      },
      {
        at: 0.36,
        type: "interes",
        name: "Estación de educación ambiental",
        description:
          "Sector utilizado para actividades educativas y de interpretación ambiental con escuelas de la ciudad.",
      },
      {
        at: 0.47,
        type: "mirador",
        name: "Mirador de Esquel",
        description:
          "Vista panorámica de la ciudad y del valle. Es el punto fotográfico más conocido del circuito y el mejor lugar para entender la geografía de Esquel de un vistazo.",
      },
      {
        at: 0.56,
        type: "gastronomia",
        name: "Sector de mesas y descanso",
        description:
          "Área con mesas y espacio de descanso. **El fuego sólo está permitido en los sectores expresamente habilitados.**",
      },
      {
        at: 0.66,
        type: "naturaleza",
        name: "Flora nativa de estepa",
        description:
          "Tramo donde reaparece la vegetación nativa: coirón, calafate y arbustos bajos. Buen sector para comparar el ambiente implantado con el original.",
      },
      {
        at: 0.76,
        type: "mirador",
        name: "Vista al cordón oeste",
        description:
          "Balcón orientado al oeste, con vista a los cerros del cordón. Al atardecer es el mejor punto de luz del recorrido.",
      },
      {
        at: 0.86,
        type: "cruce",
        name: "Empalme de regreso",
        description:
          "Cruce donde el circuito empalma con el camino de regreso al estacionamiento. **Doblar a la izquierda** para cerrar el circuito.",
      },
      {
        at: 1,
        type: "llegada",
        name: "Cierre del circuito",
        description:
          "Regreso al punto de partida. El recorrido completo se hace cómodamente en unas dos horas a paso tranquilo.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    slug: "cerro-nahuel-pan",
    name: "Cerro Nahuel Pan",
    summary:
      "Ascenso al este de Esquel, en el entorno de la comunidad de Nahuel Pan. Circuito de alto valor cultural y paisajístico, con acceso coordinado.",
    description: `## Cerro Nahuel Pan

Ascenso al este de Esquel, en el entorno de la localidad de **Nahuel Pan**. Es
uno de los circuitos de mayor valor cultural del Sistema: el recorrido atraviesa
un territorio con presencia de la comunidad mapuche-tehuelche y con la impronta
del paso histórico del ferrocarril de trocha angosta.

El acceso se realiza **en coordinación con la comunidad y los titulares del
predio**, bajo las condiciones que constan en la ficha. No es un circuito de
acceso libre: el respeto de esas condiciones es lo que lo mantiene abierto.

Terreno de estepa alta, con vistas amplias hacia el valle y la cordillera.`,
    difficulty: "dificil",
    activity: "senderismo",
    region: "Comarca Los Alerces",
    province: "Chubut",
    durationMin: 330,
    status: "published",
    systemState: "publicable",
    soilSituation: "privado_con_acuerdo",
    altNames: "Nahuel Pan, Cerro Nahuelpan",
    accessDescription:
      "Acceso por ruta hacia el este de Esquel hasta la localidad de Nahuel Pan, y desde allí por camino vecinal hasta el inicio del faldeo. Coordinar el ingreso previamente.",
    compatibleUses:
      "Senderismo y ascensionismo, en grupos reducidos y con aviso previo. Actividades de interpretación cultural coordinadas con la comunidad.",
    incompatibleUses:
      "Circulación de vehículos motorizados fuera del camino vecinal, fuego, y toda actividad no coordinada previamente con la comunidad y los titulares.",
    seasonality:
      "De noviembre a abril. Fuera de esa ventana la nieve y el viento hacen el ascenso considerablemente más exigente.",
    risks:
      "Jornada larga y exigente. Cambios bruscos de tiempo. Ausencia de agua segura en el tramo alto. Sin señal de telefonía en buena parte del recorrido.",
    conservationState:
      "Muy bueno. Baja intervención y escasa apertura de huellas paralelas.",
    maintainedBy:
      "Sin mantenimiento formal. Uso de baja intensidad coordinado localmente.",
    background:
      "Cerro de referencia en el paisaje del este de Esquel, con valor cultural para la comunidad mapuche-tehuelche del área y vinculado al recorrido histórico del ferrocarril de trocha angosta.",
    contributedBy: "Subsecretaría de Turismo de Esquel",
    reviewedBy: "Pendiente de revisión con la comunidad de Nahuel Pan",
    anchors: [
      { lat: -42.9420, lng: -71.1980, ele: 780 },
      { lat: -42.9470, lng: -71.1900, ele: 940 },
      { lat: -42.9530, lng: -71.1830, ele: 1180 },
      { lat: -42.9585, lng: -71.1765, ele: 1450 },
      { lat: -42.9630, lng: -71.1700, ele: 1720 },
      { lat: -42.9665, lng: -71.1650, ele: 1930 },
      { lat: -42.9685, lng: -71.1615, ele: 2050 },
    ],
    pois: [
      {
        at: 0,
        type: "salida",
        name: "Inicio del faldeo — punto de coordinación",
        description:
          "Punto de partida. **El ingreso se coordina previamente** con la comunidad y los titulares del predio. Es la condición que mantiene este circuito abierto.",
      },
      {
        at: 0.06,
        type: "cultural",
        name: "Entorno de la comunidad de Nahuel Pan",
        description:
          "El circuito se inicia en el entorno de la comunidad mapuche-tehuelche de Nahuel Pan. Se solicita **transitar con respeto**, no ingresar a espacios de uso comunitario y no fotografiar viviendas ni personas sin consentimiento.",
      },
      {
        at: 0.14,
        type: "cultural",
        name: "Traza del ferrocarril de trocha angosta",
        description:
          "Sector vinculado al recorrido histórico del ferrocarril de trocha angosta, que atraviesa la zona y forma parte de la identidad ferroviaria de la región.",
      },
      {
        at: 0.24,
        type: "agua",
        name: "Último punto de agua",
        description:
          "**Último curso de agua del recorrido.** A partir de acá no hay reposición posible: cargar lo necesario para toda la jornada, ida y vuelta.",
      },
      {
        at: 0.34,
        type: "naturaleza",
        name: "Estepa alta",
        description:
          "Ingreso a la estepa de altura, con vegetación en cojín adaptada al viento y a la amplitud térmica. Ambiente frágil: conviene no salir de la huella.",
      },
      {
        at: 0.46,
        type: "mirador",
        name: "Balcón sobre el valle",
        description:
          "Primera vista amplia del valle hacia el oeste, con Esquel a lo lejos. Buen punto para evaluar el estado del tiempo antes de seguir subiendo.",
      },
      {
        at: 0.56,
        type: "precaucion",
        name: "Punto de decisión",
        description:
          "**Punto de decisión de la jornada.** Si el tiempo se cierra o el grupo viene demorado, conviene regresar desde acá: el tramo superior es el más expuesto y largo.",
      },
      {
        at: 0.68,
        type: "interes",
        name: "Campo de bloques",
        description:
          "Sector de bloques rocosos donde la huella se vuelve difusa. Avanzar atento a las marcas y mantener el grupo compacto.",
      },
      {
        at: 0.79,
        type: "precaucion",
        name: "Filo expuesto al viento",
        description:
          "Salida al filo, con **viento fuerte y sensación térmica muy inferior** a la del faldeo. Abrigo cortaviento indispensable, incluso en verano.",
      },
      {
        at: 0.9,
        type: "mirador",
        name: "Antecima",
        description:
          "Antecima con vista de la cadena cordillerana al oeste. Desde acá la cima queda a la vista y el terreno se suaviza.",
      },
      {
        at: 1,
        type: "llegada",
        name: "Cima del Nahuel Pan",
        description:
          "Cima del cerro, el punto más alto del Sistema entre los circuitos relevados hasta ahora. Vista de 360° sobre el este de la comarca y la cordillera. Regreso por la misma traza.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    slug: "cerro-la-zeta",
    name: "Cerro La Zeta",
    summary:
      "Ascenso al cordón por encima del área recreativa. Circuito relevado y registrado, con titularidad en proceso de definición: no se difunde.",
    description: `## Cerro La Zeta

Ascenso al cordón que se eleva por encima del área recreativa de La Zeta.
Circuito de uso local conocido, con buena traza y vistas de la ciudad desde
mayor altura que el circuito recreativo.

**Este circuito consta en el inventario pero no se difunde.** La titularidad
del suelo que atraviesa está en proceso de definición ante el organismo
competente, y el Sistema no promueve el tránsito mientras esa situación no se
resuelva. Su ficha está completa y disponible para la gestión.`,
    difficulty: "moderada",
    activity: "senderismo",
    region: "Comarca Los Alerces",
    province: "Chubut",
    durationMin: 240,
    status: "draft",
    systemState: "uso_local_no_difundible",
    soilSituation: "titularidad_en_definicion",
    altNames: "Cerro Zeta, Filo de La Zeta",
    accessDescription:
      "Continuación del camino del área recreativa de La Zeta hacia el norte, hasta el pie del cordón. Acceso registrado, no difundido.",
    compatibleUses:
      "Uso local de baja intensidad, a definir una vez resuelta la situación dominial.",
    incompatibleUses:
      "Toda promoción turística y prestación comercial, mientras la titularidad no esté definida.",
    seasonality: "De octubre a mayo. Nieve en el tramo superior en invierno.",
    risks:
      "Tramo superior con pendiente y suelo suelto. Sin agua segura en el recorrido.",
    conservationState: "Muy bueno, por el bajo nivel de uso.",
    maintainedBy: "Sin mantenimiento formal.",
    background:
      "Circuito de uso local conocido por caminantes de la ciudad, relevado e incorporado al inventario a la espera de la definición dominial del sector que atraviesa.",
    contributedBy: "Subsecretaría de Turismo de Esquel",
    reviewedBy: "Pendiente de revisión en grupo de trabajo",
    anchors: [
      { lat: -42.8760, lng: -71.3580, ele: 880 },
      { lat: -42.8705, lng: -71.3630, ele: 1010 },
      { lat: -42.8650, lng: -71.3680, ele: 1180 },
      { lat: -42.8600, lng: -71.3725, ele: 1340 },
      { lat: -42.8565, lng: -71.3760, ele: 1460 },
    ],
    pois: [
      {
        at: 0,
        type: "salida",
        name: "Pie del cordón — inicio",
        description:
          "Inicio del ascenso, en la continuación del camino del área recreativa. **Circuito registrado, no difundido:** ver el estado de la ficha.",
      },
      {
        at: 0.15,
        type: "precaucion",
        name: "Límite del área municipal",
        description:
          "A partir de este punto el circuito deja el área municipal e ingresa al sector con **titularidad en proceso de definición** ante el organismo competente.",
      },
      {
        at: 0.3,
        type: "naturaleza",
        name: "Ñirantal",
        description:
          "Sector de ñires de porte bajo, moldeados por el viento. Ambiente de transición entre la estepa y el bosque andino.",
      },
      {
        at: 0.45,
        type: "mirador",
        name: "Vista de la laguna",
        description:
          "Balcón con vista de la laguna La Zeta y del área recreativa desde arriba. Permite ver el circuito recreativo completo en perspectiva.",
      },
      {
        at: 0.6,
        type: "cruce",
        name: "Huella de ganado",
        description:
          "Cruce con una huella de ganado que puede confundirse con el sendero principal. **Seguir la traza que asciende**, no la que rodea el faldeo.",
      },
      {
        at: 0.75,
        type: "precaucion",
        name: "Pendiente con suelo suelto",
        description:
          "Tramo empinado sobre material suelto, especialmente incómodo en la bajada. Es el sector más delicado del recorrido.",
      },
      {
        at: 0.88,
        type: "interes",
        name: "Filo del cordón",
        description:
          "Salida al filo, con vista abierta hacia ambos lados del cordón. Zona ventosa.",
      },
      {
        at: 1,
        type: "llegada",
        name: "Cima del cordón",
        description:
          "Punto más alto del circuito, con vista de la ciudad, del valle y del sector de La Hoya hacia el norte.",
      },
    ],
  },
];
