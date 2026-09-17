# Prompt de implementación · Plataforma Trocha

> **Cómo se usa:** abrí este repositorio en Antigravity y pegá todo este archivo como
> instrucción inicial. Está escrito para ejecutarse de punta a punta sin volver a
> preguntar lo que ya está decidido acá.

---

## 1. Rol y objetivo

Actuás como ingeniero de software sénior a cargo de construir y desplegar **Trocha**, el
sistema de gestión del Programa de Apoyo a la Educación (PAE) de la Municipalidad de
Esquel, Chubut, Argentina.

El repositorio ya contiene el diseño completo: diagnóstico, arquitectura, modelo de datos,
sistema visual, decisiones de arquitectura registradas y un prototipo navegable.
**Tu trabajo no es rediseñar: es implementar lo que está decidido, y dejarlo corriendo
en un VPS.**

### Antes de escribir una sola línea, leé en este orden

1. `README.md`
2. `CONTEXTO-Y-SUPUESTOS.md` — qué está verificado y qué es supuesto
3. `docs/04-arquitectura-producto.md` — los módulos
4. `docs/05-modelo-de-datos.md` — **las razones** detrás del esquema
5. `docs/06-motor-riesgo-y-matching.md` — reglas del motor de riesgo
6. `docs/07-gobernanza-datos-y-legal.md` — **los límites que no se cruzan**
7. `design/sistema-visual.md` — el contrato visual
8. `docs/adr/` — las cuatro decisiones y su fundamento
9. `schema/schema.prisma` — el esquema, ya escrito
10. `prototipo/` — abrilo en el navegador: **así se tiene que ver el resultado**

Ignorá `interno/`. No es parte del producto.

---

## 2. Stack — ya decidido, no lo cambies

| Capa | Elección |
|---|---|
| Framework | **Next.js 15+, App Router, TypeScript estricto** |
| Base de datos | **PostgreSQL 16** con **Prisma** |
| Autenticación | Sesión propia con cookies `httpOnly` + **TOTP** para roles sensibles |
| Estilos | **Tailwind CSS v4** con los tokens de `design/sistema-visual.md` |
| Gráficos | **SVG propio.** Ninguna biblioteca de charts |
| Validación | **Zod**, compartido entre cliente y servidor |
| Archivos | Disco local en volumen, identificador opaco |
| Pruebas | **Vitest** (unidad) + **Playwright** (extremo a extremo) |
| Despliegue | **Docker Compose + Caddy**, según `infra/` |

**No agregues:** Redis, colas de mensajes, microservicios, GraphQL, ORMs adicionales,
bibliotecas de componentes con estética propia (shadcn, MUI, Chakra, Ant), bibliotecas de
gráficos (Recharts, Chart.js, D3, visx), ni ningún servicio en la nube de terceros.
Si creés que hace falta algo de esto, **documentá el motivo en un ADR nuevo y seguí sin
agregarlo** hasta que alguien lo apruebe.

---

## 3. Reglas innegociables

Estas ocho reglas son requisitos de política pública, no preferencias técnicas.
Violarlas invalida el trabajo, por más que la aplicación funcione.

| # | Regla | Verificación |
|---|---|---|
| **R1** | **El sistema nunca da de baja, rechaza ni suspende a nadie de forma automática.** Detecta, prioriza, asigna y recuerda. Una persona decide y firma | No existe ninguna ruta de código que escriba `SUSPENDIDA`, `BAJA` o `RECHAZADA` sin `usuarioId`. Test obligatorio |
| **R2** | **No se persisten coordenadas del estudiante.** Solo el booleano de geocerca, la precisión y el sello de tiempo | El esquema no tiene campos de latitud/longitud en `RegistroHoras`. Test que falla si aparecen |
| **R3** | **Denegar la ubicación nunca impide cumplir.** El check-in funciona igual y pasa a validación manual | Test de extremo a extremo con permiso de geolocalización denegado |
| **R4** | **Ninguna alerta se cierra sin intervención registrada.** «Sin acción» no es un estado de cierre válido | Test de unidad sobre la transición de cierre |
| **R5** | **Sin ranking público entre estudiantes.** El progreso se compara contra la propia meta y contra metas colectivas por sede | Revisión de interfaz; no existe endpoint que ordene estudiantes por desempeño |
| **R6** | **Variables prohibidas fuera del puntaje:** nacionalidad, origen étnico, salud, discapacidad, religión, opinión política, situación penal de familiares, y **el barrio como predictor individual** | El motor de riesgo recibe un objeto tipado que no las contiene. Test |
| **R7** | **Ningún trámite es exclusivamente digital.** Todo flujo tiene canal asistido (`CanalOrigen.PRESENCIAL` / `SEDE_VECINAL`) | Revisión funcional |
| **R8** | **El puntaje de riesgo siempre se muestra descompuesto**, nunca como número solo | Revisión de interfaz; `Alerta.desglose` es obligatorio y se renderiza |

