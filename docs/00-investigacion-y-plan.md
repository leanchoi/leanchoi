# Esquel LAB — Investigación y Plan Maestro del Sitio Web

**Documento de trabajo.** Preparado antes de escribir una sola línea de código. Objetivo: dejar ordenada la información del programa, el contexto de Esquel, y una arquitectura de sitio + backend + sistema de diseño que el equipo (y yo) pueda ejecutar sin ambigüedad. No es el sitio — es el mapa para construirlo.

Fecha de redacción: 23/07/2026 (día 1 de la convocatoria).

---

## 1. Resumen ejecutivo

El Laboratorio de Destino Esquel ("Esquel LAB") es un programa municipal (Subsecretaría de Turismo + Subsecretaría de Producción, con gobernanza mixta público-privada) que en su primera cohorte corre dos líneas paralelas:

- **ESQUEL ACELERA** — aceleración comercial de emprendimientos turísticos **urbanos** (8 semanas, 8-10 experiencias esperadas).
- **RAÍZ** — estructuración de oferta de turismo **rural** (8 semanas, 5-8 experiencias esperadas).

Ambas comparten metodología, cronograma y el marco conceptual de la **"Economía de los Recuerdos"**: cada experiencia turística debería, cuando sea viable, tener un producto físico asociado con identidad territorial que extienda el recuerdo del viaje.

El sitio que vamos a construir tiene una jerarquía de objetivos explícita (me la diste así y la respeto en el orden de prioridad de diseño, contenido y jerarquía visual):

1. **Convertir** — empresas, emprendedores y organizaciones se inscriben. El formulario es el corazón funcional del sitio.
2. **Equipar a la prensa** — un media kit que le hace fácil a un periodista escribir bien sobre esto, con foco en la gobernanza (CAMOCH + Cámara de Prestadores + FEHGRA/AEHGCLA) como garantía de transparencia.
3. **Convencer a la ciudadanía** — Esquel sí es turístico, esto no es solo para "los grandes", es un proceso continuo y este es el primer paso.

Todo el sitio corre en **PHP + HTML + MySQL sin build step**, porque así lo exige Hostinger (Git deploy directo a `public_html`, sin Node ni bundlers en shared hosting). El backend es un CRM liviano hecho a medida: lista/tarjetas de postulaciones, notas por postulación, roles de usuario, exportación CSV, y un acceso admin discreto.

---

## 2. Contexto: Esquel hoy

### 2.1 Lo que ya tiene el destino

Esquel es la puerta de entrada al **Parque Nacional Los Alerces** (263.000 ha, el cuarto parque nacional más grande de Argentina, Patrimonio de la Humanidad UNESCO desde 2017), con el alerce milenario conocido como "El Abuelo" (+2.600 años) accesible por navegación en el Lago Menéndez. A esto se suman:

- **La Trochita** (Viejo Expreso Patagónico), ícono ferroviario y ya un producto turístico consolidado.
- **La Hoya**, centro de esquí a 15 min de la ciudad — motor de la temporada invernal.
- **Trevelin**, a 25 km, con su herencia galesa.
- Paisaje cordillerano, valles, ríos, lagos — base para trekking, kayak, cabalgatas.
- Conectividad aérea en expansión (vuelos a Buenos Aires, gestiones por Córdoba) e integración turística binacional con Chile en curso durante 2026.
- Eventos de estacionalidad activa: Expo Invierno 2026 (16-19 julio), como ejemplo de que el municipio ya mueve agenda de promoción.

**Conclusión para el copy del sitio:** Esquel no necesita que le inventen atractivos — necesita que su oferta *actual y dispersa* (talleres, casas de té, changos con saberes, productores rurales) se convierta en **producto vendible**. Ese es exactamente el ángulo de "Esquel sí es turístico": no falta destino, falta estructura comercial. Este dato de investigación valida 1:1 la justificación que ya trae el documento del programa — lo vamos a usar tal cual, con evidencia.

### 2.2 El terreno institucional (importa para el media kit y la sección de gobernanza)

- **CAMOCH** (Cámara de Comercio, Industria, Producción y Turismo del Oeste de Chubut), fundada en 1961, con renovación de conducción en marzo 2026 — activa y con peso gremial real.
- **FEHGRA Filial Esquel / AEHGCLA** (hotelero-gastronómica).
- **Cámara de Prestadores Turísticos de Esquel**.
- El municipio ya viene de instalar, en los últimos dos años, un ecosistema normativo con el que Esquel LAB debe *engancharse visiblemente* en el sitio:
  - **Sello "Hecho en Esquel"** (ordenanza reciente, categorías: alimentos/bebidas artesanales, lana, madera, platería, vidrio, cerámica) — administrado por la Dirección de Desarrollo Productivo y Emprendedurismo, con la figura de "Entidad Tutora". Esto es el enganche institucional perfecto para el "producto físico asociado" de la Economía de los Recuerdos.
  - **Régimen de Promoción de Inversiones Turísticas** — vigente, con beneficios impositivos y de empleo, y ya con casos concretos (p. ej. Hotel Carao, +100 empleos). **Este es exactamente el régimen que genera la percepción que me describiste: "los beneficios son para los grandes."** Es un dato real, no una sensación infundada — el régimen efectivamente beneficia inversión de capital. Esquel LAB necesita, en la sección de ciudadanía, diferenciarse explícitamente de ese régimen sin atacarlo: mientras el Régimen de Inversión mueve capital grande, LAB pone equipo técnico gratuito al servicio de quien ya está laburando con lo que tiene. Es el "para vos que no tenés para invertir pero tenés algo para mostrar."

