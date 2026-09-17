# 01 · Mapa de poder

## 1. El tablero

| Actor | Posición esperada | Qué gana | Qué teme | Prioridad |
|---|---|---|---|---|
| **Intendente (Taccetta)** | Patrocinador potencial | Programa defendible, eficiencia sin costo político | Conflicto público, escándalo con un beneficiario | 🔴 Decisiva |
| **Directora de Educación (Aldana Roberts)** | **Dueña del proyecto — o su principal obstáculo** | Instrumento para su bandera de ciudad educadora | Que le auditen el área; quedar de adorno | 🔴 Decisiva |
| **Dirección de Juntas Vecinales (Gastón Escobar)** | Aliado natural | Información del territorio, victoria rápida | Que le pasen por encima del vínculo barrial | 🔴 Alta |
| **Equipo del Área de Extensión Educativa** | Resistencia probable | Menos trabajo repetitivo | Perder el saber que los hace necesarios | 🟠 Alta |
| **Secretaría de Gobierno (Diego Austin)** | Neutral, atento | Orden institucional | Conflictos entre áreas que tenga que resolver él | 🟠 Media |
| **Desarrollo Humano (Fabiana Vázquez)** | Neutral con roce posible | Padrón compartido | Que Educación se meta en criterios socioeconómicos | 🟠 Media |
| **Tesorería / Contaduría** | Resistencia pasiva | Padrón de pago limpio | Trabajo nuevo, cambiar su circuito | 🟡 Media |
| **Sistemas / Informática** | **Riesgo de conflicto** | Herramienta moderna | Que un externo le haga el trabajo y lo exponga | 🔴 Subestimado |
| **Referentes vecinales** | Mixta | Reconocimiento y recursos | Más burocracia sin contrapartida | 🟡 Media |
| **Concejo Deliberante** | Escrutinio | Transparencia para fiscalizar | Que sea una herramienta de campaña | 🟡 Media |
| **Estudiantes y familias** | Beneficiarios | Trámite simple, pago previsible | Perder la beca por un problema técnico | 🟠 Alta |

---

## 2. Los tres riesgos que hay que manejar antes de empezar

### R1 · Sistemas / Informática — el más subestimado

Es **el error clásico y el más caro**: un desarrollador de otra área construye un sistema
y el área de Sistemas se entera cuando ya está funcionando. La lectura inevitable es
*"me pasaron por encima y encima me dejaron mal"*, y a partir de ahí se pierde acceso a
servidores, a integraciones, a datos y a cualquier cosa que necesite su firma.

**Mitigación, y hay que hacerla primero:**
- Reunión con Sistemas **antes** que con nadie más, incluso antes que con Aldana.
- El encuadre correcto: *"Necesito que esto cumpla con los estándares del municipio. ¿Me
  ayudás a que quede bien y quedás como referente técnico del proyecto?"*
- Se les da rol de **revisor técnico formal** en el proyecto. Con nombre, en el documento.
- Que el repositorio termine bajo control del municipio, no personal.

> Convertir al posible saboteador en coautor cuesta una reunión de una hora. Enfrentarlo
> cuesta el proyecto.

### R2 · El equipo del área — el saber como poder

El equipo que hoy maneja el PAE tiene el conocimiento operativo en la cabeza (`docs/01`,
falla F7). Un sistema que hace explícito ese saber los expone: el miedo real, aunque
nunca se diga así, es *"si el sistema sabe todo lo que sé yo, ¿para qué estoy?"*.

**Mitigación:**
- Se los entrevista como **expertos**, no como usuarios. Sus reglas, con su nombre, van
  documentadas en el sistema.
- El mensaje: *"el sistema hace la parte aburrida para que vos hagas la parte que
  requiere criterio"*.
- **Nunca** se presenta una métrica de productividad individual del equipo. Jamás.
- Se les da algo concreto que hoy no tienen y quieren: por ejemplo, dejar de perseguir
  papeles.

### R3 · Aldana puede sentir auditoría, no ayuda

Asumió en junio de 2026 en un cargo que estuvo vacante desde abril. Está armando su
gestión. Que aparezca alguien de afuera del área con un diagnóstico de todo lo que está
mal puede leerse de una sola manera: **te vienen a marcar la cancha**.

Es el riesgo más grande del proyecto y tiene todo un documento: `03-venta-interna-aldana.md`.

---

## 3. Quién pierde algo real

Hay que nombrarlo con honestidad, porque es donde va a venir la resistencia que no se
declara:

| Quién | Qué pierde | Cómo se maneja |
|---|---|---|
| Quien maneja discrecionalidad en la asignación | Capacidad de decidir casos particulares | El sistema mantiene la **excepción fundada**: se puede decidir distinto, pero queda escrito por qué. No se elimina la discrecionalidad, se la hace explícita |
| Quien usaba el programa como capital político territorial | El vínculo de gratitud personal con el beneficiario | No se confronta. Se ofrece protagonismo en el nuevo esquema: el referente sigue siendo la cara, con mejor información |
| Quien es el único que sabe cómo funciona | Posición insustituible | Se lo convierte en autoridad reconocida del nuevo sistema |

> **La "excepción fundada" es una pieza de diseño política, no técnica.** Un sistema que
> elimina toda discrecionalidad es un sistema que la administración va a rechazar, porque
> la discrecionalidad razonable es parte de cómo funciona el Estado — hay casos que la
> regla no previó. Lo que corresponde no es prohibirla: es **dejarla registrada**.
> Esa distinción va a hacer que el sistema se adopte en vez de sabotearse.

---

## 4. La secuencia de reuniones

El orden no es negociable: cada reunión habilita la siguiente.

```
 1. SISTEMAS           →  "ayudame a que esto quede bien"       (neutralizar veto)
 2. ALDANA             →  preguntas, no propuesta               (dueña del proyecto)
 3. EQUIPO DEL ÁREA    →  entrevistas de experto                (con Aldana presente)
 4. GASTÓN             →  pedirle su catálogo de sedes          (aliado)
 5. ASESORÍA LETRADA   →  las 7 preguntas de docs/07            (blindaje)
 6. TESORERÍA          →  "¿en qué formato lo querés?"          (evitar traba)
 7. INTENDENTE         →  la lámina de tres números             (el pedido)
```

**Al Intendente se llega último y con resultados, nunca primero y con una idea.** La
diferencia entre las dos versiones de esa reunión es la diferencia entre *"qué
interesante, seguí"* y *"me parece bien, háganlo"*.

---

## 5. La regla de fondo

> Cada uno de estos actores tiene que poder contar el proyecto como **propio** ante su
> propia gente.
>
> Si al final del primer año Aldana puede decir "mi gestión digitalizó el PAE", Gastón
> puede decir "ordenamos las juntas", Sistemas puede decir "lo validamos nosotros" y el
> Intendente puede decir "ordenamos el gasto sin sacarle a nadie", entonces el proyecto
> es indestructible.
>
> Y el que lo diseñó todo no necesita decir nada: en un municipio, **eso ya lo sabe
> todo el mundo**.
