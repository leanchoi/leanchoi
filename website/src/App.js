import React, { useState, useEffect, useRef } from 'react';
import { Glyph, LogoLockup, Icon } from './components/Brand';
import { useReveal, useScroll, useParallax } from './hooks';

const NAV_LINKS = [
  { href: '#soluciones', label: 'Soluciones' },
  { href: '#proceso', label: 'Proceso' },
  { href: '#contacto', label: 'Contacto' },
];

const WHATSAPP = 'https://wa.me/5492945000000?text=Hola%20Base%20Sur%20Containers%2C%20quiero%20una%20consulta';

/* ---------------- NAV ---------------- */
function Nav() {
  const { scrolled } = useScroll();
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);

  return (
    <>
      <nav className={scrolled ? 'scrolled' : ''}>
        <div className="nav-inner">
          <a href="#hero" aria-label="Base Sur Containers"><LogoLockup /></a>
          <div className="nav-links">
            {NAV_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a href="#contacto" className="btn btn-primary">Solicitar presupuesto</a>
          </div>
          <button className={`nav-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label="Menú">
            <span /><span /><span />
          </button>
        </div>
      </nav>
      <div className={`mobile-menu ${open ? 'open' : ''}`}>
        {NAV_LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
        <a href="#contacto" className="btn btn-primary" onClick={() => setOpen(false)}>Solicitar presupuesto</a>
      </div>
    </>
  );
}

/* ---------------- HERO ---------------- */
function Hero() {
  const bg = useParallax(0.12);
  return (
    <section id="hero">
      <div className="hero-bg img-slot img-hero" ref={bg} />
      <div className="container">
        <div className="hero-content">
          <div className="eyebrow reveal in">Base Sur Containers — Patagonia Argentina</div>
          <h1 className="h1 reveal in reveal-delay-1">No vendemos solo <span className="accent">containers</span>.</h1>
          <p className="hero-support reveal in reveal-delay-2">Espacios modulares diseñados para la realidad del sur.</p>
          <div className="hero-buttons reveal in reveal-delay-3">
            <a href="#contacto" className="btn btn-primary">Solicitar presupuesto</a>
            <a href="#soluciones" className="btn btn-ghost">Ver soluciones <span className="arrow">→</span></a>
          </div>
        </div>
      </div>
      <div className="scroll-cue"><div className="line" /><span>Scroll</span></div>
    </section>
  );
}

/* ---------------- DIVISOR ---------------- */
const Divider = () => (
  <div className="container"><div className="divider"><span className="rule" /><Glyph className="glyph" stroke="var(--accent)" /><span className="rule right" /></div></div>
);

/* ---------------- FILOSOFÍA ---------------- */
const Philosophy = () => (
  <section id="filosofia">
    <Glyph className="watermark" stroke="var(--accent)" />
    <div className="container">
      <div className="eyebrow reveal">Quiénes somos</div>
      <h2 className="h2 reveal reveal-delay-1">Construir, ampliar o resolver espacio no debería ser lento, complejo ni <span className="accent">improvisado</span>.</h2>
      <p className="body-text reveal reveal-delay-2" style={{ marginTop: '32px' }}>
        Nacimos para acercar a la Patagonia soluciones modulares modernas, funcionales y adaptadas a la realidad del sur. Containers marítimos y módulos pensados para resolver espacio con criterio: rápido, bien diseñado y sin improvisar.
      </p>
    </div>
  </section>
);

/* ---------------- SOLUCIONES ---------------- */
const SOLUTIONS = [
  { icon: 'obra', img: 'img-obra', title: 'Obra', text: 'Oficinas, pañoles y módulos operativos listos para trabajar desde el día uno.' },
  { icon: 'turismo', img: 'img-turismo', title: 'Turismo', text: 'Refugios y unidades de alojamiento que se integran al paisaje y rinden todo el año.' },
  { icon: 'campo', img: 'img-campo', title: 'Campo', text: 'Espacios resistentes para vivir, guardar y operar en entornos remotos.' },
  { icon: 'vivienda', img: 'img-vivienda', title: 'Vivienda', text: 'Casas modulares de diseño, pensadas para el clima y la vida del sur.' },
];

const Solutions = () => (
  <section id="soluciones" className="section-alt">
    <div className="container">
      <div className="eyebrow reveal">Soluciones</div>
      <h2 className="h2 reveal reveal-delay-1">Espacios para obra, turismo, campo y proyectos habitacionales.</h2>
    </div>
    <div className="container">
      <div className="grid-2x2">
        {SOLUTIONS.map((s, i) => (
          <article key={s.title} className={`sol-card reveal reveal-delay-${(i % 3) + 1}`}>
            <div className={`sol-bg img-slot ${s.img}`} />
            <Icon name={s.icon} className="sol-icon" />
            <div className="sol-content">
              <h3 className="h3">{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

/* ---------------- EXPERIENCIA ---------------- */
function Experience() {
  const bg = useParallax(0.1);
  return (
    <section id="experiencia">
      <div className="exp-bg img-slot img-experiencia" ref={bg} />
      <div className="container">
        <h2 className="h2 reveal">Un marco para el paisaje del sur.</h2>
        <p className="exp-support reveal reveal-delay-1">Acero por fuera. Refugio por dentro.</p>
      </div>
    </section>
  );
}

/* ---------------- POR QUÉ MODULAR ---------------- */
const COMPARE = [
  ['Tiempos', 'Inciertos, sujetos al clima', 'Ciclo de fabricación definido en planta'],
  ['Previsibilidad', 'Depende de mano de obra y materiales', 'Proceso controlado de principio a fin'],
  ['Clima durante la obra', 'Obra expuesta, demoras', 'Fabricación bajo techo'],
  ['Diseño', 'Estándar', 'Estética modular pensada para el sur'],
  ['Movilidad', 'Fijo', 'Modular y reubicable'],
];

const WhyModular = () => (
  <section id="modular">
    <div className="container">
      <div className="eyebrow reveal">Por qué modular</div>
      <h2 className="h2 reveal reveal-delay-1">Rápido, previsible y diseñado. Sin las demoras de la obra tradicional.</h2>
      <div className="compare reveal reveal-delay-2">
        <div className="compare-row compare-head">
          <div className="label" />
          <div className="trad">Construcción tradicional</div>
          <div className="base">Base Sur</div>
        </div>
        {COMPARE.map((r) => (
          <div className="compare-row" key={r[0]}>
            <div className="label">{r[0]}</div>
            <div className="trad">{r[1]}</div>
            <div className="base">{r[2]}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ---------------- PROCESO ---------------- */
const STEPS = [
  ['Asesoramiento', 'Entendemos tu terreno, tu uso y tu presupuesto.'],
  ['Diseño', 'Definimos el módulo y la configuración que necesitás.'],
  ['Fabricación en planta', 'Construimos bajo techo, con tiempos definidos.'],
  ['Entrega y montaje', 'Llegamos, instalamos y dejamos el espacio listo.'],
];

function Process() {
  const lineRef = useRef(null);
  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.style.width = '100%'; io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el.parentElement);
    return () => io.disconnect();
  }, []);
  return (
    <section id="proceso" className="section-alt">
      <div className="container">
        <div className="eyebrow reveal">Cómo trabajamos</div>
        <h2 className="h2 reveal reveal-delay-1">De la idea al módulo, sin improvisar.</h2>
        <div className="timeline">
          <span className="progress-line" ref={lineRef} />
          {STEPS.map(([t, d], i) => (
            <div className={`step reveal reveal-delay-${i % 3 + 1}`} key={t}>
              <div className="num">{i + 1}</div>
              <h3 className="h3">{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- INGENIERÍA ---------------- */
const PILLARS = [
  ['termico', 'Aislamiento térmico', 'Envolvente pensada para el frío y el viento patagónico.'],
  ['estructura', 'Estructura resistente', 'Acero y uniones reforzadas para durar.'],
  ['precision', 'Precisión modular', 'Fabricación controlada, ensamblaje milimétrico.'],
  ['eco', 'Sustentable y eficiente', 'Menos desperdicio, menos obra, más eficiencia.'],
];

const Engineering = () => (
  <section id="ingenieria">
    <div className="container">
      <div className="eyebrow reveal">Ingeniería</div>
      <h2 className="h2 reveal reveal-delay-1">Diseñado para el clima del sur.</h2>
      <div className="grid-4">
        {PILLARS.map(([icon, t, d], i) => (
          <div className={`pillar reveal reveal-delay-${i % 3 + 1}`} key={t}>
            <Icon name={icon} className="pillar-icon" />
            <h3 className="h3">{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ---------------- PROYECTOS ---------------- */
const PROJECTS = [
  { img: 'img-refugio', title: 'Refugio de montaña', text: 'Módulo residencial de diseño industrial, integrado a un entorno boscoso.' },
  { img: 'img-estepa', title: 'Unidad de estepa', text: 'Espacio modular cromáticamente integrado al suelo patagónico.' },
];

const Projects = () => (
  <section id="proyectos" className="section-alt">
    <div className="container">
      <div className="eyebrow reveal">Proyectos</div>
      <h2 className="h2 reveal reveal-delay-1">Arquitectura en el paisaje.</h2>
      <div className="projects">
        {PROJECTS.map((p) => (
          <article className="project reveal" key={p.title}>
            <div className="project-img">
              <span className="tag">Concepto</span>
              <div className={`img-slot ${p.img}`} />
            </div>
            <h3 className="h3">{p.title}</h3>
            <p>{p.text}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

/* ---------------- FAQ ---------------- */
const FAQS = [
  ['¿Necesito permisos para instalarlo?', 'En general sí, según el municipio y el uso. Te orientamos sobre la documentación necesaria en tu zona como parte del asesoramiento inicial.'],
  ['¿Qué tipo de fundación requiere el terreno?', 'Depende del módulo y del suelo. Suele resolverse con plateas o pilotes; lo definimos tras evaluar tu terreno.'],
  ['¿Llegan a zonas remotas de la Patagonia?', 'Sí. Coordinamos logística y montaje incluso en ubicaciones de acceso complejo.'],
  ['¿Está preparado para el frío y el viento del sur?', 'Cada módulo se proyecta con aislamiento y estructura pensados para las condiciones del sur.'],
  ['¿Puedo personalizar el módulo?', 'Sí. Definimos terminaciones, aberturas y configuración según tu uso y presupuesto.'],
  ['¿Cuánto tarda desde que contrato hasta la entrega?', 'Trabajamos con un ciclo de fabricación definido en planta; te damos un plazo estimado al cerrar el proyecto.'],
  ['¿Cómo es la forma de pago?', 'Coordinamos un esquema por etapas. Lo conversamos en la sesión técnica.'],
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq">
      <div className="container">
        <div className="eyebrow reveal">Preguntas frecuentes</div>
        <h2 className="h2 reveal reveal-delay-1">Lo que necesitás saber antes de empezar.</h2>
        <div className="accordion reveal reveal-delay-2">
          {FAQS.map(([q, a], i) => (
            <div className={`acc-item ${open === i ? 'open' : ''}`} key={q}>
              <button className="acc-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span className="q">{q}</span><span className="toggle">+</span>
              </button>
              <div className="acc-body" style={{ maxHeight: open === i ? '260px' : '0' }}><p>{a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- CONTACTO ---------------- */
function Contact() {
  const [status, setStatus] = useState('');
  const submit = (e) => {
    e.preventDefault();
    setStatus('Enviando…');
    setTimeout(() => setStatus('Gracias. Te contactamos a la brevedad.'), 700);
    e.target.reset();
  };
  return (
    <section id="contacto" className="section-alt">
      <div className="container">
        <div className="eyebrow reveal">Solicitar presupuesto</div>
        <h2 className="h2 reveal reveal-delay-1">Hablemos de tu espacio.</h2>
        <div className="contact-grid">
          <div className="contact-visual reveal"><div className="img-slot img-contacto" /></div>
          <form className="reveal reveal-delay-1" onSubmit={submit}>
            <p className="body-text" style={{ marginBottom: '28px' }}>
              Contanos sobre tu terreno y tu proyecto. Coordinamos una sesión técnica y te enviamos un presupuesto estimado.
            </p>
            <div className="field"><label>Nombre y apellido *</label><input required placeholder="Ej. Mateo Silva" /></div>
            <div className="field"><label>Email *</label><input type="email" required placeholder="ejemplo@correo.com" /></div>
            <div className="field"><label>Teléfono / WhatsApp</label><input type="tel" placeholder="+54 9 …" /></div>
            <div className="field"><label>¿Para qué lo necesitás? *</label>
              <select required defaultValue=""><option value="" disabled>Seleccioná una opción</option>
                <option>Obra</option><option>Turismo</option><option>Campo</option><option>Vivienda</option>
              </select>
            </div>
            <div className="field"><label>Contanos sobre tu proyecto *</label><textarea required placeholder="Tu terreno, el uso y el tipo de módulo que imaginás…" /></div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Enviar consulta</button>
            <div className="form-status">{status}</div>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FOOTER ---------------- */
const Footer = () => (
  <footer>
    <div className="container">
      <div className="footer-grid">
        <div className="footer-brand">
          <Glyph className="glyph" stroke="var(--text-primary)" />
          <p>Diseñado y fabricado en Argentina, pensado para el sur.</p>
        </div>
        <div className="footer-col">
          <h4>Contacto</h4>
          <a href="mailto:info@basesur.com.ar">info@basesur.com.ar</a>
          <a href={WHATSAPP} target="_blank" rel="noreferrer">WhatsApp</a>
          <p>Esquel · Patagonia Argentina</p>
        </div>
        <div className="footer-col">
          <h4>Navegación</h4>
          <a href="#soluciones">Soluciones</a>
          <a href="#proceso">Proceso</a>
          <a href="#contacto">Contacto</a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Base Sur Containers.</div>
    </div>
  </footer>
);

/* ---------------- APP ---------------- */
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
        <Philosophy />
        <Divider />
        <Solutions />
        <Experience />
        <WhyModular />
        <Process />
        <Engineering />
        <Projects />
        <FAQ />
        <Contact />
      </main>
      <Footer />
      <a className="wa-float" href={WHATSAPP} target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <Icon name="whatsapp" />
      </a>
    </>
  );
}
