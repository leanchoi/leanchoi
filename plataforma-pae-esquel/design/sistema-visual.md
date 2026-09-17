# Sistema visual "Trocha"

## 1. La intención

El riesgo estético de cualquier producto hecho hoy es **verse como todos los demás**:
degradado violeta, tarjetas flotantes con sombra difusa, iconos redondeados, un azul
corporativo que no dice nada. Eso lee como plantilla, y una plantilla no genera confianza
institucional.

La referencia de este sistema es otra: **el documento de relevamiento patagónico**. Mapas
topográficos, libretas de campo, cartelería ferroviaria, planos catastrales. Papel cálido,
tinta oscura, líneas finas, rótulos monoespaciados, un solo color de acento que aparece
poco y cuando aparece significa algo.

| Principio | Traducción |
|---|---|
| **Papel, no pantalla** | Fondos cálidos con textura, no blanco quirúrgico ni gris azulado |
| **Línea, no sombra** | Separación con filetes de 1px. Sombras casi ausentes |
| **Rótulo, no adorno** | Etiquetas en monoespaciada, versalitas, con interletrado |
| **Un acento, usado poco** | El ñire aparece para señalar, nunca para decorar |
| **El dato es lo único fuerte** | Todo lo demás retrocede |

## 2. Paleta — validada, no elegida a ojo

Los colores de datos fueron verificados con un validador de accesibilidad para daltonismo
(protanopía, deuteranopía, tritanopía), banda de luminosidad, piso de croma y contraste
contra la superficie real. **Pasan los seis controles en modo claro y en modo oscuro.**

### Superficies y tinta

| Rol | Claro | Oscuro |
|---|---|---|
| Plano de página | `#F2F0E9` *(hueso)* | `#0C0F12` |
| Superficie de tarjeta / gráfico | `#FBFAF7` *(papel)* | `#12161A` *(pizarra)* |
| Superficie elevada | `#FFFFFF` | `#1A2026` |
| Tinta primaria | `#141A1F` | `#F4F2EC` |
| Tinta secundaria | `#4C565E` | `#B6BDC4` |
| Tinta atenuada (ejes, rótulos) | `#7D8791` | `#8A939B` |
| Filete de grilla | `#E2DFD5` | `#242B31` |
| Línea base / borde | `#CFCBBE` | `#333C44` |
| **Acento (ñire)** | `#C9542B` | `#E0703F` |

### Serie categórica — orden fijo, nunca cíclico

| # | Nombre | Claro | Oscuro |
|---|---|---|---|
| 1 | **Lago** | `#1F6F9E` | `#3E96C7` |
| 2 | **Ñire** | `#C9542B` | `#E0703F` |
| 3 | **Lenga** | `#2E8C6A` | `#3CA87F` |
| 4 | **Coirón** | `#A87C00` | `#B8890A` |
| 5 | **Calafate** | `#6B4E9C` | `#9A82D8` |
| 6 | **Notro** | `#B0475F` | `#D4657C` |

> Resultado de validación — modo claro: banda de luminosidad ✅, piso de croma ✅,
> separación para daltonismo peor par adyacente ΔE 8,6 ✅, visión normal ΔE 15,5 ✅,
> contraste todos ≥ 3:1 ✅. Modo oscuro: los seis controles ✅.
>
> **El orden de las ranuras es el mecanismo de seguridad, no una decisión estética.**
> Reordenar la paleta invalida la verificación. Si hace falta cambiarla, se vuelve a
> correr el validador.

**Tope de series:** más de seis categorías no se representan con color. Se agrupan en
"Otros", se separan en pequeños múltiplos, o se cambia de forma.

### Rampa secuencial (magnitud) — un solo tono

`#E1EBF2` → `#BDD4E3` → `#93B8D0` → `#6499BA` → `#3A7CA2` → `#1F6F9E` → `#16536F`

Para escalas **ordinales** en modo claro, no arrancar más claro que el tercer paso
(`#93B8D0`), que es el primero que despega de la superficie.

### Divergente (polaridad)

**Lago ↔ Ñire**, con gris neutro al medio (`#EDEAE2` claro / `#2A3138` oscuro).
Frío contra cálido, y un medio que lee como "nada". Mismo número de pasos por brazo.