> **R6, el barrio, merece cuidado especial porque es la trampa más sutil.** El barrio
> **se usa** para asignar recursos (dónde reforzar, dónde abrir un taller) y **no se usa**
> para puntuar personas. Si el barrio entra al puntaje individual, un chico arranca con
> peor calificación por vivir donde vive, y el sistema reproduce con apariencia de
> objetividad la desigualdad que decía combatir.

---

## 4. Alcance de la versión 1

### Se construye

| Módulo | Contenido |
|---|---|
| **M1 · Padrón** | Inscripción digital con guardado parcial, motor de elegibilidad **con explicación en texto**, bóveda documental *una sola vez*, detección de duplicados, máquina de estados completa |
| **M2 · Trayectoria** | Institución, nivel, carrera, regularidad con vencimiento y recordatorio automático, distinción declarado/verificado |
| **M3 · Compromiso comunitario** | Catálogo de proyectos, postulación y asignación, check-in con QR + geocerca, evidencia, validación del referente, contador de horas, credencial verificable |
| **M4 · Alertas** | Motor de reglas, asignación automática de responsable, SLA, bitácora obligatoria, escalamiento automático |
| **M5 · Pagos** | Generación del padrón de pago con validaciones, exportación CSV para Tesorería, conciliación, motor de actualización del monto |
| **M6 · Panel** | Tablero de conducción con dos modos, según `prototipo/panel.html` |
| **M7 · Portal del estudiante** | Según `prototipo/estudiante.html`, móvil primero |
| **M8 · Transparencia** | Portal público + datos abiertos con supresión de celdas chicas |
| **M10 · Identidad** | Roles, TOTP, bitácora inmutable, registro de accesos visible al titular |

### NO se construye en v1

- **M9 · Matching**: se deja el modelo de datos y un puntaje de afinidad básico por
  coincidencia de competencias. El motor completo es Fase 2.
- Modelo predictivo de deserción. Ver `adr/ADR-001`. **No lo implementes aunque te parezca
  fácil.**
- Bot de WhatsApp.
- Integración automática con bases externas: se deja el punto de importación por archivo.

---

## 5. Sistema visual — copiar exactamente

Estos valores están **validados** contra los seis controles de accesibilidad de color
(daltonismo protán/deután/tritán, banda de luminosidad, piso de croma y contraste) en
modo claro y oscuro. **No los cambies, no los reordenes y no agregues un séptimo color de
serie.** Reordenar la paleta invalida la verificación.

```css
:root{
  --plane:#F2F0E9; --paper:#FBFAF7; --raised:#FFFFFF;
  --ink-1:#141A1F; --ink-2:#4C565E; --ink-3:#7D8791;
  --grid:#E2DFD5; --rule:#CFCBBE; --accent:#C9542B;
  /* serie categórica — ORDEN FIJO */
  --s1:#1F6F9E; --s2:#C9542B; --s3:#2E8C6A;
  --s4:#A87C00; --s5:#6B4E9C; --s6:#B0475F;
  /* rampa secuencial — un solo tono */
  --q1:#E1EBF2; --q2:#BDD4E3; --q3:#93B8D0; --q4:#6499BA;
  --q5:#3A7CA2; --q6:#1F6F9E; --q7:#16536F;
  /* estado — reservado, jamás como serie */
  --ok:#0CA30C; --warn:#FAB219; --bad:#EC835A; --crit:#D03B3B;
}
/* Oscuro: pasos re-derivados para la superficie oscura, NO invertidos */
[data-theme="dark"]{
  --plane:#0C0F12; --paper:#12161A; --raised:#1A2026;
  --ink-1:#F4F2EC; --ink-2:#B6BDC4; --ink-3:#8A939B;
  --grid:#242B31; --rule:#333C44; --accent:#E0703F;
  --s1:#3E96C7; --s2:#E0703F; --s3:#3CA87F;
  --s4:#B8890A; --s5:#9A82D8; --s6:#D4657C;
  --q1:#16242E; --q2:#1C3A4C; --q3:#244E68; --q4:#2E6B8C;
  --q5:#3E8AB0; --q6:#5AA5C8; --q7:#86C2DD;
}
```

