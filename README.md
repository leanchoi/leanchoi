# Esquel 2027

RPG voxel online en el navegador, ambientado en la ciudad de **Esquel (Chubut,
Argentina)**: simulación política satírica, militancia territorial en tiempo real y
un motor de inteligencia que mide el pulso del pueblo barrio por barrio.

> **Estado: PROMPT 0 — base arquitectónica.** Están definidos los contratos, el
> esquema de datos, las fórmulas de balance y la estructura del repositorio. El
> código de cliente y servidor arranca en la Fase 1.

---

## Los tres pilares

**Ciudad voxel georreferenciada.** La cuadrícula real de Esquel —Av. Alvear, 25 de
Mayo, San Martín, Fontana, Rivadavia, la Plaza San Martín, La Trochita— con la
silueta de La Hoya, el Cerro 21 y La Zeta al fondo. Hora local (UTC-3) y clima en
vivo: si en Esquel está nevando, en el juego está nevando, y los afiches se despegan
antes.

**Militancia como bucle de juego.** Diez rangos, de *Chopanero* a *Candidato
Provincial*. Se sube pegando afiches, repartiendo volantes, cebando mates, ganando
duelos de chicana en la esquina y sosteniendo movilizaciones donde nueve militantes
coordinados valen más que catorce dispersos — literalmente, la fórmula lo dice.

**El pulso del pueblo.** Un onboarding de 30 segundos y la telemetría del juego
alimentan un motor de inteligencia que mapea sentimiento e intención de voto por
barrio y franja etaria, siempre con seudónimo rotativo, k-anonimato ≥ 15 y
consentimiento revocable.

## Arquitectura en una línea

Navegador (Three.js) ⇄ **Hostinger** (PHP 8 + MySQL: identidad, datos, inteligencia)
y ⇄ **VPS** (Node + Colyseus: mundo autoritativo, misiones, voz espacial).
Detalle en [`docs/architecture/deployment-dual.md`](docs/architecture/deployment-dual.md).

## Estructura

```
client/       Cliente 3D voxel (Three.js + Vite)          → estático en Hostinger
server-vps/   Servidor autoritativo (Node + Colyseus)     → VPS Linux
backend-php/  API REST, identidad, MySQL, inteligencia    → Hostinger
shared/       Contratos, constantes y fórmulas            → lo importan los tres
tools/        Pipelines de datos e integridad de CI
docs/         Arquitectura, diseño y políticas
```

Responsabilidad archivo por archivo en
[`docs/architecture/monorepo.md`](docs/architecture/monorepo.md).

## Arranque

```bash
npm install
npm run check:all        # typecheck + balance + schemas

# base de datos
mysql -u USER -p DB < backend-php/database/schema.sql
for f in backend-php/database/seeds/*.sql; do mysql -u USER -p DB < "$f"; done
```

Requiere Node ≥ 20.11 (≥ 22.6 para correr los scripts TS sin `tsx`), PHP ≥ 8.1 y
MySQL 8 o MariaDB 10.6+.

## Verificaciones

| Comando | Qué garantiza |
|---|---|
| `npm run typecheck` | `strict` completo en `/shared` y `/tools` |
| `npm run check:balance` | Que fórmulas, tabla de rangos y seeds SQL no puedan divergir, y que se cumplan las 7 invariantes de diseño |
| `npm run validate:schemas` | Que el JSON Schema compile, que los ejemplos validen y que el tipo TypeScript esté en paridad |

## Documentación

| Documento | Para qué |
|---|---|
| [Estructura del monorepo](docs/architecture/monorepo.md) | Qué hace cada carpeta y cada archivo |
| [Despliegue dual](docs/architecture/deployment-dual.md) | Hostinger + VPS, API REST, flujos, escalado, seguridad |
| [Fórmulas de balance](docs/game-design/balance-formulas.md) | Toda la matemática del juego |
| [Privacidad y telemetría](docs/architecture/privacidad-telemetria.md) | Reglas duras del motor de inteligencia |
| [Política editorial](docs/game-design/politica-editorial.md) | Hasta dónde llega la sátira |
| [Traspaso al PROMPT 1](docs/prompts/PROMPT-1-handoff.md) | Plan de fases, auditoría y decisiones pendientes |

## Advertencias

Las facciones, los cargos y los personajes del juego son **ficticios**. La sátira
apunta a prácticas políticas, no a personas reales identificables; el detalle está en
la política editorial y es vinculante para todo el contenido.

Los cortes de intención de voto que produce el motor **no son una encuesta
representativa** del padrón de Esquel: la muestra es autoseleccionada y todo reporte
sale con su tamaño de muestra y su margen de error a la vista.
