# ADR-002 · Monolito modular, no microservicios

**Estado:** aceptada · **Fecha:** septiembre 2026

## Contexto

El sistema tiene diez módulos funcionales. El equipo de desarrollo es, realistamente,
**una persona**, con posibilidad de sumar una o dos más. La infraestructura disponible es
un VPS. No hay presupuesto de operaciones ni guardia 24×7.

## Decisión

**Una sola aplicación, desplegada como una unidad, con separación estricta de módulos
por límites internos.** Un solo despliegue, una sola base de datos, un solo registro de
logs.

## Fundamento

- Los microservicios resuelven problemas de **escala organizacional** (muchos equipos
  que despliegan sin coordinarse), no de complejidad funcional. Acá no hay muchos equipos.
- Con una persona, la complejidad distribuida es puro costo: fallas parciales,
  consistencia eventual, trazas repartidas, más piezas que se pueden caer de noche.
- Una base de datos relacional única permite transacciones y consultas analíticas
  directas, que es exactamente lo que este sistema necesita.
- El volumen previsto —cientos a miles de registros— no justifica escalado horizontal ni
  de cerca.

## Consecuencias

**Positivas:** despliegue simple y reproducible; depuración directa; integridad
transaccional garantizada; costo de infraestructura marginal; una persona puede sostenerlo.

**Negativas:** todo escala junto; un error grave puede afectar toda la aplicación;
requiere disciplina para que los módulos no se enreden entre sí.

**Mitigación de la disciplina:** los módulos se comunican por interfaces explícitas y
está prohibido que un módulo consulte directamente las tablas de otro. Eso deja abierta
la posibilidad de extraer un módulo el día que haga falta — sin pagar hoy el costo de
suponer que hará falta.
