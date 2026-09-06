# Guillotina — instrucciones v16

Traé `claude/taxonomia-v4` antes de leer esto. Hay dos commits nuevos
(`59e0f99`, `c89ac13`) y **542 pruebas en verde**. Corré `pytest` primero: si
no colecta, el problema es de tu entorno y hay que resolverlo antes que
cualquier otra cosa.

---

## 0. Lo primero: por qué el reporte de «516 en verde» no era cierto

No fue culpa tuya y por eso importa entenderlo.

Las 516 pruebas pasaron de verdad **en tu entorno**. Al traer el repositorio,
**no colectaba**: cinco archivos con `SyntaxError`. Dos causas, las dos de
portabilidad:

1. **Comillas dobles anidadas en f-strings.** `f"{x.rstrip(".")}"` es válido
   desde Python 3.12 (PEP 701) y `SyntaxError` en 3.11. Estaba en
   `taller.py:178` y `facebook_worker.py:384`.
2. **BOM de UTF-8** al principio de tres archivos de prueba.

Un `SyntaxError` en un módulo no lo rompe sólo a él: rompe la colección de
pytest entera y **ninguna prueba corre**. El reporte decía verde porque en tu
Python compilaba.

Ya está arreglado y `tests/test_portabilidad.py` lo cubre de acá en más.

**Lo que te pido:** decime en qué versión de Python corrés. Si es 3.12+ y el
VPS corre 3.11, todo lo que escribas puede repetir esto. La solución es correr
las pruebas en la misma versión del VPS antes de reportar.

---

## 1. Corregí un error mío, y es del mismo tipo que uno tuyo

Lo pongo primero porque es el hallazgo más importante de esta ronda y porque
me corresponde a mí.

`senal_civica` exigía **dos testimonios** para que una publicación tuviera
señal. Justifiqué el número escribiendo que dos testimonios eran «mucho más
frecuentes que veinte comentarios». Nunca verifiqué esa afirmación contra la
distribución. Es falsa.

Tu corrida lo mostró: **199 publicaciones, 78 con conversación, 2 con señal
(1,0%)**. Yo esperaba ~10%.

La razón es aritmética. Con 1,1 comentarios de promedio, la mayoría de los
hilos con conversación tiene **exactamente uno**. Un hilo de un comentario no
puede tener dos testimonios. El umbral era estructuralmente inalcanzable para
el caso más frecuente.

Es el mismo error que te señalé en la Ruta A —un filtro mal calibrado— en la
dirección opuesta: **reemplacé uno que pasaba el 9% por uno que pasa el 1%**.

### La corrección: dos niveles, no un umbral más bajo

Bajar el número a uno hubiera sido convertir el reporte sin corroborar de un
vecino en una nota. La distinción correcta ya existe en cualquier redacción:

| nivel | testimonios | qué habilita |
|---|---|---|
| **indicio** | 1 | ir a chequear |
| **patrón** | 2 o más | una nota |

Un vecino que dice «hace seis días que no sube la máquina a mi calle» con lugar
y plazo es exactamente lo que un cronista sale a verificar. No alcanza para
publicar. Sí para mirar.

Un indicio **no entra a la cola** —queda con motivo explícito— y **no aporta
fuerza al puntaje**. Sólo el patrón publica. Está en
`seleccion_editorial.evaluar_candidata`.

### Y acá está el argumento que faltaba para el modelo de suceso

`senal_civica.agregar_por_suceso()` junta las señales de todos los hilos que
cubren el mismo hecho. **Un vecino en el hilo de FM del Lago y otro en el de
Canal 4, sobre el mismo hecho, son dos testimonios** aunque en cada hilo por
separado fueran uno.

Eso convierte indicios en patrones y es la razón concreta por la que la entidad
`suceso` vale la pena. No era una abstracción linda: es lo que hace que la
señal funcione en una comunidad donde nadie comenta mucho.

### Lo que necesito de vos, y es lo más importante del documento

Queda **una brecha que no puedo cerrar sin datos reales**.

Simulé el diseño nuevo contra tu distribución medida:

```
p(testimonio|comentario)   indicios   patrones   total
        0,10                  14         10       24/199 = 12,1%
        0,15                  21         14       35/199 = 17,6%
```

Aun con la tasa más baja que probé, la simulación da **10 patrones**. Tu
corrida dio **2**. Una brecha de 5× que el umbral no explica.

Hay dos hipótesis y son muy distintas:

- **A) Hay pocos testimonios.** La gente comenta poco y casi nunca reporta
  hechos concretos. El diseño está bien y la comarca es así.
- **B) `clasificar_comentario` no los encuentra.** El clasificador está
  perdiendo testimonios reales.

**No se pueden distinguir sin mirar comentarios de verdad.** Te pido:

1. Tomá **60 comentarios al azar** de los 78 hilos con conversación.
2. Etiquetalos **a mano**: ¿reporta un hecho concreto (lugar, plazo, cosa
   pasada) o es opinión/adhesión/insulto?
3. Corré `clasificar_comentario` sobre los mismos 60.
4. Pasame la matriz de confusión: aciertos, falsos positivos, falsos negativos,
   **y los textos de los falsos negativos**.