### 2.3 El precedente directo: El Bolsón Acelera

Confirmé la referencia: **El Bolsón Acelera** (liderado por Leandro Choi con Co-LABtur) fue una estrategia de turismo que priorizó a los vecinos frente a las grandes empresas externas, puso en valor actividades y saberes invisibilizados de la comunidad, y los transformó en experiencias turísticas inmersivas, auténticas y participativas — en año redondo, no solo temporada alta.

Esto es oro para el sitio: no es un concepto teórico, **ya se hizo y funcionó** en un destino patagónico comparable. En la sección de ciudadanía y en el media kit conviene mencionar (sin sobre-venderlo) que la metodología tiene precedente regional probado — refuerza credibilidad sin necesitar todavía "resultados de Esquel" propios.

### 2.4 Fechas — reconciliación necesaria

El documento del programa (v3, julio 2026) trae un cronograma tentativo algo más flexible ("inicio de talleres: 1 de agosto", "cierre: última semana de septiembre"). Tus instrucciones más recientes son más precisas y son las que uso como fuente de verdad para el sitio:

| Hito | Fecha |
|---|---|
| Apertura de convocatoria y evaluación | **23 de julio de 2026** (hoy) |
| Cierre de postulaciones | **9 de agosto de 2026** |
| Comunicación a seleccionados | inmediatamente después del cierre |
| Inicio de trabajo técnico (ambas líneas) | **10 de agosto de 2026** |
| Cierre y lanzamiento de resultados | **2 de octubre de 2026** |

Eso da ~8 semanas de trabajo técnico (10 ago → 2 oct), que **calza con las "8 semanas de trabajo intensivo" del documento**. La estructura interna de fases del PDF (semana 1-2 selección, semana 3 diagnóstico, semanas 4-7 sprint, semana 8 cierre) la voy a re-mapear silenciosamente sobre esta ventana para uso interno del equipo técnico, pero **el sitio público solo necesita comunicar las 3 fechas de arriba** — no hace falta exponer el desglose semanal al público, es ruido para el postulante.

**Punto a confirmar con vos antes de programar el countdown:** ¿confirmás que el sitio debe mostrar el 9 de agosto como *hard deadline* del formulario (se cierra el envío ese día) o preferís dejarlo "orientativo" por si llegan postulaciones tarde? Esto cambia si el formulario se autobloquea a las 23:59 del 9/8 o si simplemente deja de destacarse la urgencia. Mi recomendación (ver §5) es autobloqueo real — la escasez que no se cumple deja de ser escasez.

---

## 3. Los dos programas — tabla de referencia rápida

| | **ESQUEL ACELERA** | **RAÍZ** |
|---|---|---|
| Foco | Emprendedores urbanos, organizaciones, empresas de servicios turísticos | Productores y prestadores rurales |
| Perfil | Servicios en marcha o saberes no-turísticos convertibles en experiencia urbana | Chacras, estancias, viñedos, crianceros, textiles de lana, dulces/fruta fina |
| Resultado esperado | 8 a 10 experiencias urbanas listas para vender | 5 a 8 experiencias rurales listas para vender |
| Producto físico asociado | Evaluado caso a caso, no obligatorio | Vínculo directo (lana, dulces, bebidas artesanales) — casi siempre aplica |
| Sello vinculado | "Hecho en Esquel" | "Hecho en Esquel" + posible nexo con "Origen Chubut" (provincial) |
| Duración | 8 semanas | 8 semanas |

**Criterios de ponderación (5 dimensiones, aplican a ambos programas, con matices):**

1. Diferenciación y diversificación (innovación, autenticidad, propuesta única).
2. Impacto en la matriz turística (integración a la oferta general, derrame económico).
3. **Perfil y motivación del emprendedor** — actitud, compromiso, viabilidad de dedicación horaria, ganas. *(Vos lo remarcaste como uno de los criterios más importantes — lo vamos a tratar como tal en el diseño del formulario, no como un campo más).*
4. Viabilidad del producto físico asociado (Economía de los Recuerdos).
5. Viabilidad operativa mínima (poca necesidad de inversión inicial para arrancar).

Esta lista de 5 criterios **es el esqueleto del formulario**. Ver §6.

---

## 4. Arquitectura de información del sitio

```
/  (Home)
├── /postulacion          → Formulario multi-etapa (página propia, distinta del home)
│     └── /postulacion/gracias   → Confirmación post-envío
├── /medios                → Media kit interactivo para prensa
├── /esquel-es-turistico    → Sección ciudadanía (nombre de ruta tentativo)
├── /admin                 → CRM (protegido, candado discreto en el footer del home)
│     ├── /admin/login
│     ├── /admin/postulaciones        → vista lista + vista tarjetas
│     ├── /admin/postulaciones/{id}   → detalle, notas, cambio de estado
│     ├── /admin/usuarios             → gestión de usuarios (solo admin)
│     └── /admin/exportar             → descarga CSV
└── /legales (opcional)    → bases y condiciones, tratamiento de datos
```

