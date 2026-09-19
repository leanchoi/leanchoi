/**
 * Léxico del operativo: los temas que aparecen una y otra vez en las respuestas
 * habladas de un barrio. Lo usa el proveedor stub para agrupar sin red y sin
 * claves, y lo usa el proveedor remoto como lista sugerida de temas, para que las
 * etiquetas no cambien de nombre entre una corrida y otra.
 *
 * Es editable a mano: si en Esquel aparece un tema que no está acá, se agrega.
 */
export type TemaDelLexico = {
  clusterId: string;
  etiqueta: string;
  palabras: readonly string[];
};

export const TEMAS: readonly TemaDelLexico[] = [
  {
    clusterId: 'calles',
    etiqueta: 'Calles y veredas',
    palabras: ['calle', 'calles', 'vereda', 'veredas', 'pozo', 'pozos', 'barro', 'asfalto',
      'ripio', 'zanja', 'zanjas', 'desague', 'desagüe', 'cordon', 'cordón', 'badén', 'baden'],
  },
  {
    clusterId: 'alumbrado',
    etiqueta: 'Alumbrado público',
    palabras: ['luz', 'luces', 'luminaria', 'luminarias', 'alumbrado', 'foco', 'focos',
      'oscuro', 'oscuridad', 'poste'],
  },
  {
    clusterId: 'agua',
    etiqueta: 'Agua y cloacas',
    palabras: ['agua', 'presion', 'presión', 'cloaca', 'cloacas', 'caño', 'cano', 'canilla',
      'pozo ciego', 'perdida de agua', 'pérdida de agua'],
  },
  {
    clusterId: 'basura',
    etiqueta: 'Basura y recolección',
    palabras: ['basura', 'residuos', 'recoleccion', 'recolección', 'recolector', 'contenedor',
      'contenedores', 'microbasural', 'basural'],
  },
  {
    clusterId: 'seguridad',
    etiqueta: 'Seguridad',
    palabras: ['seguridad', 'robo', 'robos', 'robaron', 'inseguridad', 'policia', 'policía',
      'patrullero', 'destrozos'],
  },
  {
    clusterId: 'salud',
    etiqueta: 'Salud',
    palabras: ['salud', 'salita', 'sala de salud', 'hospital', 'turno', 'turnos', 'medico',
      'médico', 'enfermera', 'ambulancia', 'remedios', 'medicamentos'],
  },
  {
    clusterId: 'transporte',
    etiqueta: 'Transporte',
    palabras: ['colectivo', 'colectivos', 'parada', 'recorrido', 'transporte', 'frecuencia',
      'combi', 'micro'],
  },
  {
    clusterId: 'espacios',
    etiqueta: 'Plazas y espacios comunes',
    palabras: ['plaza', 'plazas', 'juegos', 'cancha', 'polideportivo', 'espacio verde',
      'espacios verdes', 'sede', 'salon', 'salón'],
  },
  {
    clusterId: 'animales',
    etiqueta: 'Animales sueltos',
    palabras: ['perro', 'perros', 'perra', 'gato', 'gatos', 'mordio', 'mordió', 'mordieron',
      'castracion', 'castración', 'zoonosis', 'jauria', 'jauría'],
  },
  {
    clusterId: 'ninez',
    etiqueta: 'Niñez y adolescencia',
    palabras: ['chicos', 'chicas', 'niños', 'ninos', 'adolescentes', 'jardin', 'jardín',
      'escuela', 'merendero', 'copa de leche'],
  },
  {
    clusterId: 'vivienda',
    etiqueta: 'Vivienda y tierra',
    palabras: ['vivienda', 'viviendas', 'terreno', 'terrenos', 'alquiler', 'lote', 'lotes',
      'escritura', 'techo', 'hacinamiento'],
  },
  {
    clusterId: 'deportes',
    etiqueta: 'Deportes y recreación',
    palabras: ['deporte', 'deportes', 'futbol', 'fútbol', 'gimnasio', 'club', 'profe',
      'entrenamiento'],
  },
];

/** Tema de descarte: siempre existe, nunca se inventa una etiqueta para taparlo. */
export const TEMA_OTROS = { clusterId: 'otros', etiqueta: 'Otros temas' } as const;