**Tipografías:** `Archivo` (interfaz y títulos) + `JetBrains Mono` (rótulos y datos).
**Autoalojadas en `/public/fonts`** — ver `infra/DEPLOY-VPS.md`. Sin CDN de terceros.
Sin serif en ningún lado, ni siquiera en la cifra protagonista.

### Reglas de gráficos — obligatorias

Portá `prototipo/assets/js/charts.js` a componentes de React. Mantené intactas estas
especificaciones:

- Barras **≤ 24 px**, extremo redondeado 4px, base cuadrada, separación de **2px** entre
  vecinas.
- Líneas de **2px**, unión y remate redondeados. Marcadores **≥ 8px** con anillo de 2px
  del color de la superficie.
- Relleno de área al **10%** de opacidad. Grilla en filete de 1px **sólido**, nunca punteada.
- **Jamás dos ejes verticales.** Dos magnitudes distintas son dos gráficos o se indexan.
- **Secuencial = un tono claro→oscuro. Divergente = dos tonos con gris al medio.** Nunca arcoíris.
- El color identifica a la entidad, **nunca a su posición en el ranking**.
- **Leyenda siempre con 2+ series; ninguna con una sola.** Etiquetado selectivo: el extremo
  o el dato del que habla el título, nunca un número sobre cada punto.
- **Si dos etiquetas de extremo colisionan, no las apiles**: etiquetá solo la serie
  principal y dejá que la leyenda y el tooltip carguen el resto.
- **El texto nunca usa el color de la serie.** Usa tinta primaria/secundaria/atenuada.
- La tinta sobre un relleno de color se elige **comparando el contraste de ambas opciones**,
  no con un umbral fijo de luminosidad (mirá `pickInk` en `charts.js`).
- Todo gráfico tiene **vista de tabla** a un clic, y **tooltip al pasar el mouse**.

---

## 6. Criterios de aceptación por módulo

### M1 · Padrón

- [ ] El formulario guarda parcialmente y se puede retomar desde otro dispositivo.
- [ ] El motor de elegibilidad **devuelve un texto explicativo**: *"No cumple residencia
      mínima: 2 años 4 meses acreditados sobre 3 requeridos"*. Nunca un rechazo sin causa.
- [ ] Si la persona ya presentó un documento vigente, **el sistema no lo vuelve a pedir** y
      lo informa en pantalla con su fecha de vencimiento.
- [ ] Detecta duplicados por documento y por similitud de contacto, y los marca para
      revisión humana — **nunca los rechaza solo**.
- [ ] Toda transición de estado escribe `TransicionEstado` con actor, motivo y fundamento.
- [ ] Las postulaciones en `LISTA_ESPERA` se conservan íntegras con su puntaje.

### M3 · Compromiso comunitario

- [ ] El QR de la sede es un token firmado (HMAC) con ventana de validez corta, para que
      no se pueda fotografiar y reutilizar desde casa.
- [ ] El check-in **funciona sin conexión**: encola localmente y sincroniza después.
- [ ] La geocerca se evalúa contra el centro y el radio de la sede. Se guarda
      `dentroDeGeocerca` y `precisionMetros`. **Nunca coordenadas.**
- [ ] Permiso denegado → `dentroDeGeocerca = null`, el registro se crea igual y va a
      validación manual. **Sin penalización de ningún tipo.**
- [ ] La evidencia fotográfica se guarda con `evidenciaBorrarEn` a 24 meses y hay una tarea
      programada que efectivamente borra.
- [ ] Al cerrar el ciclo se emite la credencial con código de verificación, y existe una
      página pública `/verificar/[codigo]` que confirma horas y tareas **sin exponer datos
      personales más allá del nombre**.

### M4 · Alertas

- [ ] El motor evalúa las señales de `docs/06` §2 con pesos **configurables desde la base**.
- [ ] Cada alerta nace con responsable asignado y `vencimientoSla` según severidad
      (informativa 10 días hábiles, media 5, alta 48 h, crítica 24 h).