**Por qué separar `/postulacion` del home:** me lo pediste explícito y coincide con buena práctica — el home vende la idea con storytelling y ritmo; el formulario necesita foco absoluto, sin distracciones, sin navegación que compita con completarlo. Es un patrón estándar en landing pages de conversión (separar "persuasión" de "conversión" en superficies distintas).

### 4.1 Estructura del Home (orden de secciones)

El home tiene que hacer tres trabajos en cascada — convertir primero, pero sin ignorar a quien llegó por curiosidad ciudadana o por interés de prensa. Orden propuesto:

1. **Hero** — Esquel LAB como marca paraguas. Titular que ataca directo el mito ("Esquel es turístico. Y esto lo prueba."), CTA primario a `/postulacion`, fecha límite visible pero no gritada.
2. **El problema, en una frase** — "Sobran ideas, saberes y lugares. Falta que se conviertan en algo que se pueda vender." (la justificación del programa, resumida a lenguaje humano).
3. **Elegí tu camino** — dos tarjetas grandes, ACELERA vs RAÍZ, con perfil destinatario claro, para que el visitante se autoclasifique antes de llegar al formulario (reduce fricción y abandono en el paso de selección de programa).
4. **Cómo es el acompañamiento** — 4 fases resumidas en lenguaje llano (convocatoria → diagnóstico en el lugar → sprint de trabajo conjunto → presentación pública), con foco en "hacemos con vos, no te decimos qué hacer".
5. **El compromiso mutuo** — bloque honesto: qué pone el programa (equipo técnico, mentoría 1:1, talleres, materiales) y qué se pide (mínimo 12 hs semanales, 8 semanas). Esto filtra postulantes de baja intención antes de que lleguen al formulario — ahorra trabajo de evaluación.
6. **Escasez, con clase** (ver §5) — cupos totales de la cohorte, countdown a 9 de agosto, "primera cohorte" enmarcado como algo especial, no como urgencia barata.
7. **La puerta abierta** — un bloque corto, casi al pasar, sobre que esto es el inicio de un proceso continuo y que de esta cohorte saldrán nuevos clusters para programas futuros. Evita que quien no llegue a tiempo o no califique sienta que se cerró la única oportunidad.
8. **Gobernanza en una línea** — mención breve de CAMOCH / Cámara de Prestadores / FEHGRA-AEHGCLA con link a `/medios` para quien quiera el detalle (así el home no se satura con contenido institucional que es prioridad 2, no 1).
9. **Para la ciudadanía** — bloque de enlace a `/esquel-es-turistico`, con una foto/story potente, sin competir con el CTA principal.
10. **Footer** — logos institucionales, contacto, y el candado de acceso admin (discreto, ícono pequeño, sin texto "admin" visible — ver §8.4).

### 4.2 Nota sobre nombres de programa vs. nombre de marca

"Esquel LAB" es el paraguas (Laboratorio de Destino), "Esquel Acelera" y "Raíz" son las dos líneas. El logo que me pasaste ya resuelve esta jerarquía visualmente (montaña + wordmark ESQUEL en gris + nombre del programa en magenta debajo). Vamos a respetar esa jerarquía en todo el sitio: el header del sitio usa el lockup "Esquel LAB", y cada sección/página que hable de un programa específico adopta su acento de color correspondiente.

---

## 5. Escasez artificial — cómo la vamos a jugar (con cuidado)

Me pediste explícitamente "mucha delicadeza" acá. Reglas que voy a aplicar, basadas en psicología de la persuasión pero puestas al servicio de la honestidad (todo lo que se comunica como escaso, en este programa, **es objetivamente escaso** — no es escasez fabricada, es escasez real bien comunicada):

- **Escasez de cupo, no de tiempo artificial.** El número real es 8-10 (Acelera) y 5-8 (Raíz). Lo mostramos tal cual, sin inflar. "Cupos limitados por evaluación técnica" en vez de "¡Solo quedan 3 lugares!" — porque además la selección es por mérito, no por orden de llegada, así que un contador de "lugares restantes" sería directamente falso y legalmente incómodo para un organismo público.
- **Escasez de tiempo real.** El countdown al 9 de agosto sí es honesto — es una fecha de cierre real. Un countdown visual (días/horas) en el hero y en `/postulacion` es la palanca de urgencia más limpia disponible acá.
- **Escasez de acceso, no de oportunidad.** El mensaje no es "esta es tu única chance" (eso genera rechazo y es falso, según tus propias palabras) sino "esta cohorte es la primera y tiene lugar para pocos — habrá más adelante, pero *esta* tiene fecha y forma ahora." Esto separa "urgencia para actuar hoy" de "esto no va a repetirse", que es exactamente la distinción que pediste.
- **Prueba social sutil, no numérica.** Como todavía no hay egresados de Esquel LAB, la prueba social viene de la gobernanza (instituciones serias avalando el proceso) y del precedente de El Bolsón Acelera — no de testimonios inventados.
- **El formulario mismo comunica exclusividad por su exigencia.** Un formulario largo, que pide reflexión real, ya filtra y comunica "esto es en serio" sin necesitar banners de urgencia adicionales. Ver §6.

---

## 6. El formulario — diseño por etapas

