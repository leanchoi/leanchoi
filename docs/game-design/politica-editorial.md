# Política editorial — sátira política en Esquel 2027

> **Estado:** PROMPT 0 · versión 1.0.0 · **vinculante**
> Aplica a facciones, cartas de debate, misiones, NPCs, diálogos y cualquier texto
> visible en el juego.

Esquel 2027 se ríe de la política, no de las personas. La diferencia es operativa,
no filosófica, y define qué contenido entra y qué contenido no.

## 1. Qué sí

- **Prácticas**: el afiche pegado de madrugada, la promesa de asfalto, el pase a
  planta de diciembre, la foto con el jefe, la obra inaugurada tres veces.
- **Roles y cargos ficticios**: «el Intendente», «la Concejala», «el Subsecretario de
  Vinculación» como arquetipos, sin correspondencia con una persona identificable.
- **Facciones inventadas**: nombre, sigla, colores y lema propios, sin parecido con
  partidos reales más allá del aire de familia inevitable de cualquier sátira.
- **Lugares reales**: la Plaza San Martín, La Trochita, La Hoya, las calles del
  centro. La ciudad es el escenario y merece estar bien retratada.
- **Temas públicos**: agua, obras, turismo, presupuesto, nieve, transporte.

## 2. Qué no

- Nombres, apellidos, apodos, caras, voces o firmas de **personas reales**.
- Nombres, siglas, logos o paletas registradas de **partidos reales**.
- Atributos personales: aspecto físico, salud, orientación sexual, religión, familia,
  origen étnico. Ni siquiera del arquetipo ficticio.
- Acusaciones de **delitos concretos** atribuibles a una persona identificable, aunque
  sea con un alias transparente. Una carta puede llamarse «Licitación amiga»; no puede
  decir que la firmó fulano.
- Contenido que incite a hostigar a alguien dentro o fuera del juego.
- Uso de fachadas o marcas de comercios reales sin consentimiento del titular.

## 3. Prueba de las tres preguntas

Antes de aprobar una carta, misión o diálogo:

1. **¿Un lector de Esquel sabría exactamente a quién apunta?** Si sí, se reescribe.
2. **¿Afirma un hecho verificable sobre una persona?** Si sí, se reescribe.
3. **¿El chiste sigue funcionando sin el destinatario?** Si no, no era un chiste sobre
   política: era sobre alguien.

## 4. Proceso

| Etapa | Responsable | Qué hace |
|---|---|---|
| Propuesta | Diseño de contenido | Redacta la carta/misión con su texto de sabor |
| Filtro editorial | Revisión (2 personas) | Aplica la prueba de las tres preguntas |
| Publicación | Live-Ops | Alta en el catálogo con `habilitada = 1` |
| Reclamo | Cualquier persona | Formulario público de contacto |
| Resolución | Revisión + producto | 72 h hábiles: se retira, se reescribe o se explica por qué se sostiene |

Retirar contenido es barato: `habilitada = 0` lo saca del juego sin borrar el
historial de partidas que lo usaron. Ante la duda, se retira primero y se discute
después.

## 5. Contenido generado por jugadores

Nicks, mensajes de chat, voz y fotos de fachadas pasan por el mismo criterio, más:

- Nicks que suplanten a personas reales o instituciones: se renombran.
- Fotos con personas o patentes reconocibles: difuminado obligatorio antes de
  almacenar; sin difuminar, no entra al pipeline.
- Denuncias vía `moderacion_denuncias`, con acciones graduadas (advertencia,
  silencio, suspensión, baneo) y traza en `auditoria`.

## 6. Períodos electorales reales

Durante una veda electoral real en Chubut, el juego **suspende** la publicación de
cortes de intención de voto y los eventos in-game de temática electoral quedan en
modo neutro. La sátira sigue; la difusión de números, no.