Con eso sabemos cuál de las dos hipótesis es. Sin eso, cualquier número que
elijamos es otra vez una afirmación sin verificar — que es exactamente el error
que estoy corrigiendo.

No inventes los 60 comentarios ni los generes con el modelo. Si no podés
acceder a los reales, decime que no podés; es una respuesta útil. Una muestra
fabricada es peor que ninguna.

---

## 2. La migración v8 decía hacer algo que no hacía

`sql/migracion_v8_suceso.sql` terminaba así:

```sql
-- Agregar columna suceso_id a piezas de forma aditiva
-- (SQLite no falla si se ejecuta de forma condicional)
```

No hay ninguna sentencia debajo. **La columna nunca se agregaba.** Una
migración que anuncia algo y no lo hace es peor que una que no lo intenta,
porque el comentario hace que nadie vuelva a mirar.

Escribí `sql/migracion_v9_atribucion.sql`, que además resuelve algo más serio.

### La atribución dejó de ser una convención

`medios.puede_atribuir` sostiene una distinción de la que dependen **todas** las
métricas del sistema:

> Un vínculo por coincidencia de texto alcanza para prestar un titular. **No**
> alcanza para decir «esta nota tuvo 40 comentarios», porque si el
> emparejamiento erró, esos comentarios son de otra nota.

Esa regla vivía en un solo `if` de `job_ingesta_portales.py`. Cualquier otro
proceso que escriba en `suceso_fuente` —un backfill, una carga manual, el
worker que todavía no existe— la saltea sin enterarse.

Ahora la cumple la base:

- `atribuible` no lo elige quien inserta: es consecuencia del método, y un
  disparador aborta si alguien intenta atribuir por vínculo aproximado.
- **También en UPDATE.** Prohibir sólo el INSERT dejaría abierta la vía de
  insertar en 0 y actualizar a 1, que es como estas reglas se rompen de verdad.
- `tipo`, `metodo` y `confianza` dejan de ser texto libre.
- `suceso.escala` se valida contra las seis de `ambito.py`. Un `'nacionál'` con
  tilde haría pasar el filtro geográfico a un hecho nacional.

**Al aplicar la v9:** SQLite no tiene `ADD COLUMN IF NOT EXISTS`. El runner
tiene que tolerar `duplicate column name` **de esas dos sentencias y de ninguna
otra**. Si envolvés todo el script en un `try/except: pass`, perdés las
restricciones sin enterarte — que es la versión SQL del `except Exception:
pass` de `api_v6.py`.

---

## 3. El semáforo de cobertura le preguntaba al proceso si estaba bien

Tu versión decía:

```python
if p.get("cobertura_insuficiente") or "cobertura insuficiente" in mensaje:
```

Eso le delega el juicio al proceso evaluado. Un proceso que falla de un modo
que no anticipó **no pone la bandera**, y el semáforo lo muestra verde. Es la
misma forma del `except: pass`: la ausencia de queja se toma como salud.

Ahora se calcula sobre los conteos crudos (`notas_vistas / notas_esperadas`,
mínimo 0,70). La bandera del proceso quedó, pero **sólo puede alarmar, nunca
tranquilizar**.

Un detalle que importa: `cobertura_de()` devuelve `None`, no `0.0`, cuando el
proceso no informa conteos. **`None` no es cero.** La gacetilla y la maduración
no tienen «notas esperadas» y no pueden ser juzgadas por una métrica que no les
aplica. Si convertís ese `None` en 0, ponés en rojo dos procesos sanos.

---

## 4. Qué hacer ahora, en orden

1. **La muestra de 60 comentarios etiquetados a mano** (§1). Es lo que
   desbloquea todo lo demás: sin eso no sabemos si el sistema mide poco porque
   hay poco o porque no ve.
2. **Aplicar la v9** en el VPS con el cuidado del `duplicate column name`.
3. **Decirme tu versión de Python** y correr las pruebas en la del VPS.
4. **Cablear `agregar_por_suceso`** en el pipeline: hoy existe y nadie la
   llama. Es donde los indicios se vuelven patrones.
5. **Mostrar los indicios en el dashboard**, en una lista aparte de la cola:
   «para chequear». Hoy se descartan en silencio y son ~15-25 por corrida — la
   materia prima de las notas propias.

## Lo que no hay que hacer

- **No cambies el proveedor de LLM.** Gemini Lite gratis, como está.
- **No toques los umbrales de `senal_civica`** hasta tener la muestra
  etiquetada. Ya los movimos dos veces sin datos; una tercera sería el mismo
  error.
- **No envuelvas la migración en un try/except general.**
- **No fabriques la muestra de comentarios.** «No pude acceder» es una
  respuesta útil; una muestra inventada no.

---

## Un cierre sobre cómo venimos trabajando

En esta ronda encontré defectos tuyos y uno mío, y el mío era del mismo tipo:
un número elegido por intuición y defendido con una frase que sonaba bien.
`MIN_TESTIMONIOS = 2` no salió de mirar la distribución, salió de que «dos
suena a corroboración».

Lo que lo detectó no fue una revisión más cuidadosa: fue **tu corrida contra
datos reales**. El 1,0% era un hecho, y los hechos ganan.

Por eso la muestra de 60 comentarios es lo que más pido. Todo lo demás lo
podemos razonar. Eso no.