### 6.1 Principio rector

Vos mismo marcaste el objetivo: el formulario tiene que **evaluar**, pero también **hacer que la persona se explaye**, y tiene que dejar claro que completarlo a conciencia mejora sus chances. Así que el formulario cumple doble función: instrumento de selección + primer filtro de compromiso. Diseño la estructura para que cada etapa mapee 1:1 a uno de los 5 criterios de ponderación oficiales del programa (§3), de forma que el Cuadro Técnico pueda evaluar sin tener que re-interpretar respuestas sueltas.

### 6.2 Estructura de etapas (multi-step, con barra de progreso y guardado de borrador)

| Paso | Contenido | Mapea a criterio |
|---|---|---|
| **0. Bienvenida** | Qué es Esquel LAB en 3 líneas, qué se pide (mín. 12 hs/semana, 8 semanas), fechas clave, qué van a necesitar a mano antes de arrancar (fotos, precios de referencia, redes). Mensaje explícito: "cuanto más completes esto, mejor te podemos evaluar." | — |
| **1. Elegí tu camino** | ACELERA o RAÍZ — tarjetas con descripción, la elección determina las preguntas condicionales siguientes | — |
| **2. Quién sos** | Datos de contacto, tipo de figura (persona física / organización / empresa), rubro, años operando, redes/canales existentes, ubicación | Base para todos |
| **3a. Tu propuesta urbana** *(si Acelera)* | Servicio actual, qué lo hace único, a quién le vendés hoy | Diferenciación |
| **3b. Tu establecimiento rural** *(si Raíz)* | Tipo de producción, acceso al predio, qué se puede mostrar/visitar hoy | Diferenciación |
| **4. Qué te hace distinto** | Campo abierto extenso, con guía ("contanos la historia, no solo el dato") | Diferenciación y diversificación |
| **5. Cómo encaja en Esquel** | Con qué otros actores/lugares se conecta tu propuesta, a quién le serviría integrarte (operadores, otros prestadores) | Impacto en la matriz turística |
| **6. Un objeto que cuente tu historia** | Explicación breve de la Economía de los Recuerdos + pregunta sobre si hay (o podría haber) un producto físico asociado | Viabilidad de producto físico |
| **7. Con qué contás hoy** | Recursos actuales (espacio, equipo, capital de trabajo), qué te falta para arrancar sin gran inversión | Viabilidad operativa mínima |
| **8. Por qué vos** | El corazón del formulario. Motivación, compromiso de horas, quién de tu equipo participaría, qué esperás lograr en 8 semanas. Checkbox explícito de compromiso horario (12 hs/sem mínimo) | Perfil y motivación — el criterio que remarcaste como clave |
| **9. Material de apoyo (opcional)** | Link a fotos/redes/Drive — sin exigir upload de archivos pesados en el paso 1 del sitio | — |
| **10. Revisión y envío** | Resumen editable, aceptación de bases, confirmación | — |

### 6.3 Reglas de UX del formulario

- **Guardado de progreso** vía `localStorage` (sin necesitar cuenta de usuario) — puede cerrar la pestaña y retomar.
- **Copy de acompañamiento en cada paso**, no solo el label del campo — recordá el pedido: "coadyuvar a que se explayen." Cada campo abierto largo lleva 1-2 líneas de ejemplo/guía, no un placeholder genérico.
- **Nada de scroll infinito de un formulario largo en una sola página** — un paso, una decisión cognitiva a la vez. Reduce abandono.
- **Validación amable, no punitiva** — errores explicados, nunca solo el borde rojo.
- **Al enviar:** confirmación con próximos pasos claros ("te contactamos antes del [fecha de comunicación] si fuiste preseleccionado").
- **Accesible:** teclado completo, foco visible, contraste AA — el público incluye gente que puede no ser nativa digital (productores rurales, artesanos mayores).

### 6.4 Qué pasa del lado del CRM

Cada envío crea una `postulacion` con: programa elegido, todas las respuestas (estructuradas por paso, no como blob), estado inicial `nueva`, timestamp. El equipo técnico la trabaja desde `/admin`.

---

## 7. Backend / CRM — especificación funcional

### 7.1 Modelo de datos (conceptual, se traduce a MySQL en el build)

- **`postulaciones`** — id, programa (`acelera`/`raiz`), estado (`nueva` → `en_revision` → `preseleccionada` → `entrevista` → `aprobada`/`rechazada`/`lista_espera`), datos del formulario (columnas estructuradas por paso + JSON de respaldo), puntaje interno opcional, timestamps.
- **`notas`** — id, postulacion_id, usuario_id, texto, timestamp. Una postulación puede tener múltiples notas (bitácora del equipo), tal como pediste.
- **`usuarios`** — id, nombre, email, password_hash, rol (`admin` / `editor` / `viewer`), activo, timestamps.
- **`historial_estado`** — opcional, para trazabilidad de quién cambió qué estado y cuándo (buena práctica para un proceso de evaluación que se presume transparente ante el Cuadro Técnico).

### 7.2 Vistas del panel

