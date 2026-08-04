# Airbnb: diagnóstico y estrategia

## Qué pasa (con evidencia, no con suposiciones)

Captura real desde el VPS (`app.cli capture --platform airbnb`):

```
html = 256409 bytes        · bloqueo = False
consent = cerrado          · el cartel de cookies YA NO está en la página
json_responses = 17        · el sitio SÍ habla con su API
room_links = 0 · json_nodes = 0 · dom_cards = 0
BLOQUES REPETIDOS: (ninguno)
title = "Airbnb: alojamientos vacacionales…"   ← el título GENÉRICO de la home
```

La página llega entera, sin captcha, sin error, con el cartel de cookies cerrado
— y **sin un solo alojamiento**. El título es el de la home, no el de una
búsqueda de Esquel.

Eso es un **bloqueo silencioso por reputación de IP**. Airbnb detecta que el
pedido viene de un datacenter y devuelve la cáscara de la aplicación sin
resultados. Está documentado:

> *"a datacenter IP in the wrong country returns skewed or empty results, while
> querying from a residential or mobile IP in the target city gives the listings
> and prices a real local searcher would see"*
> — [Bright Data](https://brightdata.com/blog/how-tos/how-to-scrape-airbnb-guide)

> *"Airbnb deploys Cloudflare Enterprise bot protection that blocks datacenter
> IPs before they reach the application layer."*
> — [DEV Community](https://dev.to/agenthustler/how-to-scrape-airbnb-in-2026-listings-prices-and-property-data-2ebf)

**Consecuencia práctica: no hay parser ni selector que arregle esto.** Se
probaron —y todas funcionan correctamente— la intercepción de la API, la lectura
del JSON embebido, el DOM, el barrido de `/rooms/` y una capa estructural que
sobrevive a que renombren el esquema. Todas devuelven cero porque **en la página
no hay datos**, no porque no sepamos leerlos.

Booking funciona bien desde la misma IP: no es un problema del servidor ni del
código.

## La estrategia: no depender de una sola fuente

En vez de seguir parcheando el extractor, cada plataforma tiene una **fuente de
datos configurable**. Si una plataforma endurece sus defensas, se cambia la
fuente por configuración, sin esperar a que alguien reescriba código.

| Fuente | Qué es | Cuándo conviene |
|---|---|---|
| `browser` | Nuestro Playwright | Booking (anda perfecto). Airbnb **sólo con proxy residencial** |
| `apify` | Un actor de Apify | Ellos ponen los proxies y mantienen el scraper. Se paga por resultado |
| `http` | Cualquier API JSON de terceros | Si contratás otro proveedor |

### Opción A — Proxy residencial (seguimos con nuestro scraper)

```bash
# .env  — sólo para Airbnb: Booking no necesita proxy y así no se paga de más
PROXY_URL_AIRBNB=http://usuario:clave@host-residencial:puerto
```

Costo típico: desde ~US$2,5/GB. Con imágenes bloqueadas, cada búsqueda ronda
0,3–1 MB.

### Opción B — Apify (no mantenemos scraper de Airbnb)

```bash
AIRBNB_PROVIDER=apify
APIFY_TOKEN=xxxxxxxx
APIFY_ACTOR=tri_angle~airbnb-scraper
```

Costo típico: ~US$1,25–3 por 1.000 alojamientos devueltos.

### Opción C — Otra API

```bash
AIRBNB_PROVIDER=http
AIRBNB_API_URL=https://proveedor/buscar?q={query}&in={checkin}&out={checkout}
AIRBNB_API_KEY=xxxx
AIRBNB_API_PATH=data.results
```

## Ojo con el volumen (esto importa para el costo)

El preset BENCHMARK mide **9 destinos × ~107 noches = ~963 búsquedas por día**.
Con una fuente que se paga por uso, eso es caro sin necesidad: para leer un
mercado no hace falta medir Airbnb todos los días a 107 noches.

Recomendación: para Airbnb, bajar el alcance a los checkpoints y a un rolling
corto (7–14 días). Se configura por familia, sin tocar código, y baja el costo
en un orden de magnitud sin perder la lectura del mercado.

## Cómo verificar

```bash
docker exec metrica-app python -m app.cli doctor          # dice qué fuente usa cada plataforma
docker exec metrica-app python -m app.cli capture --platform airbnb --query Esquel
```

En **Ejecuciones**, el estado distingue las causas:

- `sin resultados` → la plataforma devolvió la página vacía (esto: falta proxy/fuente)
- `markup` → había datos y el extractor no los leyó (esto sí se arregla con código)
- `bloqueado` → captcha explícito
- `sin recursos` → el servidor se quedó sin procesos/memoria