### Estado — reservado, jamás reutilizado como serie

| Rol | Color | Ícono obligatorio |
|---|---|---|
| Bien | `#0CA30C` | ✓ |
| Atención | `#FAB219` | ! |
| Grave | `#EC835A` | ▲ |
| Crítico | `#D03B3B` | ● |

> **El color de estado nunca comunica solo.** Siempre va con ícono y con texto. Un
> semáforo sin palabras es inaccesible para una parte de la población y ambiguo para el
> resto.

## 3. Tipografía

| Rol | Fuente | Uso |
|---|---|---|
| Interfaz y títulos | **Archivo** | Grotesca con eje de ancho. Los títulos usan ancho expandido, que le da carácter institucional sin caer en lo corporativo |
| Datos y rótulos | **JetBrains Mono** | Rótulos en versalita con interletrado, identificadores, cifras en columna |

**Sin serif y sin fuente decorativa en ningún lado**, incluida la cifra protagonista. Una
serif sobre un número grande lee como adorno editorial y rompe el registro institucional.

### Cifras

- Cifra protagonista y valores de tarjeta: **figuras proporcionales**.
- Columnas de tabla y marcas de eje: `tabular-nums`, para que alineen verticalmente.

## 4. Reglas de gráficos — obligatorias

Derivadas de los controles del validador y de las especificaciones de marca:

| Regla | Detalle |
|---|---|
| **Nunca dos ejes verticales** | Dos magnitudes distintas son dos gráficos, o se indexan a base común |
| **Barras ≤ 24px** | Nunca llenar la banda: el aire que sobra es parte del diseño |
| **Extremo redondeado 4px**, cuadrado en la línea base | La barra crece desde una sola base |
| **Líneas de 2px**, unión y remate redondeados | |
| **Marcadores ≥ 8px** de diámetro | Con anillo de 2px del color de la superficie |
| **Separación de 2px** entre marcas que se tocan | El blanco separa; nunca un borde dibujado |
| **Relleno de área al 10%** de opacidad | Un velo, no un bloque |
| **Grilla en filete de 1px sólido**, nunca punteada | Retrocede |
| **Leyenda siempre con 2+ series**, nunca con una sola | Con una serie, el título ya dice qué es |
| **Etiquetado selectivo** | El extremo, el último punto, el del que habla el título. Nunca todos |
| **El texto no usa el color de la serie** | La identidad la da la marca de color al lado, no el texto coloreado |
| **Toda vista gráfica tiene vista de tabla** | A un clic |

## 5. Componentes

| Componente | Especificación |
|---|---|
| Tarjeta | Superficie de papel, filete de 1px, radio 10px, **sin sombra** |
| Rótulo | JetBrains Mono, 11px, mayúsculas, interletrado 0.08em, tinta atenuada |
| Cifra protagonista | Archivo, ≥ 48px, peso 600, tinta primaria. **Una sola por vista** |
| Tarjeta de indicador | rótulo · valor · variación con signo y período · minigráfico opcional |
| Medidor | El relleno lleva la severidad; la pista es un paso más claro del mismo tono |
| Tabla | Filete entre filas, encabezado en rótulo mono, números tabulares |
| Textura de fondo | Curvas de nivel en SVG, 2% de opacidad. Solo en cabeceras |

## 6. Modo oscuro

**Elegido, no invertido.** Cada paso oscuro fue re-derivado para la superficie oscura y
validado contra ella. Un modo oscuro generado invirtiendo la luminosidad produce colores
fuera de banda y pares indistinguibles — es el error más común.

Se soporta la preferencia del sistema operativo y el interruptor manual, y **el manual
gana en ambos sentidos**.

## 7. Lo que este sistema no hace

| ❌ | Por qué |
|---|---|
| Degradados de color | Es la marca visual de la plantilla genérica |
| Sombras difusas grandes | Ruido visual sin información |
| Vidrio esmerilado | Baja el contraste, molesta a quien tiene baja visión |
| Iconografía redondeada infantil | Es un programa público, no una aplicación de hábitos |
| Animaciones de entrada | Retrasan la lectura del dato. Solo transiciones de estado, ≤ 150ms |
| Emojis en la interfaz | Se ven distinto en cada sistema y bajan el registro institucional |