- [ ] `Alerta.desglose` guarda el detalle `{señal, aporte}` y la interfaz **lo muestra siempre**.
- [ ] Una alerta no se puede cerrar sin al menos una `Intervencion`.
- [ ] Una tarea programada escala automáticamente las alertas con SLA vencido.
- [ ] El tablero muestra **porcentaje atendido en plazo**, no cantidad de alertas.

### M5 · Pagos

- [ ] La liquidación valida antes de generar: estado activo, regularidad vigente, datos
      bancarios válidos. Informa cada exclusión con su motivo.
- [ ] Exporta CSV con codificación y separador configurables — **el sistema se adapta al
      formato de Tesorería, no al revés**.
- [ ] Cada `Liquidacion` guarda `indiceAplicado`, para poder reconstruir el poder de compra
      real sin recalcular.
- [ ] El motor de actualización aplica la fórmula del ciclo y **respeta el techo
      presupuestario**, avisando cuando lo supera en vez de aplicarlo igual.
- [ ] Todos los montos en `BigInt` de centavos. **Ningún `Float` para dinero, en ningún lado.**

### M8 · Transparencia

- [ ] Accesible **sin identificarse**.
- [ ] **Supresión de celdas chicas: ningún cruce se publica con menos de 5 personas.**
      Implementalo como una función central que todas las consultas públicas atraviesan,
      no como un chequeo repetido en cada endpoint.
- [ ] Descarga en CSV y JSON con licencia abierta declarada.
- [ ] Publica la fórmula de actualización del monto y la serie histórica del índice.

### M10 · Identidad y auditoría

- [ ] `EventoAuditoria` es de solo inserción, **reforzado con permisos de PostgreSQL**
      (`REVOKE UPDATE, DELETE`), no solo en la capa de aplicación.
- [ ] TOTP obligatorio para `DIRECCION_EDUCACION`, `TESORERIA`, `INTENDENCIA`, `ADMIN`.
- [ ] Un `REFERENTE_SEDE` **solo ve su sede** y **nunca datos socioeconómicos**. Test.
- [ ] Toda lectura de datos sensibles escribe `AccesoDato`.
- [ ] El estudiante ve su propio registro de accesos en «Mis datos».

---

## 7. Accesibilidad — WCAG 2.2 AA, verificada

- [ ] Navegación completa por teclado en todos los formularios.
- [ ] Errores asociados programáticamente a su campo (`aria-describedby`).
- [ ] Ningún estado comunicado **solo** por color: siempre ícono + texto.
- [ ] Texto redimensionable al 200% sin pérdida de contenido.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Modo oscuro con interruptor manual que **gana sobre la preferencia del sistema en
      ambos sentidos**.
- [ ] Lenguaje llano en toda la interfaz. *"Su solicitud se encuentra en instancia de
      evaluación"* → *"Estamos revisando tu pedido. Te avisamos antes del 15 de marzo."*
- [ ] Ejecutá `axe-core` en la suite de Playwright y **fallá el build** con violaciones
      serias o críticas.

---

## 8. Rendimiento — es un requisito de equidad

El sistema lo usa gente con teléfonos baratos y datos contados. La lentitud **excluye**.

- [ ] Presupuesto: **≤ 120 KB de JavaScript comprimido** en la primera carga del portal
      del estudiante.
- [ ] Renderizado en servidor por defecto; componentes de cliente solo donde hacen falta.
- [ ] Sin fuentes ni scripts de terceros.
- [ ] Imágenes de evidencia comprimidas **en el cliente antes de subir**.
- [ ] Funciona con JavaScript deshabilitado para los flujos críticos de lectura.

---

## 9. Pruebas obligatorias

Estas ocho existen para custodiar las reglas innegociables. **Si alguna falla, el sistema
no se despliega.**

```
test/reglas/
  r1-sin-baja-automatica.test.ts      → ninguna transición terminal sin usuarioId
  r2-sin-coordenadas.test.ts          → el esquema y los payloads no contienen lat/long
  r3-geo-denegada.test.ts             → check-in exitoso con permiso denegado
  r4-cierre-con-intervencion.test.ts  → cerrar sin intervención falla
  r5-sin-ranking.test.ts              → no existe endpoint que ordene estudiantes
  r6-variables-prohibidas.test.ts     → el puntaje ignora las variables vedadas
  r8-desglose-obligatorio.test.ts     → toda alerta tiene desglose no vacío
  m8-supresion-celdas.test.ts         → ninguna respuesta pública con n < 5
```