- **Vista Lista** — tabla filtrable por programa, estado, fecha; búsqueda por nombre/rubro; orденable.
- **Vista Tarjetas** — grid tipo kanban, agrupable por estado, con resumen visual (nombre, programa, rubro, fecha) y botón **"Tomar acción"** que abre un panel lateral con: cambio de estado, historial de notas, textbox para nota nueva, respuestas completas del formulario.
- **Exportar** — botón de descarga en CSV (abre nativo en Excel/Sheets; es la opción técnicamente sólida y sin dependencias — no vamos a generar un `.xls` binario real porque agrega una librería innecesaria para shared hosting cuando CSV cumple el mismo propósito práctico). Respeta los filtros activos.
- **Roles:**
  - `admin` — todo, incluida gestión de usuarios y reseteo de contraseñas ajenas.
  - `editor` — ve, cambia estados, agrega notas, exporta. No gestiona usuarios.
  - `viewer` — solo lectura + exportar.
- **Candado de acceso** — ícono discreto en el footer del home (sin la palabra "admin" visible), lleva a `/admin/login`. Usuario semilla: `admin` / `admin123`, con **cambio de contraseña obligatorio en el primer ingreso** (esto lo agrego por responsabilidad profesional — la credencial que pediste queda como semilla inicial, pero un backend público con credencial default sin forzar cambio es una puerta abierta real; el forzado de cambio no te quita nada del flujo que pediste, solo lo asegura).

### 7.3 Seguridad (no negociable, aunque no me lo hayas pedido explícito)

- Contraseñas con `password_hash`/`password_verify`, nunca texto plano.
- Consultas parametrizadas (PDO) — cero concatenación de SQL.
- Tokens CSRF en formularios de admin y en el formulario público.
- Sesiones PHP nativas, cookie `HttpOnly` + `Secure`.
- Rate-limit simple de intentos de login (bloqueo temporal tras N intentos fallidos).
- Sanitización de salida (evitar XSS al mostrar respuestas de postulantes en el panel).

---

## 8. Media Kit (`/medios`)

Pensado para que un periodista entienda y escriba en minutos, sin llamarnos "gacetillas" (uso términos como **"Notas listas para publicar"** y **"Kit de prensa"**).

**Estructura:**

1. **Qué es Esquel LAB, en 100 palabras** — párrafo tipo boilerplate, copiable.
2. **Los números clave** — 2 programas, 8 semanas, 13-18 experiencias esperadas en total, fechas.
3. **El corazón de la nota: la gobernanza** — explicación clara de cómo se garantiza un proceso equitativo y transparente: el Cuadro Técnico (CAMOCH + Cámara de Prestadores + FEHGRA/AEHGCLA) co-diseña los criterios y participa de la selección junto al equipo técnico municipal. Esto es lo que un periodista necesita para escribir con seriedad institucional, y es el mensaje que vos marcaste como foco de esta sección.
4. **Comparativa Acelera vs Raíz** — la tabla de §3, lista para insertar en una nota.
5. **3-4 "ángulos de nota" sugeridos** — ej. "Los saberes invisibles de Esquel", "Cómo se financia sin ser el régimen de grandes inversiones", "El objeto que te llevás de recuerdo" — ideas ya masticadas para bajar la fricción de escribir.
6. **Banco de imágenes y logos** — descarga de logos (variantes color/blanco), fotos institucionales cuando estén disponibles.
7. **Preguntas frecuentes para prensa** — incluye explícitamente la pregunta incómoda ("¿esto es solo para los que ya tienen plata?") con la respuesta ya elaborada.
8. **Contacto de prensa** — referente y vía de contacto directa.

---

## 9. Sección ciudadanía (`/esquel-es-turistico`)

Tono: cercano, nunca defensivo. Objetivo real: instalar que (a) Esquel tiene mucho para ofrecer que hoy no se ve, (b) este programa es la forma en que el municipio acompaña a la gente común — no solo a quien invierte fuerte — y (c) esto recién empieza.

**Bloques:**

1. **"¿Esquel no es turístico? Mirá de nuevo."** — reencuadre directo del mito, con ejemplos concretos de saberes/lugares locales que hoy no están estructurados como experiencia (sin nombrar postulantes reales todavía, ya que la cohorte no arrancó).
2. **Historias, no discursos** — espacio reservado para 3-4 historias de "personas haciendo" (requiere fotografía real — ver §11.2). Si no hay material propio todavía para el lanzamiento, este bloque arranca con formato "casos inspiradores tipo El Bolsón Acelera" y se reemplaza por historias propias de Esquel apenas la cohorte tenga avances.
3. **El acompañamiento, explicado sin tecnicismos** — mismo contenido de fases del home pero en tono más conversacional, reforzando "el equipo va a tu lugar, trabaja con vos, no te larga con una guía en PDF."
4. **La aclaración honesta sobre el régimen de inversión** — un párrafo corto que, sin nombrar el Régimen de Promoción de Inversiones Turísticas de forma confrontativa, deja claro que Esquel LAB es la puerta para quien no está pensando en una inversión grande sino en poner en valor lo que ya tiene. Este es el párrafo que responde directamente a la percepción de exclusión que me describiste.
5. **"Esto es el principio"** — mensaje de proceso continuo: se prioriza a quienes hoy pueden dedicarle tiempo y mostrar el camino, y de ahí saldrán nuevos clusters para programas futuros. Mismo mensaje que en el home, desarrollado con más calidez acá.
6. **CTA suave** — no es la página de conversión principal, así que el CTA a `/postulacion` está presente pero no compite en agresividad visual con el del home.

