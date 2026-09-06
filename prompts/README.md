# Prompts de implementación

Prompts listos para pegar en un agente de código (Antigravity, Claude Code, Cursor…).
Uno por tarea, en orden de prioridad. Cada uno es autocontenido.

**Antes del primero:** el agente debe tener acceso a este repo y leer
[`../AGENTS.md`](../AGENTS.md). Si tu herramienta soporta un archivo de reglas
persistente, apuntalo a `AGENTS.md` para que se relea en cada tarea.

| Orden | Prompt | Fase | Por qué en este lugar |
|---|---|---|---|
| 1 | [`00-arranque.md`](00-arranque.md) | F0-1, F0-3, **F1a** | **Urgente.** El dato de precios es perecedero: cada día sin capturar es una curva de anticipación que no se recupera |
| 1b | [`00b-correccion-f1a.md`](00b-correccion-f1a.md) | corr. | **Urgente tras la primera corrida.** Cuatro correcciones al colector antes de que acumule serie; dos no se pueden reparar después |
| 1c | [`00c-correccion-bronce.md`](00c-correccion-bronce.md) | corr. | Disco (el crudo pesa 2 MB/consulta), calendario de servicio, canario en rutas finas y política de tope para F1b |
| 1d | [`00d-filtro-pertinencia.md`](00d-filtro-pertinencia.md) | corr. | Itinerarios internacionales contaminando la serie de cabotaje, huecos sin explicar y gobernanza del panel de consulta |
| 1e | [`00e-superficie-de-oferta.md`](00e-superficie-de-oferta.md) | corr. | Barrido de calendario completo hasta el fin de la ventana de venta, spike del grid de fechas y tabla ordenable |
| 1f | [`00f-correccion-cifra-titular.md`](00f-correccion-cifra-titular.md) | corr. | La brecha por km publicada está mal calculada y en contra nuestra; pendientes de 1d/1e; dónde vive el cálculo |
| 2 | [`01-panel-historico.md`](01-panel-historico.md) | F2b | Primer valor real sin scrapear nada. ANAC es backfilleable, no corre riesgo |
| 3 | [`02-catalogo-semantico.md`](02-catalogo-semantico.md) | — | Va **antes** de construir vistas. Definir los nombres después de las pantallas es cómo se llega al despelote |
| 4 | [`03-colector-completo.md`](03-colector-completo.md) | F1b | Sobre lo que F1a ya dejó andando |
| 5 | [`04-contrato-metrica.md`](04-contrato-metrica.md) | F2 | Paralelizable con 3 y 4 |
| 6 | [`05-tablas-oro.md`](05-tablas-oro.md) | F3 | Necesita 2, 4 y 5 |
| 7 | [`06-secciones-tablero.md`](06-secciones-tablero.md) | F4 | Primer valor visible para el usuario |
| 8 | [`07-modelos-y-alerta.md`](07-modelos-y-alerta.md) | F5, F6 | Paralelizable con 7 |

## Cómo usarlos

* **Uno por vez, hasta sus criterios de aceptación.** El plan está desacoplado para que
  cada pieza entre a producción sola; adelantar trabajo rompe esa propiedad.
* **Los prompts 4 y 5 se pueden correr en paralelo** si tu herramienta lanza varios
  agentes. Los demás tienen dependencias reales.
* Si tu herramienta genera un plan o lista de tareas antes de ejecutar, usala: los
  criterios de aceptación de cada prompt sirven directo como checklist.
* Si tiene navegador integrado, usalo para verificar el frontend en el prompt 7 en lugar
  de asumir que renderiza.

## Lo que NO hay que pedirle al agente

Rediscutir el diseño. Las decisiones cerradas están en `AGENTS.md` §6 con su fundamento
en `docs/00`. Un agente potente, si le dejás la puerta abierta, va a proponer PostgreSQL
para los aéreos, vistas materializadas en Métrica y Amadeus como fallback — las tres se
evaluaron y se descartaron por razones que están escritas.
