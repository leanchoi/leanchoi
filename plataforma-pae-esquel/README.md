# Trocha — Plataforma de Gestión del PAE

**Sistema de gestión, trazabilidad e impacto del Programa de Apoyo a la Educación (PAE).**
Municipalidad de Esquel · Provincia del Chubut · Argentina.

> *Trocha*: la vía angosta que abrió el camino en la cordillera, y el sendero que se
> abre a machete en el monte. Nadie llega solo; alguien abrió el paso antes.
> Es el nombre del sistema y es la tesis del programa.

---

## Qué problema resuelve

El PAE hoy puede responder **cuánto gastó** y **a cuántos alcanzó**. No puede responder
**qué cambió en la vida de esas personas**. Esa brecha —entre el *output* y el *outcome*—
es la que convierte un programa educativo en un gasto indefendible cuando llega el
momento de discutir el presupuesto.

Trocha cierra esa brecha con cuatro movimientos:

| # | Movimiento | De | A |
|---|---|---|---|
| 1 | **Trazabilidad** | Padrón en planilla, foto anual | Padrón vivo, auditable, con historial |
| 2 | **Logística real** | Horas comunitarias firmadas en papel | Check-in verificable con evidencia y geocerca |
| 3 | **Acompañamiento** | Rendición de gastos mensual | Alerta temprana + protocolo de intervención con SLA |
| 4 | **Retorno** | Beca que termina en el título | Puente al trabajo local y medición de arraigo |

---

## Estado del repositorio

Esto es **un proyecto de diseño y una especificación ejecutable**, no un sistema en
producción. Contiene:

```
docs/          El informe de consultoría completo (diagnóstico, benchmark, KPIs,
               arquitectura, gobernanza de datos, plan de implementación, comunicación)
docs/adr/      Decisiones de arquitectura registradas, con su fundamento
design/        El sistema visual: paleta validada, tipografía, componentes
prototipo/     Prototipo navegable en HTML estático — se abre sin instalar nada
prompts/       El prompt de implementación para Antigravity (build completo en VPS)
infra/         Docker Compose, Caddy, variables de entorno, guía de despliegue
schema/        Modelo de datos (Prisma) — el contrato entre los módulos
interno/       ⚠ Estrategia política. NO se comparte fuera del círculo de confianza.
```

### Ver el prototipo

```bash
cd prototipo && python3 -m http.server 4173
# abrir http://localhost:4173
```

No requiere build, ni npm, ni conexión: todo el prototipo es HTML + CSS + JS sin
dependencias. Las cifras que muestra son **datos sintéticos de demostración** y están
marcadas como tales en pantalla.

### Implementar el sistema real

`prompts/ANTIGRAVITY-BUILD.md` es un prompt de ingeniería completo y autocontenido:
stack, modelo de datos, reglas de negocio, criterios de aceptación, plan de despliegue
en VPS y contrato visual. Está escrito para que un agente de codificación lo ejecute
de punta a punta.

---

## Antes de mostrar esto a alguien

Leé **`CONTEXTO-Y-SUPUESTOS.md`**. Separa explícitamente lo que está verificado con
fuente pública de lo que es supuesto de trabajo pendiente de confirmar con el área.
Presentar un supuesto como dato es la forma más rápida de perder una reunión.

---

## Orden de lectura sugerido

1. `docs/00-resumen-ejecutivo.md` — 6 minutos, es lo que se lee antes de una reunión
2. `docs/01-diagnostico-sectorial.md` — por qué el modelo actual falla
3. `docs/04-arquitectura-producto.md` — qué se construye
4. `docs/08-plan-implementacion.md` — en qué orden y con qué reloj
5. `interno/` — cómo se convierte en decisión política

---

*Documento de trabajo. Ninguna cifra de este repositorio debe citarse públicamente sin
validación previa del área responsable del programa.*