---

## 10. Sistema de diseño

### 10.1 Marca — lo que ya tenemos

Tu logo resuelve el sistema con claridad: montaña poligonal (motivo geométrico, fracturado en facetas — como una gema o un mapa topográfico estilizado) en 3 variantes de "textura interna" (sólida fracturada para el master/Municipio, con "raíces" ramificadas para RAÍZ, con nodos conectados tipo red para LAB), wordmark "ESQUEL" en gris oscuro editorial, y el nombre del programa en magenta/vino como acento de marca. Esto ya me da:

- **Color primario oscuro** (mountain): gris carbón, aprox. `#4A4A4A` — a extraer con precisión del archivo real en el build.
- **Color de acento** (magenta/vino Acelera-Raíz-LAB): aprox. `#9C2F5E` — mismo criterio, a confirmar con el archivo fuente.
- **Rosa del isotipo municipal** (flor de 5 pétalos del escudo de Esquel): `#EE5884` — este sí lo extraje con precisión del logo oficial embebido en tu documento.
- Un tercer tono neutro cálido para fondos (no blanco puro — para evitar el "look" plano de IA que las skills de diseño instaladas explícitamente marcan como error común).

**Acción pendiente de tu lado:** las 3 imágenes de logo que me mostraste en el chat (Acelera, Raíz, LAB) llegaron como contenido visual del mensaje, no como archivos — para extraer sus colores exactos y usarlos en producción, necesito que subas esos PNG (idealmente con fondo transparente, y si tenés una variante en blanco/monocromo, mejor) a la carpeta `/assets/brand-source` del repo, o me los reenvíes como adjunto. Ya dejé la carpeta creada con el logo del Municipio (extraído de tu docx) como punto de partida.

### 10.2 Tipografía y tono visual

Recomiendo (a definir en el build con la skill `impeccable document`/`init`):

- Un **display serif o slab con carácter editorial** para titulares grandes del home y de la sección ciudadanía (transmite institución + calidez, evita el "SaaS genérico").
- Una **sans geométrica limpia** para cuerpo de texto y UI del formulario/CRM (legibilidad ante todo — parte del público completa el formulario desde el celular en el campo).
- Nada de gradientes tipo "IA violeta", nada de Inter a secas — instrucción explícita de varias de las skills instaladas y buen criterio propio.

### 10.3 Registro por superficie (importante, para no aplicar el mismo "volumen" de diseño en todos lados)

| Superficie | Registro | Qué prioriza |
|---|---|---|
| Home, `/esquel-es-turistico` | **Persuade / Experience** | Storytelling, imagen, ritmo, emoción — acá "vuela pelucas" |
| `/postulacion` | **Operate** (dentro de un envoltorio Persuade) | Claridad, foco, cero fricción — la belleza no puede restar velocidad de completado |
| `/medios` | **Read** | Escaneable, estructura clara, todo copiable/descargable |
| `/admin` | **Operate puro** | Densidad de información, escaneabilidad, cero decoración — un dashboard de trabajo real |

Esta distinción evita el error más común de un sitio "bonito pero inútil": tratar el CRM como si fuera el hero del home.

---

## 11. Plan de imágenes — qué generamos y qué necesita venir de vos

Pediste explícitamente no escatimar en imágenes y usar referencias reales de Esquel (paisajes, recursos, emprendedores haciendo). Para hacerlo bien y sin fabricar contenido engañoso, separo dos categorías:

### 11.1 Lo que puedo originar yo (ilustración, no fotografía)

Usando las skills `canvas-design` (arte original en PNG/PDF) y `brandkit` (sistemas de identidad), puedo generar **ilustraciones vectoriales originales** que extienden el lenguaje visual del logo:

- Line-art de la silueta de montañas (Cordillera/Los Alerces) en el estilo poligonal fracturado del isotipo.
- Patrones decorativos inspirados en las 3 texturas del logo (fracturas, raíces, red de nodos) para fondos de sección.
- Iconografía custom para las fases del programa, los criterios de evaluación, y el ícono del "objeto-recuerdo" (Economía de los Recuerdos).
- Un sello/badge gráfico para la mención de "Hecho en Esquel" dentro del sitio (sin inventar el sello oficial — un badge propio de Esquel LAB que lo referencia).

Esto es honesto: es diseño original de marca, no pretende ser una foto de algo que no existe.

### 11.2 Lo que necesita ser real (fotografía)

**No voy a generar fotos "de Esquel" ni "de emprendedores" sintéticas presentándolas como reales** — sería exactamente el tipo de contenido engañoso que este rol tiene que evitar, y además le haría un flaco favor a un sitio institucional que necesita credibilidad ante prensa y ciudadanía. En su lugar, el plan es:

- Dejar **slots de imagen bien diseñados** (proporciones, tratamiento de color consistente con la marca) listos para recibir fotografía real.
- Usar como fuente el banco de fotos institucional que el municipio ya tiene activo en redes (`@turismoesquelok`, Facebook Turismo Esquel) — vos como referente del programa tenés acceso natural a pedir esas imáges o las que ya tenga Turismo/Producción.
- Si para el lanzamiento no hay fotos propias todavía de "emprendedores haciendo", el home puede abrir con **fotografía de paisaje/recurso de Esquel** (más fácil de conseguir con licencia clara desde el propio municipio) y reservar los retratos de personas para cuando la cohorte ya esté en marcha (semana 2-3, con el diagnóstico en territorio) — momento en que además esas fotos son mucho más potentes narrativamente (mostrar gente real de la cohorte 01, no stock).
- Marco explícito en el build: cada imagen placeholder queda comentada en el código como `<!-- FOTO REAL PENDIENTE: [descripción] -->` para que sea trivial de reemplazar cuando llegue el material.

---

## 12. Stack técnico

### 12.1 Decisión de stack (y por qué)

Hostinger, en un slot de hosting compartido con sitio "PHP/HTML personalizado", conecta por Git (OAuth a GitHub, sin necesidad de SSH keys) y despliega el contenido del repo directo a `public_html`, con auto-deploy por webhook en cada push. **No corre Node, no hay build step, no hay SSR.** Esto define el stack:

- **PHP puro (con PDO)** para todo el backend: formulario → inserción en MySQL, panel de admin, autenticación por sesión.
- **HTML + CSS + JavaScript vanilla** (o un microframework liviano vía CDN si el formulario multi-step lo justifica) para el frontend — nada que requiera compilación.
- **MySQL** (Hostinger provee bases MySQL administrables desde hPanel/phpMyAdmin) como base de datos — es lo estándar y soportado, mejor opción que SQLite en un hosting compartido con múltiples procesos PHP concurrentes.
- Estructura de repo que **es** literalmente `public_html` (o se configura como el root de deploy en Hostinger), sin carpetas de "build" intermedias.

### 12.2 Estructura de carpetas propuesta (para el build, no implementada aún)

```
/
├── index.php                 → Home
├── postulacion/
│   ├── index.php             → Formulario (SPA-like con JS, o multi-página PHP)
│   └── gracias.php
├── medios/
│   └── index.php
├── esquel-es-turistico/
│   └── index.php
├── admin/
│   ├── login.php
│   ├── index.php              → Dashboard/lista
│   ├── tarjetas.php
│   ├── postulacion.php        → Detalle + notas
│   ├── usuarios.php
│   ├── exportar.php
│   └── logout.php
├── includes/                  → Conexión DB, helpers, autenticación, partials (header/footer)
├── assets/
│   ├── css/
│   ├── js/
│   ├── img/
│   └── brand-source/          → ya iniciado, logos fuente
├── sql/
│   ├── schema.sql
│   └── seed.sql                → usuario admin semilla
└── docs/
    └── 00-investigacion-y-plan.md   → este documento
```

### 12.3 Sobre "descargar tipo xls"

Voy a implementar **exportación CSV** (se abre nativo en Excel/Sheets, es lo que la gente quiere decir cuando pide "bajar un excel") en vez de generar un `.xls`/`.xlsx` binario real, que requeriría una librería adicional sin beneficio práctico en un hosting compartido sin Composer garantizado. Si en algún momento se necesita el formato `.xlsx` real (por ejemplo para un formato con múltiples hojas o formato condicional), lo evaluamos puntualmente — no lo bloquea nada de lo demás.

---

## 13. Skills instaladas — cómo las vamos a usar (pipeline de trabajo)

Instalé lo que pediste (`emilkowalski/skills`, `Leonxlnx/taste-skill`, `impeccable`) más lo que ya traía este entorno. Total disponible: 20 skills de diseño/frontend + `impeccable` (comandos: `shape`, `craft`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `animate`, `colorize`, `extract`, `document`, `init`, `live`, entre otros) + `canvas-design` (arte original) del catálogo de Anthropic.

No las voy a usar todas a la vez ni de forma pareja — cada una entra en el momento del proceso donde agrega algo que las demás no dan. Así organizo el pipeline para el build (próxima etapa, cuando me digas que avancemos):

