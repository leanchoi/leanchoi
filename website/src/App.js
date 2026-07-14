import React, { useState, useEffect } from 'react';
import { Icon, ContainerIllu } from './components/Brand';
import { useReveal, useScroll, useParallax } from './hooks';

/* ---------- Datos de contacto ---------- */
const PHONE_DISPLAY = '+54 9 2945 59-5655';
const WHATSAPP = 'https://wa.me/5492945595655?text=' + encodeURIComponent('Hola Base Sur, quiero cotizar un contenedor marítimo.');
const EMAIL = 'info@basesurcontainers.com';
const INSTAGRAM = 'https://instagram.com/basesurcontainers';
const FACEBOOK = 'https://facebook.com/basesurcontainers';

const NAV_LINKS = [
  { href: '#contenedores', label: 'Contenedores' },
  { href: '#medidas', label: 'Medidas' },
  { href: '#usos', label: 'Usos' },
  { href: '#contacto', label: 'Contacto' },
];
const goQuote = () => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' });

/* ---------- NAV ---------- */
function Nav() {
  const { scrolled } = useScroll();
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);
  return (
    <>
      <nav className={scrolled ? 'scrolled' : ''}>
        <div className="nav-inner">
          <a href="#hero" aria-label="Base Sur Containers"><img className="nav-logo" src="/logo-glyph.png" alt="Base Sur Containers" /></a>
          <div className="nav-links">
            {NAV_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a href="#contacto" className="btn btn-cta">Cotizar mi contenedor</a>
          </div>
          <button className={`nav-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label="Menú"><span /><span /><span /></button>
        </div>
      </nav>
      <div className={`mobile-menu ${open ? 'open' : ''}`}>
        {NAV_LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
        <a href="#contacto" className="btn btn-cta" onClick={() => setOpen(false)}>Cotizar mi contenedor</a>
      </div>
    </>
  );
}

/* ---------- HERO ---------- */
function Hero() {
  const bg = useParallax(0.12);
  return (
    <section id="hero">
      <div className="hero-bg img-slot img-estepa" ref={bg} />
      <div className="container">
        <div className="hero-content">
          <div className="eyebrow reveal in">Base Sur · Patagonia Argentina</div>
          <h1 className="h1 reveal in reveal-delay-1">Venta de <span className="accent">contenedores marítimos</span> en Patagonia</h1>
          <p className="hero-support reveal in reveal-delay-2">Unidades <strong>one trip</strong> y <strong>usadas/en excelente estado</strong> para almacenamiento, obra, campo, logística y proyectos propios.</p>
          <div className="hero-buttons reveal in reveal-delay-3">
            <a href="#contacto" className="btn btn-cta">Cotizar mi contenedor</a>
            <a href="#medidas" className="btn btn-ghost">Ver medidas y opciones <span className="arrow">→</span></a>
          </div>
          <p className="hero-note reveal in reveal-delay-3">Imagen de referencia de uso posible. Base Sur comercializa contenedores; no realiza intervenciones sobre las unidades.</p>
        </div>
      </div>
      <div className="scroll-cue"><div className="line" /><span>Scroll</span></div>
    </section>
  );
}

/* ---------- BANDA DECLARATIVA ---------- */
const ClaimBand = () => (
  <div className="claim-band">
    <div className="container reveal">
      <img className="claim-glyph" src="/logo-glyph.png" alt="" aria-hidden="true" />
      <div>
        <h2>Vendemos contenedores marítimos. No unidades intervenidas.</h2>
        <p>Base Sur comercializa el contenedor como activo físico versátil. El asesoramiento, la cotización de envío y la coordinación de descarga son servicios adicionales que se presupuestan por separado.</p>
      </div>
    </div>
  </div>
);

/* ---------- CONTENEDORES DISPONIBLES ---------- */
const TYPES = [
  { v: '20', title: '20 pies estándar', text: 'Unidad compacta, práctica y versátil. Ideal para almacenamiento, herramientas, materiales de obra o espacios donde el acceso y el terreno son limitados.' },
  { v: '40', title: '40 pies estándar', text: 'Mayor capacidad de carga y guardado. Conveniente para volumen, resguardo de mercadería, insumos, maquinaria liviana o equipamiento.' },
  { v: '40hc', title: '40 pies High Cube', text: 'Similar al 40 estándar, pero con mayor altura interior. Recomendado cuando se necesita más volumen útil o mayor comodidad para proyectos posteriores.' },
];
const Types = () => (
  <section id="contenedores">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Contenedores disponibles</div>
        <h2 className="h2 reveal reveal-delay-1">Unidades marítimas para distintos usos.</h2>
        <p className="body-text reveal reveal-delay-2" style={{ marginTop: '20px' }}>Trabajamos con unidades sujetas a disponibilidad. Cada operación se cotiza según tipo de contenedor, estado, ubicación, transporte y descarga. Consultá por fotos reales, medidas y condiciones antes de confirmar la compra.</p>
      </div>
      <div className="types-grid">
        {TYPES.map((t, i) => (
          <article key={t.v} className={`type-card reveal reveal-delay-${i + 1}`}>
            <ContainerIllu className="type-illu" variant={t.v} />
            <h3 className="h3">{t.title}</h3>
            <p>{t.text}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

/* ---------- MEDIDAS ---------- */
const MEASURES = [
  ['20 pies estándar', '6,06 × 2,44 × 2,59 m', '5,90 × 2,35 × 2,39 m', '2,34 × 2,29 m', '33,2 m³'],
  ['40 pies estándar', '12,19 × 2,44 × 2,59 m', '12,03 × 2,35 × 2,39 m', '2,34 × 2,29 m', '67,7 m³'],
  ['40 pies High Cube', '12,19 × 2,44 × 2,89 m', '12,03 × 2,35 × 2,70 m', '2,34 × 2,60 m', '76,3 m³'],
];
const Measures = () => (
  <section id="medidas" className="section-alt">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Medidas y capacidades</div>
        <h2 className="h2 reveal reveal-delay-1">Medidas de referencia.</h2>
      </div>
      <div className="measures reveal reveal-delay-2">
        <table>
          <thead>
            <tr><th>Unidad</th><th>Exterior aprox.</th><th>Interior aprox.</th><th>Puerta aprox.</th><th>Capacidad</th></tr>
          </thead>
          <tbody>
            {MEASURES.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="note-small reveal">Las medidas son orientativas y pueden variar según fabricante, año, serie y tipo de unidad. Antes de concretar la operación se confirma estado, fotos, ubicación, condiciones de entrega y datos técnicos de la unidad ofrecida.</p>
    </div>
  </section>
);

/* ---------- ONE TRIP VS USADO ---------- */
const States = () => (
  <section id="estado">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Estado de la unidad</div>
        <h2 className="h2 reveal reveal-delay-1">One trip y usado, sin confusiones.</h2>
      </div>
      <div className="split2">
        <div className="state-block reveal">
          <span className="tagline">One trip</span>
          <h3 className="h3">Muy bajo uso</h3>
          <p>Unidades generalmente utilizadas en un solo viaje internacional. Conservan mejor estado estético y estructural, con menores marcas de uso que un contenedor usado tradicional. Una excelente opción cuando se busca una unidad más prolija, durable y visualmente presentable.</p>
        </div>
        <div className="state-block usado reveal reveal-delay-1">
          <span className="tagline">Usado / excelente estado</span>
          <h3 className="h3">Uso previo verificado</h3>
          <p>Unidades marítimas con uso previo, seleccionadas por su funcionalidad y estado general. Pueden presentar marcas, detalles estéticos o desgaste normal del uso logístico, pero son una alternativa sólida y eficiente para almacenamiento, campo, obra y múltiples necesidades operativas.</p>
        </div>
      </div>
    </div>
  </section>
);

/* ---------- USOS POSIBLES ---------- */
const USES = [
  { icon: 'campo', img: 'img-campo', title: 'Campo y chacras', text: 'Guardado de herramientas, alimento balanceado, insumos, monturas, equipamiento, repuestos o materiales de temporada.' },
  { icon: 'obra', img: 'img-obra', title: 'Obra y construcción', text: 'Pañol, depósito de materiales, resguardo de herramientas, equipamiento y apoyo operativo en obra.' },
  { icon: 'comercio', img: 'img-turismo', title: 'Comercios y emprendimientos', text: 'Stock, mercadería, archivos, mobiliario, insumos o respaldo logístico.' },
  { icon: 'logistica', img: 'img-vivienda', title: 'Logística y transporte', text: 'Acopio, organización de mercadería, traslado o almacenamiento temporal.' },
  { icon: 'proyecto', img: 'img-hero', title: 'Proyectos propios', text: 'Base para desarrollos del comprador. Base Sur no interviene ni adapta la unidad.' },
];
const Uses = () => (
  <section id="usos" className="section-alt">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Usos posibles</div>
        <h2 className="h2 reveal reveal-delay-1">Un activo versátil, según tu necesidad.</h2>
        <p className="note-small reveal reveal-delay-2" style={{ marginTop: '16px' }}>Imágenes de referencia de usos posibles. Base Sur no realiza intervenciones sobre las unidades.</p>
      </div>
      <div className="uses-grid">
        {USES.map((u, i) => (
          <article key={u.title} className={`use-card reveal reveal-delay-${(i % 3) + 1}`}>
            <div className={`use-bg img-slot ${u.img}`} />
            <Icon name={u.icon} className="use-icon" />
            <div className="use-body"><h3 className="h3">{u.title}</h3><p>{u.text}</p></div>
          </article>
        ))}
      </div>
      <div className="notice reveal">
        <Icon name="verificada" className="ico" />
        <p><strong>Importante:</strong> Base Sur comercializa el contenedor marítimo como unidad física. Cualquier adaptación, intervención, obra, instalación eléctrica, aislación, abertura, terminación o adecuación posterior queda a cargo del comprador o de profesionales externos contratados por él.</p>
      </div>
    </div>
  </section>
);

/* ---------- ENVÍO Y DESCARGA ---------- */
const SHIP = [
  'El precio base corresponde a la unidad, salvo que la cotización indique expresamente otra cosa.',
  'El traslado se cotiza según origen, destino, distancia, tipo de unidad y disponibilidad de transporte.',
  'La descarga se cotiza según el equipo necesario, la accesibilidad del terreno y la complejidad de la maniobra.',
  'Necesitamos que informes ubicación, tipo de acceso, estado del camino, espacio de maniobra, superficie de apoyo y si hay pendientes, cables, árboles u obstáculos.',
  'Base Sur acompaña la coordinación logística; el transporte y la descarga se cobran aparte y quedan presupuestados por escrito.',
];
const Shipping = () => (
  <section id="envio">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Envío y descarga</div>
        <h2 className="h2 reveal reveal-delay-1">Cotizados por separado, con reglas claras.</h2>
      </div>
      <div className="shipping">
        <ul className="ship-list reveal">
          {SHIP.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <div className="ship-cta reveal reveal-delay-1">
          <h3 className="h3">¿Necesitás traslado y descarga?</h3>
          <p>Podemos cotizar el envío y la descarga de tu contenedor según ubicación, accesibilidad y tipo de unidad. Estos servicios se presupuestan por separado y no están incluidos en el precio base, salvo que la cotización lo indique expresamente.</p>
          <button className="btn btn-cta" onClick={goQuote}>Pedir cotización logística</button>
        </div>
      </div>
    </div>
  </section>
);

/* ---------- POR QUÉ BASE SUR ---------- */
const WHY = [
  ['asesoria', 'Asesoramiento', 'Te ayudamos a elegir medida, tipo y estado de unidad según tu necesidad real.'],
  ['claridad', 'Claridad', 'Medidas, estado, fotos y alcance del servicio, sin promesas de intervención.'],
  ['presencia', 'Presencia regional', 'Contenedores para la Comarca Andina, la Patagonia y zonas de influencia.'],
  ['truck', 'Gestión logística', 'Coordinamos traslado y descarga, cotizados por separado y por escrito.'],
  ['verificada', 'Unidades verificadas', 'Confirmamos fotos, estado y datos de cada unidad antes de cerrar la operación.'],
];
const Why = () => (
  <section id="porque" className="section-alt">
    <div className="container">
      <div className="section-head">
        <div className="eyebrow reveal">Por qué Base Sur</div>
        <h2 className="h2 reveal reveal-delay-1">Una compra clara, de principio a fin.</h2>
      </div>
      <div className="why-grid">
        {WHY.map(([icon, t, d], i) => (
          <div className={`why-card reveal reveal-delay-${(i % 3) + 1}`} key={t}>
            <Icon name={icon} className="why-icon" />
            <h3>{t}</h3><p>{d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ---------- FAQ ---------- */
const FAQS = [
  ['¿Base Sur adapta o interviene los contenedores?', 'No. Base Sur vende contenedores marítimos. Las adaptaciones, cortes, instalaciones, aislaciones o terminaciones posteriores quedan a cargo del comprador o de proveedores externos.'],
  ['¿El precio incluye envío y descarga?', 'No, salvo que la cotización lo indique expresamente. Envío y descarga se presupuestan por separado según ubicación, tipo de unidad y condiciones de acceso.'],
  ['¿Qué diferencia hay entre one trip y usado?', 'El one trip es una unidad de muy bajo uso, generalmente con un solo viaje internacional. El usado tuvo más recorrido logístico, puede tener marcas normales de uso y suele ofrecer mejor relación costo-beneficio.'],
  ['¿Puedo usarlo para una vivienda u oficina?', 'El contenedor puede ser usado como base para proyectos propios, pero Base Sur no entrega unidades habitables, oficinas ni módulos terminados.'],
  ['¿Las medidas son exactas?', 'Son medidas de referencia. Pueden variar según fabricante, modelo y unidad disponible. Antes de concretar la compra se confirma la información de la unidad ofrecida.'],
  ['¿Puedo ver fotos reales?', 'Sí. Antes de avanzar compartimos fotos y datos de la unidad disponible, especialmente si es usada.'],
  ['¿Qué necesito para descargar un contenedor?', 'Se debe evaluar terreno, acceso, espacio de maniobra, tipo de camión/equipo y ubicación final. Esa maniobra se cotiza aparte.'],
];
function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow reveal">Preguntas frecuentes</div>
          <h2 className="h2 reveal reveal-delay-1">Lo que conviene saber antes de comprar.</h2>
        </div>
        <div className="accordion reveal reveal-delay-2">
          {FAQS.map(([q, a], i) => (
            <div className={`acc-item ${open === i ? 'open' : ''}`} key={q}>
              <button className="acc-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span className="q">{q}</span><span className="toggle">+</span>
              </button>
              <div className="acc-body" style={{ maxHeight: open === i ? '320px' : '0' }}><p>{a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- COTIZACIÓN ---------- */
function Quote() {
  const [status, setStatus] = useState('');
  const submit = (e) => {
    e.preventDefault();
    setStatus('Enviando…');
    setTimeout(() => setStatus('Gracias. Te contactamos a la brevedad para avanzar con la cotización.'), 700);
    e.target.reset();
  };
  return (
    <section id="contacto" className="section-alt">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow reveal">Cotizá tu contenedor</div>
          <h2 className="h2 reveal reveal-delay-1">Contanos qué necesitás.</h2>
          <p className="body-text reveal reveal-delay-2" style={{ marginTop: '18px' }}>Completá el formulario o escribinos por WhatsApp. Con estos datos preparamos una cotización de unidad y, si lo necesitás, de envío y descarga.</p>
        </div>
        <div className="quote-grid">
          <div className="quote-visual reveal">
            <div className="img-slot img-contacto" />
            <span className="img-label">Imagen de uso posible. Base Sur no interviene las unidades.</span>
          </div>
          <form className="reveal reveal-delay-1" onSubmit={submit}>
            <div className="form-row">
              <div className="field"><label>Nombre y apellido / empresa *</label><input required placeholder="Ej. Mateo Silva" /></div>
              <div className="field"><label>Teléfono / WhatsApp *</label><input type="tel" required placeholder="Cód. área + número" /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Localidad y provincia</label><input placeholder="Ej. El Bolsón, Río Negro" /></div>
              <div className="field"><label>Ubicación aproximada de entrega</label><input placeholder="Zona o paraje" /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Tipo de contenedor *</label>
                <select required defaultValue=""><option value="" disabled>Seleccioná</option>
                  <option>20 pies</option><option>40 pies</option><option>40 High Cube</option>
                  <option>One trip</option><option>Usado</option><option>No sé todavía</option>
                </select>
              </div>
              <div className="field"><label>Uso previsto</label>
                <select defaultValue=""><option value="" disabled>Seleccioná</option>
                  <option>Almacenamiento</option><option>Obra</option><option>Campo</option>
                  <option>Comercio</option><option>Logística</option><option>Proyecto propio</option><option>Otro</option>
                </select>
              </div>
            </div>
            <div className="field"><label>¿Necesitás cotizar envío y descarga?</label>
              <select defaultValue=""><option value="" disabled>Seleccioná</option>
                <option>Sí</option><option>No</option><option>Quiero evaluar</option>
              </select>
            </div>
            <div className="field"><label>Condiciones de acceso</label><textarea placeholder="Camino de ripio, pendiente, portón, cables, árboles, espacio de maniobra, etc." /></div>
            <button type="submit" className="btn btn-cta" style={{ width: '100%', justifyContent: 'center' }}>Enviar consulta</button>
            <div className="form-status">{status}</div>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ---------- FOOTER ---------- */
const Footer = () => (
  <footer>
    <div className="container">
      <div className="footer-grid">
        <div className="footer-brand">
          <img className="footer-logo" src="/logo-full.png" alt="Base Sur Containers · Patagonia Argentina" />
          <p>Venta de contenedores marítimos one trip y usados en la Patagonia. Asesoramiento y coordinación logística.</p>
        </div>
        <div className="footer-col">
          <h4>Contacto</h4>
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <a href={WHATSAPP} target="_blank" rel="noreferrer">WhatsApp {PHONE_DISPLAY}</a>
          <p>Comarca Andina · Patagonia Argentina</p>
          <a href="https://www.basesurcontainers.com">www.basesurcontainers.com</a>
        </div>
        <div className="footer-col">
          <h4>Seguinos</h4>
          <a href={INSTAGRAM} target="_blank" rel="noreferrer">Instagram @basesurcontainers</a>
          <a href={FACEBOOK} target="_blank" rel="noreferrer">Facebook · Base Sur Containers</a>
          <a href="#contenedores">Contenedores</a>
          <a href="#contacto">Cotizar</a>
        </div>
      </div>
      <div className="footer-legal">
        Disponibilidad sujeta a stock y confirmación de unidad. Las medidas publicadas son orientativas. El valor del traslado y la descarga puede variar según ubicación, terreno, equipo requerido y condiciones de acceso. Base Sur no realiza adaptaciones, intervenciones, cortes, aberturas, aislación, instalaciones ni terminaciones sobre las unidades.
        <div className="copy">© 2026 Base Sur Containers.</div>
      </div>
    </div>
  </footer>
);

/* ---------- APP ---------- */
export default function App() {
  const { progress } = useScroll();
  useReveal();
  return (
    <>
      <div className="scroll-progress" style={{ width: `${progress}%` }} />
      <div className="grain" />
      <Nav />
      <main>
        <Hero />
        <ClaimBand />
        <Types />
        <Measures />
        <States />
        <Uses />
        <Shipping />
        <Why />
        <FAQ />
        <Quote />
      </main>
      <Footer />
      <a className="wa-float" href={WHATSAPP} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="whatsapp" /></a>
    </>
  );
}
