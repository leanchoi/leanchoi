/* Seed demo: 3 operadores con sitios white-label + inventario del master,
 * disponibilidad futura, historial de ordenes y eventos de trafico para que
 * los paneles de insights muestren datos reales desde el primer arranque.
 * Idempotente: si ya existe el usuario master, no vuelve a cargar. */
import { PrismaClient, ListingType, OrderStatus, SalesChannel, EventType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// RNG determinista para que el seed sea reproducible
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260712);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const img = {
  horses1: "https://images.unsplash.com/photo-1450052590821-8bf91254a353?w=1600&q=80",
  horses2: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=1600&q=80",
  field: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=1600&q=80",
  kayak: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80",
  river: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80",
  paddle: "https://images.unsplash.com/photo-1472745433479-4556f22e32c2?w=1600&q=80",
  mountain1: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1600&q=80",
  mountain2: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=80",
  lake: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80",
  wine: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80",
  vineyard: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1600&q=80",
  city: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1600&q=80",
  craft: "https://images.unsplash.com/photo-1528396518501-b53b655eb9b3?w=1600&q=80",
  gift: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?w=1600&q=80",
};

async function main() {
  const exists = await db.user.findUnique({ where: { email: "admin@andar.local" } });
  if (exists) {
    console.log("Seed ya cargado, no se repite.");
    return;
  }

  const password = await bcrypt.hash("andar2026", 10);

  await db.platformSetting.upsert({
    where: { key: "commission_pct" },
    create: { key: "commission_pct", value: "10" },
    update: {},
  });

  // ── Usuarios y tenants ──────────────────────────────────────────────────────
  await db.user.create({
    data: { email: "admin@andar.local", passwordHash: password, name: "Leandro (Master)", role: "MASTER" },
  });

  const pepito = await db.tenant.create({
    data: {
      slug: "pepito",
      name: "Pepito Cabalgatas",
      tagline: "Cabalgatas serranas al ritmo del campo",
      contactEmail: "hola@pepitocabalgatas.com",
      whatsapp: "+54 9 3541 555001",
      siteConfig: {
        template: "campo",
        theme: {
          bg: "#F7F4EF", ink: "#241E19", primary: "#A14E2C", accent: "#44576D",
          muted: "#7A6F63", card: "#FFFFFF", radius: "soft", font: "clasica",
        },
        blocks: [
          { type: "hero", title: "El campo se conoce a caballo", subtitle: "Cabalgatas guiadas por las sierras de Córdoba, para todos los niveles.", image: img.horses1, ctaLabel: "Reservar cabalgata", layout: "split" },
          { type: "featured", title: "Nuestras cabalgatas", listingType: "ALL" },
          { type: "stats", items: [{ value: "14", label: "años cabalgando" }, { value: "9.000+", label: "jinetes felices" }, { value: "12", label: "caballos propios" }] },
          { type: "story", title: "Una tradición familiar", body: "Arrancamos en 2012 con tres caballos y un rebenque prestado. Hoy somos la cabalgata más elegida de las sierras: seguimos saliendo en grupos chicos, con mates, historias y caballos criados por nosotros.", image: img.horses2, imageSide: "right" },
          { type: "testimonials", items: [
            { quote: "La cabalgata al atardecer es de otro planeta. Volvemos seguro.", name: "Carla M.", origin: "Buenos Aires" },
            { quote: "Nunca había montado y me sentí cuidada todo el tiempo.", name: "Sofía R.", origin: "Rosario" },
            { quote: "El asado de después, imperdible.", name: "Diego P.", origin: "Córdoba" },
          ] },
          { type: "faq", title: "Preguntas frecuentes", items: [
            { q: "¿Necesito experiencia previa?", a: "No. Tenemos caballos mansos y guías que te acompañan todo el recorrido." },
            { q: "¿Qué llevo?", a: "Pantalón largo, calzado cerrado y abrigo. El casco lo ponemos nosotros." },
            { q: "¿Hay límite de edad?", a: "Desde 8 años. Menores siempre acompañados por un adulto." },
          ] },
          { type: "cta", title: "Las sierras te esperan", subtitle: "Reservá tu lugar: los grupos son chicos y se llenan rápido.", buttonLabel: "Reservar ahora" },
        ],
      },
    },
  });

  const delta = await db.tenant.create({
    data: {
      slug: "delta",
      name: "Delta Kayak",
      tagline: "Remadas por los arroyos del Tigre",
      contactEmail: "info@deltakayak.com.ar",
      whatsapp: "+54 9 11 555002",
      commissionPct: 12,
      siteConfig: {
        template: "litoral",
        theme: {
          bg: "#FBFAF7", ink: "#13202E", primary: "#1D4ED8", accent: "#0E7490",
          muted: "#5B6B7A", card: "#FFFFFF", radius: "round", font: "moderna",
        },
        blocks: [
          { type: "hero", title: "El Delta, a tu ritmo", subtitle: "Travesías en kayak por arroyos escondidos, a 50 minutos de Buenos Aires.", image: img.kayak, ctaLabel: "Reservar travesía", layout: "full" },
          { type: "featured", title: "Salidas y alquileres", listingType: "ALL" },
          { type: "story", title: "Remamos acá desde chicos", body: "Somos isleños. Conocemos cada arroyo, cada atajo y cada garza del Delta. Las salidas son en grupos de hasta 10 kayaks con dos guías, aptas para principiantes.", image: img.paddle, imageSide: "left" },
          { type: "gallery", title: "Postales del Delta", images: [img.kayak, img.river, img.paddle, img.lake] },
          { type: "cta", title: "Sumate a la próxima remada", buttonLabel: "Ver fechas" },
        ],
      },
    },
  });

  const cumbres = await db.tenant.create({
    data: {
      slug: "cumbres",
      name: "Cumbres Andinas",
      tagline: "Trekking y vino de altura en Mendoza",
      contactEmail: "hola@cumbresandinas.ar",
      whatsapp: "+54 9 261 555003",
      siteConfig: {
        template: "cumbre",
        theme: {
          bg: "#141311", ink: "#F2EDE4", primary: "#D9A566", accent: "#8C9A84",
          muted: "#9C948A", card: "#1E1C19", radius: "sharp", font: "fuerte",
        },
        blocks: [
          { type: "hero", title: "La montaña no se cuenta. Se sube.", subtitle: "Trekkings guiados y experiencias de vino de altura en plena cordillera.", image: img.mountain1, ctaLabel: "Ver salidas", layout: "split" },
          { type: "featured", title: "Expediciones y catas", listingType: "ALL" },
          { type: "stats", items: [{ value: "3.960 m", label: "nuestra cumbre más alta" }, { value: "100%", label: "guías certificados AAGM" }, { value: "4.8★", label: "puntaje promedio" }] },
          { type: "story", title: "Montaña con los pies en la tierra", body: "Guiamos grupos chicos con seguridad profesional y logística completa. Después de cada cumbre, brindamos con malbec de viñedos a 1.500 metros.", image: img.vineyard, imageSide: "right" },
          { type: "cta", title: "Tu próxima cumbre empieza hoy", buttonLabel: "Reservar expedición" },
        ],
      },
    },
  });

  await db.user.createMany({
    data: [
      { email: "pepito@andar.local", passwordHash: password, name: "Pepito", role: "TENANT_ADMIN", tenantId: pepito.id },
      { email: "delta@andar.local", passwordHash: password, name: "Marina", role: "TENANT_ADMIN", tenantId: delta.id },
      { email: "cumbres@andar.local", passwordHash: password, name: "Andrés", role: "TENANT_ADMIN", tenantId: cumbres.id },
    ],
  });

  // ── Listados ────────────────────────────────────────────────────────────────
  type L = {
    tenantId: string | null; type: ListingType; title: string; slug: string; category: string;
    location: string; priceCents: number; images: string[]; shortDescription: string;
    description: string; durationMinutes?: number; capacityPerSlot?: number; stock?: number;
    featured?: boolean; includes?: string[];
  };
  const listings: L[] = [
    {
      tenantId: pepito.id, type: "ACTIVITY", title: "Cabalgata al atardecer en las sierras", slug: "cabalgata-atardecer",
      category: "Cabalgatas", location: "Villa General Belgrano, Córdoba", priceCents: 4500000,
      images: [img.horses1, img.horses2, img.field], durationMinutes: 150, capacityPerSlot: 10, featured: true,
      shortDescription: "Dos horas y media a caballo con la mejor luz del día y mate serrano al volver.",
      description: "Salimos del corral una hora y media antes de la puesta del sol. Subimos por senderos de altura con vistas al valle de Calamuchita, paramos en un mirador natural y volvemos con las primeras estrellas. Al regreso: mate, criollitos y fogón.\n\nApta para principiantes. Grupos de hasta 10 personas con dos guías baqueanos.",
      includes: ["Caballo y casco", "Guía baqueano", "Mate y criollitos", "Seguro de actividad"],
    },
    {
      tenantId: pepito.id, type: "ACTIVITY", title: "Cabalgata día completo con asado criollo", slug: "cabalgata-dia-completo",
      category: "Cabalgatas", location: "Villa General Belgrano, Córdoba", priceCents: 9500000,
      images: [img.horses2, img.field, img.horses1], durationMinutes: 420, capacityPerSlot: 8, featured: true,
      shortDescription: "La experiencia completa: seis horas de sierras, arroyos y un asado de campo.",
      description: "Un día entero a caballo cruzando arroyos, pircas y pastizales de altura. Al mediodía nos espera un asado criollo completo en un puesto serrano, con siesta bajo los árboles antes de emprender la vuelta.\n\nRecomendada para quienes ya hicieron al menos una cabalgata corta.",
      includes: ["Caballo y casco", "Asado criollo con bebida", "Dos guías", "Fotos de la salida"],
    },
    {
      tenantId: pepito.id, type: "ACTIVITY", title: "Clase de equitación para principiantes", slug: "clase-equitacion",
      category: "Cabalgatas", location: "Villa General Belgrano, Córdoba", priceCents: 3000000,
      images: [img.field, img.horses1], durationMinutes: 90, capacityPerSlot: 6,
      shortDescription: "Tu primera vez a caballo, en corral y con instructor. Ideal familias.",
      description: "Clase de 90 minutos en corral: conocer al caballo, cepillarlo, ensillarlo y dar las primeras vueltas al paso y al trote. Pensada para chicos desde 8 años y adultos que arrancan de cero.",
      includes: ["Caballo y casco", "Instructor", "Certificado de primera monta"],
    },
    {
      tenantId: pepito.id, type: "PRODUCT", title: "Poncho serrano de lana tejido a mano", slug: "poncho-serrano",
      category: "Artesanías", location: "Córdoba", priceCents: 8000000, stock: 12,
      images: [img.craft], shortDescription: "Tejido por artesanas de Calamuchita en telar criollo. Lana de oveja pura.",
      description: "Cada poncho lleva dos semanas de telar. Lana de oveja esquilada, hilada y teñida en la zona. Medidas 180x140 cm. Un abrigo para toda la vida, del mismo campo donde cabalgamos.",
      includes: ["Envío a todo el país", "Empaque artesanal"],
    },
    {
      tenantId: delta.id, type: "ACTIVITY", title: "Travesía en kayak por arroyos del Delta", slug: "travesia-delta",
      category: "Kayak", location: "Tigre, Buenos Aires", priceCents: 3800000,
      images: [img.kayak, img.paddle, img.river], durationMinutes: 180, capacityPerSlot: 10, featured: true,
      shortDescription: "Tres horas remando por arroyos angostos donde no entran las lanchas.",
      description: "Salimos del muelle de Tigre en kayaks dobles y nos metemos por arroyos que solo conocen los isleños. Paramos en una playita de arena para nadar y comer fruta. No hace falta experiencia: la primera media hora es de técnica de remado.",
      includes: ["Kayak doble y remo", "Chaleco salvavidas", "Guía isleño", "Fruta e hidratación"],
    },
    {
      tenantId: delta.id, type: "ACTIVITY", title: "Kayak nocturno de luna llena", slug: "kayak-luna-llena",
      category: "Kayak", location: "Tigre, Buenos Aires", priceCents: 5200000,
      images: [img.river, img.kayak], durationMinutes: 150, capacityPerSlot: 8, featured: true,
      shortDescription: "Una remada única bajo la luna, con el Delta en silencio total.",
      description: "Solo tres noches por mes. Remamos al atardecer hasta una zona abierta del río, vemos salir la luna sobre el agua y volvemos con linternas de posición. Cerramos con chocolate caliente en el muelle. Cupos muy limitados.",
      includes: ["Kayak, remo y chaleco", "Luz de posición", "Chocolate caliente", "Dos guías"],
    },
    {
      tenantId: delta.id, type: "ACTIVITY", title: "Alquiler de kayak doble (medio día)", slug: "alquiler-kayak",
      category: "Kayak", location: "Tigre, Buenos Aires", priceCents: 2500000,
      images: [img.paddle], durationMinutes: 240, capacityPerSlot: 12,
      shortDescription: "Llevate un kayak doble por cuatro horas con mapa de arroyos incluido.",
      description: "Para quienes ya reman: alquiler de kayak doble con chalecos, bolso estanco y mapa de circuitos seguros del Delta. Salida y regreso por nuestro muelle en Tigre.",
      includes: ["Kayak doble", "Chalecos", "Bolso estanco", "Mapa de circuitos"],
    },
    {
      tenantId: delta.id, type: "PRODUCT", title: "Bolso estanco 20L Delta Kayak", slug: "bolso-estanco",
      category: "Equipamiento", location: "Tigre, Buenos Aires", priceCents: 3500000, stock: 25,
      images: [img.river], shortDescription: "El bolso que usamos en nuestras travesías. Cierre enrollable, 100% estanco.",
      description: "Bolso estanco de PVC reforzado de 20 litros, cierre enrollable con hebilla y correa de hombro. Es el mismo que usamos todos los días en el río.",
      includes: ["Garantía 1 año"],
    },
    {
      tenantId: cumbres.id, type: "ACTIVITY", title: "Trekking al refugio de altura", slug: "trekking-refugio",
      category: "Trekking", location: "Potrerillos, Mendoza", priceCents: 6000000,
      images: [img.mountain1, img.mountain2, img.lake], durationMinutes: 480, capacityPerSlot: 12, featured: true,
      shortDescription: "Ocho horas de montaña hasta un refugio con la mejor vista del Cordón del Plata.",
      description: "Ascenso guiado por senderos de altura hasta el refugio a 3.200 metros. Almuerzo de montaña con vista al Cordón del Plata y descenso por una quebrada escondida. Exigencia física media: hay que estar acostumbrado a caminar.",
      includes: ["Guía AAGM", "Almuerzo de montaña", "Bastones", "Seguro de montaña"],
    },
    {
      tenantId: cumbres.id, type: "ACTIVITY", title: "Ascenso a cumbre con pernocte", slug: "ascenso-cumbre",
      category: "Trekking", location: "Potrerillos, Mendoza", priceCents: 12000000,
      images: [img.mountain2, img.mountain1], durationMinutes: 1800, capacityPerSlot: 8, featured: true,
      shortDescription: "Dos días, una cumbre de 3.960 metros y una noche bajo un cielo imposible.",
      description: "Expedición de dos días con noche en campamento de altura. Cena caliente, amanecer sobre la cordillera y ataque a cumbre temprano. Equipo grupal incluido; solo traés tu ropa y tu bolsa de dormir (o la alquilás con nosotros).",
      includes: ["Guías AAGM (1 cada 4)", "Carpas y equipo grupal", "Todas las comidas", "Radio y oxímetro"],
    },
    {
      tenantId: cumbres.id, type: "ACTIVITY", title: "Cata de vinos de altura al atardecer", slug: "cata-vinos-altura",
      category: "Enoturismo", location: "Uspallata, Mendoza", priceCents: 7000000,
      images: [img.wine, img.vineyard], durationMinutes: 180, capacityPerSlot: 14,
      shortDescription: "Cinco etiquetas de viñedos a 1.500 metros, con la cordillera de fondo.",
      description: "Una cata guiada por el enólogo de la bodega en una terraza frente a la cordillera. Cinco vinos de parcelas de altura con tabla de quesos y charcutería regional. Traslado desde Uspallata incluido.",
      includes: ["5 etiquetas + tabla regional", "Enólogo anfitrión", "Traslado desde Uspallata"],
    },
    {
      tenantId: cumbres.id, type: "PRODUCT", title: "Malbec de altura — caja x3", slug: "malbec-altura-x3",
      category: "Vinos", location: "Mendoza", priceCents: 9500000, stock: 40,
      images: [img.wine], shortDescription: "Tres malbec de parcelas a 1.500 m, seleccionados en nuestras catas.",
      description: "La caja que se llevan todos los que hacen la cata: tres etiquetas de viñedos de altura elegidas por nuestro enólogo. Incluye notas de cata impresas y envío refrigerado.",
      includes: ["Envío refrigerado", "Notas de cata"],
    },
    // Inventario propio del master (el 100% de estas ventas queda en tu cuenta)
    {
      tenantId: null, type: "ACTIVITY", title: "City tour Buenos Aires a pie", slug: "city-tour-ba",
      category: "City tours", location: "Buenos Aires", priceCents: 2800000,
      images: [img.city], durationMinutes: 180, capacityPerSlot: 15, featured: true,
      shortDescription: "San Telmo, Casa Rosada y Puerto Madero con guías historiadores.",
      description: "Caminata de tres horas por el casco histórico: San Telmo, Plaza de Mayo, Casa Rosada y Puerto Madero. Guías historiadores, grupos reducidos y paradas de café.",
      includes: ["Guía historiador", "Café de especialidad", "Mapa ilustrado"],
    },
    {
      tenantId: null, type: "PRODUCT", title: "Gift card Andar — experiencia sorpresa", slug: "gift-card-andar",
      category: "Regalos", location: "Argentina", priceCents: 5000000, stock: 100,
      images: [img.gift], shortDescription: "Regalá una experiencia de nuestro catálogo. Quien la recibe, elige.",
      description: "Una gift card canjeable por cualquier experiencia del catálogo Andar. Se envía por email con diseño para imprimir o compartir. Validez: 12 meses.",
      includes: ["Envío por email inmediato", "Validez 12 meses"],
    },
  ];

  const created: { id: string; tenantId: string | null; type: ListingType; priceCents: number; capacityPerSlot: number | null }[] = [];
  for (const l of listings) {
    const row = await db.listing.create({
      data: {
        tenantId: l.tenantId, type: l.type, title: l.title, slug: l.slug,
        shortDescription: l.shortDescription, description: l.description, category: l.category,
        location: l.location, durationMinutes: l.durationMinutes ?? null, priceCents: l.priceCents,
        images: l.images, includes: l.includes ?? [], stock: l.stock ?? null,
        capacityPerSlot: l.capacityPerSlot ?? null, status: "PUBLISHED",
        visibleOnMaster: true, featured: l.featured ?? false,
      },
    });
    created.push({ id: row.id, tenantId: row.tenantId, type: row.type, priceCents: row.priceCents, capacityPerSlot: row.capacityPerSlot });
  }

  // ── Disponibilidad futura (45 dias) ────────────────────────────────────────
  const now = new Date();
  for (const listing of created.filter((c) => c.type === "ACTIVITY")) {
    for (let d = 1; d <= 45; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dow = date.getDay();
      // salidas jueves a domingo, mas martes para algunas
      if (![0, 4, 5, 6].includes(dow) && rand() > 0.3) continue;
      const times = rand() > 0.5 ? [10, 17] : [16];
      for (const hour of times) {
        const startsAt = new Date(date);
        startsAt.setHours(hour, 0, 0, 0);
        const capacity = listing.capacityPerSlot ?? 10;
        await db.availabilitySlot.create({
          data: { listingId: listing.id, startsAt, capacity, booked: randInt(0, Math.floor(capacity / 2)) },
        });
      }
    }
  }

  // ── Historial de ordenes (120 dias) ────────────────────────────────────────
  const names = ["Ana Suárez", "Bruno Díaz", "Carla Méndez", "Diego Paz", "Eva Roldán", "Fede Gómez", "Gina López", "Hugo Silva", "Inés Vega", "Juan Cruz"];
  const tenantPct = new Map<string, number>([[delta.id, 12]]);
  let orderIndex = 0;

  for (let d = 120; d >= 1; d--) {
    // crecimiento suave hacia el presente + ruido
    const base = 1.4 + ((120 - d) / 120) * 2.2;
    const count = Math.max(0, Math.round(base + (rand() - 0.4) * 3));
    for (let i = 0; i < count; i++) {
      const listing = pick(created);
      const quantity = listing.type === "ACTIVITY" ? randInt(1, 4) : randInt(1, 2);
      const subtotal = listing.priceCents * quantity;
      const masterOwned = listing.tenantId === null;
      const pct = masterOwned ? 0 : (tenantPct.get(listing.tenantId!) ?? 10);
      const commission = Math.round((subtotal * pct) / 100);
      const roll = rand();
      const status: OrderStatus = roll < 0.82 ? "PAID" : roll < 0.93 ? "PENDING" : "CANCELLED";
      const channel: SalesChannel = rand() < 0.55 ? "MASTER" : "TENANT_SITE";
      const createdAt = new Date(now.getTime() - d * 86400000 + randInt(8, 22) * 3600000);
      orderIndex++;

      await db.order.create({
        data: {
          code: `AND-SEED${String(orderIndex).padStart(4, "0")}`,
          tenantId: listing.tenantId, status, channel,
          customerName: pick(names),
          customerEmail: `cliente${orderIndex}@mail.com`,
          subtotalCents: subtotal, commissionCents: status === "PAID" ? commission : commission,
          sellerCents: subtotal - commission,
          createdAt, paidAt: status === "PAID" ? new Date(createdAt.getTime() + 600000) : null,
          mpPaymentId: status === "PAID" ? `demo-${orderIndex}` : null,
          items: {
            create: {
              listingId: listing.id, title: "item", unitPriceCents: listing.priceCents,
              quantity, totalCents: subtotal,
            },
          },
        },
      });

      if (status === "PAID") {
        await db.trackEvent.create({
          data: { type: "PURCHASE", tenantId: listing.tenantId, channel, listingId: listing.id, createdAt },
        });
      }
    }
  }

  // titulos reales en items snapshot
  const items = await db.orderItem.findMany({ where: { title: "item" }, include: { listing: true } });
  for (const item of items) {
    await db.orderItem.update({ where: { id: item.id }, data: { title: item.listing.title } });
  }

  // ── Trafico (vistas de pagina y listado) ───────────────────────────────────
  const trackRows: { type: EventType; tenantId: string | null; channel: SalesChannel; listingId: string | null; createdAt: Date }[] = [];
  for (let d = 120; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86400000);
    const masterViews = randInt(40, 140) + Math.round(((120 - d) / 120) * 80);
    for (let v = 0; v < masterViews; v++) {
      const ts = new Date(day.getTime() + randInt(0, 23) * 3600000);
      const withListing = rand() < 0.5;
      trackRows.push({
        type: withListing ? "LISTING_VIEW" : "PAGE_VIEW",
        tenantId: null, channel: "MASTER",
        listingId: withListing ? pick(created).id : null,
        createdAt: ts,
      });
    }
    for (const t of [pepito, delta, cumbres]) {
      const tenantListings = created.filter((c) => c.tenantId === t.id);
      const views = randInt(10, 45);
      for (let v = 0; v < views; v++) {
        const ts = new Date(day.getTime() + randInt(0, 23) * 3600000);
        const withListing = rand() < 0.45;
        trackRows.push({
          type: withListing ? "LISTING_VIEW" : "PAGE_VIEW",
          tenantId: t.id, channel: "TENANT_SITE",
          listingId: withListing ? pick(tenantListings).id : null,
          createdAt: ts,
        });
      }
    }
  }
  // insert por lotes
  for (let i = 0; i < trackRows.length; i += 2000) {
    await db.trackEvent.createMany({ data: trackRows.slice(i, i + 2000) });
  }

  console.log(`Seed listo: 3 tenants, ${created.length} listados, ${orderIndex} ordenes, ${trackRows.length} eventos.`);
  console.log("Accesos → master: admin@andar.local / andar2026 · tenants: pepito|delta|cumbres@andar.local / andar2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