| Etapa | Skill(s) | Qué produce |
|---|---|---|
| **1. Fundamento de marca y contenido** | `impeccable init` / `impeccable document` | `PRODUCT.md` y `DESIGN.md` con los tokens reales (color, tipografía, tono) una vez confirmados los logos fuente — contexto durable que el resto de las skills va a leer automáticamente |
| **2. Sistema de marca** | `brandkit` | Formaliza el sistema de las 3 variantes del logo (fracturas/raíces/red), deriva versiones mono/blanco livianas para web |
| **3. Assets originales** | `canvas-design` | Ilustraciones vectoriales propias (montañas, patrones, iconografía) — ver §11.1 |
| **4. Dirección visual antes de codear** | `imagegen-frontend-web` | Un board de referencia por sección (hero, elegí tu camino, formulario, media kit, ciudadanía) — acordamos el rumbo visual mirando imágenes antes de escribir CSS, así evitamos iterar a ciegas |
| **5. Planificación UX** | `impeccable shape` | Plan de interacción del formulario multi-step y del panel admin antes de tocar código — decisiones de flujo, no de estética |
| **6. Construcción — superficies de persuasión** (home, ciudadanía) | `design-taste-frontend` (director principal de dirección/tono) + `high-end-visual-design` (barra de calidad en spacing/sombras/estructura) + `apple-design` (motion físico, transiciones con sentido) | Home y sección ciudadanía con el nivel de producción que pediste |
| **7. Construcción — formulario** | `apple-design` + `emil-design-eng` (foco en el detalle invisible: estados de foco, feedback, timing) | La superficie de más alto riesgo de abandono recibe el cuidado más fino de microinteracción |
| **8. Construcción — CRM/admin** | Registro *Operate* de `impeccable` + `pick-ui-library` (solo si hace falta una librería puntual de tabla/orden — decisión caso a caso, priorizando vanilla por compatibilidad con hosting compartido) | Panel funcional, escaneable, sin decoración innecesaria |
| **9. Motion, con criterio** | `find-animation-opportunities` (dónde vale la pena animar) → implementación → `animation-vocabulary` (para que hablemos con nombres precisos de efectos) → `review-animations`/`improve-animations` (auditoría final) | Movimiento que suma, no relleno |
| **10. QA de diseño** | `impeccable critique` (heurística UX) + `impeccable audit` (a11y/performance/responsive) + `redesign-existing-projects` (checklist de anti-patrones IA como segunda opinión) | Lista de hallazgos antes de dar por cerrado |
| **11. Pulido final** | `impeccable polish` | Pase final pre-entrega |
| **12. Integridad de entrega** | `full-output-enforcement` | Garantiza que cada archivo PHP/CSS/JS se entregue completo, sin placeholders ni truncamientos, en un build multi-archivo largo |

**Skills que decido NO usar como base, y por qué (para que quede razonado, no solo omitido):**

- `industrial-brutalist-ui` y `gpt-taste` (motion máximo/chaos) — tono equivocado para un sitio municipal que necesita transmitir confianza a productores rurales y periodistas, no un "vibe" de agencia creativa. Quedan disponibles como opción si en algún momento pedís un giro más audaz puntual (ej. una landing de evento de cierre en octubre, ahí sí podrían brillar).
- `minimalist-ui` — sí la voy a tener presente como piso de restricción (evitar exceso), pero no como única dirección: el pedido de "que vuele pelucas" con fotografía real e ilustración propia pide más calidez y textura que el minimalismo estricto ofrece por defecto.
- `stitch-design-taste` — está pensada para el flujo de Google Stitch específicamente; no aplica a este stack PHP/vanilla.
- `image-to-code` — es para el flujo inverso (partir de una imagen y clonarla en código); no es nuestro caso, partimos de marca + contenido, no de un mock ya cerrado.

Este documento (`docs/00-investigacion-y-plan.md`) queda commiteado como la fuente de verdad que el resto de las skills — sobre todo `impeccable` vía `PRODUCT.md`/`DESIGN.md` — va a poder leer y honrar en cada paso siguiente.

---

## 14. Roadmap de implementación (próxima etapa, aún no iniciada)

1. Confirmar con vos los puntos abiertos del §15.
2. Recibir/subir los archivos de logo fuente (Acelera, Raíz, LAB) en alta resolución.
3. `impeccable init` + `impeccable document` → fijar tokens de marca.
4. Levantar estructura de carpetas, schema SQL, autenticación admin.
5. Construir `/postulacion` primero (es la prioridad #1 explícita) — de punta a punta, incluyendo su llegada al CRM.
6. Construir Home.
7. Construir `/medios` y `/esquel-es-turistico`.
8. Construir panel `/admin` completo (lista, tarjetas, notas, export, usuarios).
9. Pase de QA (`impeccable audit`/`critique`), responsive, accesibilidad, performance en hosting compartido.
10. Documentar el proceso de deploy en Hostinger (paso a paso para que lo conectes vos desde hPanel).

---

## 15. Preguntas abiertas para vos

1. **Countdown al 9/8:** ¿autobloqueo real del formulario a esa fecha, o cierre "blando" con la posibilidad de seguir recibiendo tarde? (recomiendo autobloqueo, ver §2.4).
2. **Logos fuente:** necesito los PNG/SVG de Acelera, Raíz y LAB en alta resolución (idealmente con variantes en blanco) — ¿los subís al repo o me los reenviás como archivo?
3. **Fotografía:** ¿tenés ya acceso a un banco de fotos del municipio (Turismo/Producción) que pueda usarse para el lanzamiento, o arrancamos con paisaje/recurso genérico de Esquel hasta tener fotos propias de la cohorte 01?
4. **Dominio/subdominio:** ¿en qué URL va a vivir esto dentro de tu cuenta de Hostinger? (afecta rutas absolutas y configuración de deploy).
5. **Datos sensibles del formulario:** ¿el programa necesita pedir CUIT/DNI, o alcanza con datos de contacto + rubro? Define si el CRM necesita un nivel de protección de datos personales más estricto.
6. **Nombre de ruta de la sección ciudadana:** propuse `/esquel-es-turistico` — ¿te gusta o preferís otro (`/comunidad`, `/vecinos`, etc.)?
7. **Usuarios adicionales del CRM:** ¿ya sabés qué personas del Cuadro Técnico van a necesitar accesos `editor`/`viewer` desde el día 1, para dejarlos precargados?

---

*Fin del documento de investigación y plan. Con tu OK sobre los puntos del §15 (o indicación de avanzar igual con los criterios por defecto que propuse), arranco la construcción siguiendo el roadmap del §14.*