Más: pruebas de unidad del motor de elegibilidad y del motor de riesgo, y pruebas de
extremo a extremo de los tres recorridos completos (inscribirse, hacer un check-in,
liquidar un pago).

---

## 10. Datos semilla

```bash
npm run seed:catalogos   # barrios y juntas vecinales — CARGAR EL LISTADO OFICIAL
npm run seed:demo        # datos sintéticos para desarrollo
```

> **El listado de barrios y juntas vecinales debe pedirse a la Dirección de Juntas
> Vecinales del municipio. Son 18 juntas.** El repositorio incluye las 13 identificadas en
> fuentes públicas, marcadas como incompletas. **No inventes los 5 restantes.** Dejá el
> seed preparado para completarse y que la interfaz muestre «listado incompleto» hasta que
> lo esté.

El seed de demostración **debe** marcar sus registros con una bandera `esDemo` y la
interfaz **debe** mostrar el distintivo `DATOS DEMO` mientras exista alguno.

---

## 11. Despliegue en el VPS

Usá `infra/` tal como está.

```bash
cd infra && cp .env.example .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 32)|" .env
sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" .env
# ajustar APP_URL a la IP o dominio real del VPS
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run seed:catalogos
curl -s http://localhost:13787/api/salud
```

- **Puerto expuesto: `13787`.** Único. Configurable con `TROCHA_PORT` en `.env`.
- **PostgreSQL no se publica**: solo es accesible desde la red interna de Docker.
- Cortafuegos: solo 22 y 13787.
- `GET /api/salud` devuelve `200` solo si la aplicación **y** la base responden.
- Dejá funcionando el cron de respaldo cifrado de `infra/DEPLOY-VPS.md`, y **verificá una
  restauración antes de dar por terminado el despliegue**.

---

## 12. Orden de trabajo

Trabajá en este orden y **dejá cada etapa funcionando y probada antes de seguir**.
Nada de construir las diez pantallas y probar al final.

1. Andamiaje, Docker, base, migraciones, `/api/salud`, despliegue vacío funcionando en el VPS.
2. Sistema visual: tokens, tipografías autoalojadas, componentes base, modo oscuro.
3. M10 identidad, roles, bitácora, registro de accesos. **Primero la auditoría, antes que
   los datos que audita.**
4. M1 padrón + máquina de estados + las pruebas R1 y R6.
5. M2 trayectoria y regularidad.
6. M3 compromiso comunitario + pruebas R2 y R3. **Es el módulo de mayor riesgo: dedicale
   el doble de tiempo del que estimes.**
7. M4 alertas + pruebas R4 y R8.
8. M5 pagos y actualización del monto.
9. M6 panel: portá los gráficos del prototipo.
10. M7 portal del estudiante + prueba R5.
11. M8 transparencia + prueba de supresión de celdas.
12. Auditoría de accesibilidad, presupuesto de rendimiento, respaldos y restauración.

---

## 13. Definición de terminado

Una funcionalidad está terminada cuando:

- [ ] Funciona en un teléfono de gama baja con conexión lenta (probalo con estrangulamiento de red)
- [ ] Tiene su camino alternativo asistido
- [ ] Sus textos están en lenguaje llano
- [ ] Pasa la verificación de accesibilidad
- [ ] Escribe en la bitácora lo que corresponde
- [ ] Tiene prueba automatizada de su regla de negocio crítica
- [ ] Está documentada

---

## 14. Si algo no está claro

1. Buscá la respuesta en `docs/` y en `docs/adr/`. Casi todo está decidido ahí.
2. Si de verdad no está: **elegí la opción más simple, más auditable y más conservadora
   con los datos personales**, implementala, y escribí un ADR nuevo en `docs/adr/`
   explicando qué decidiste y por qué.
3. **Nunca inventes datos sobre Esquel** —barrios, montos, cantidades de beneficiarios,
   normativa—. Si falta un dato real, dejá el campo vacío, marcalo como pendiente en la
   interfaz y anotalo en `CONTEXTO-Y-SUPUESTOS.md`.

> Esta última regla es la más importante de todo el prompt. Este sistema lo va a mirar un
> intendente, y un número inventado que se presenta como real destruye la credibilidad de
> todo el proyecto de manera irreversible. **Ante la duda: vacío y marcado, nunca
> inventado.**
