# Motor de Inteligencia: reglas de privacidad

> **Estado:** PROMPT 0 · versión 1.0.0 · **vinculante para todas las fases**
> Contrato técnico: [`/shared/types/telemetry.ts`](../../shared/types/telemetry.ts)

El juego mide sentimiento político por barrio y franja etaria. Eso es valioso y por
eso mismo es delicado: un mapa de intención de voto mal manejado es un problema para
los vecinos que lo alimentaron. Estas reglas no son una recomendación, son parte del
contrato de datos y se auditan en cada fase.

## 1. Reglas duras

1. **Nada de PII en telemetría.** Ni email, ni nick, ni IP, ni user-agent completo, ni
   coordenadas GPS del dispositivo. La unidad de análisis es el par
   *(barrio declarado, franja etaria)*, nunca la persona.
2. **Seudónimo rotativo.** `subject = HMAC-SHA256(usuarios.id, sal)` truncado a 128
   bits. La sal rota cada 30 días y la vieja se destruye: los eventos de períodos
   distintos dejan de ser vinculables entre sí.
3. **Consentimiento granular.** Sin `telemetryConsent` sólo se aceptan eventos
   `kind: 'sistema'` (errores y performance). El resto se descarta **en el borde**,
   antes de tocar la base. El consentimiento se revoca desde el perfil, sin fricción.
4. **k-anonimato ≥ 15.** Ninguna celda (barrio × franja × pregunta) se publica con
   menos de 15 sujetos distintos. Debajo del umbral, la API devuelve `null`, no un
   número redondeado. `K_ANON_MIN` es una constante compartida, no una decisión de
   cada consulta.
5. **Derecho al borrado.** `DELETE /api/v1/me/telemetry` purga los eventos del sujeto
   y **recalcula los agregados** de los días afectados. Un agregado que sobrevive al
   borrado del dato crudo sigue siendo el dato.
6. **Retención acotada.** Eventos crudos: 180 días. Sesiones: 365 días. Agregados:
   indefinidos (ya no son personales). Cuentas con borrado lógico: purga física a los
   30 días.
7. **Contenido de chat y voz: jamás.** Se miden volúmenes (mensajes por ventana,
   minutos de voz, cantidad de pares), nunca el contenido. No hay grabación de audio
   en ningún punto del sistema.
8. **Menores.** Bajo 18 se registra sólo la franja `16-17`; por debajo de 16 no hay
   registro demográfico. Sin edad declarada, el sujeto queda fuera de todo corte
   etario.

## 2. Qué se mide y para qué

| Categoría | Ejemplos | Sirve para |
|---|---|---|
| `sistema` | FPS, tiempo de carga, errores | Que el juego ande. Sin consentimiento |
| `sesion` | Alta, duración, retención | Salud del producto |
| `movimiento` | Entrada a celda, permanencia en POI | Mapa de calor urbano (granularidad de manzana) |
| `progresion` | Misiones, ascensos, duelos | Recalibración del balance |
| `social` | Volumen de chat, minutos de voz | Moderación y capacidad |
| `economia` | Compras, sumideros | Economía del juego |
| `politico` | Intención de voto, prioridad de temas, reacción a noticias | El producto de inteligencia |
| `comercial` | Impresiones y conversiones de sponsors | Reporte a comercios |

La categoría `politico` **siempre** proviene de una acción explícita del jugador: una
urna en la plaza, una encuesta dentro de la misión de censo, una reacción declarada.
Nunca se infiere intención de voto a partir de comportamiento (por qué zona camina,
con quién habla, qué facción eligió en el juego). Elegir una facción para jugar no es
declarar un voto, y el modelo no los mezcla.

## 3. Separación de series

| Serie | Origen | Dónde vive |
|---|---|---|
| **Apoyo simulado** | Control territorial dentro del juego | `facciones.apoyo` |
| **Intención declarada** | Respuestas explícitas de los jugadores | `intencion_voto_diaria` |

No se combinan, no se promedian y no se publican juntas sin decir cuál es cuál. La
primera es una métrica de juego; la segunda es una encuesta con sesgo de muestra
conocido (juega quien juega, no un padrón).

## 4. Qué NO afirma este producto

- No es una encuesta representativa del padrón de Esquel. La muestra es
  autoseleccionada y sesgada hacia quien juega videojuegos.
- Los cortes por barrio dependen del barrio **declarado**, que puede no coincidir con
  el domicilio electoral.
- Todo reporte publicado lleva impresos: tamaño de muestra, margen de error y esta
  advertencia. Un número sin `n` no sale del sistema.

## 5. Acceso

| Rol | Puede ver |
|---|---|
| `player` | Sólo lo suyo |
| `sponsor` | Métricas de su comercio, con k-anonimato aplicado |
| `analyst` | Agregados publicables. **Nunca** la tabla cruda |
| `admin` | Lo anterior más auditoría. El acceso al dato crudo queda registrado en `auditoria` |

## 6. Checklist de auditoría por fase

- [ ] Ningún endpoint devuelve filas de `telemetria_inteligencia`.
- [ ] Toda respuesta agregada trae `n` y respeta `K_ANON_MIN`.
- [ ] Los eventos sin consentimiento se descartan antes de persistir (test en CI).
- [ ] La rotación de sal está programada y verificada.
- [ ] El job de retención corre y deja traza en `auditoria`.
- [ ] Ningún log de aplicación imprime `subject` junto a `usuario_id`.
