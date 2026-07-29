'use client';

// Animación sutil de "stick figures" en loop infinito (~14s):
// una chica pasea a su perro, llega otro perro y lo muerde a él y a ella,
// llega un chico, se saca el cinto, le pega un par de veces y lo espanta
// corriendo con el cinto en la mano. Simple, discreta, tema oscuro.
export default function StickScene() {
  return (
    <div
      className="hidden select-none sm:block"
      aria-hidden
      title="co-LABtur"
      style={{ width: 300, height: 96, opacity: 0.55 }}
    >
      <style>{`
        .sfa svg { overflow: visible; }
        .sfa line, .sfa circle, .sfa path, .sfa ellipse { vector-effect: non-scaling-stroke; }
        .sfa-actor { animation-duration: 14s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
        .sfa-attacker { animation-name: sfa-attacker; }
        .sfa-boy { animation-name: sfa-boy; }
        .sfa-girl { animation-name: sfa-girl; }
        .sfa-pet { animation-name: sfa-pet; }
        .sfa-belt-arm { transform-box: fill-box; transform-origin: 0 0; animation: sfa-swing 14s infinite ease-in-out; }
        .sfa-girl-arm { transform-box: fill-box; transform-origin: 0 0; animation: sfa-flail 14s infinite ease-in-out; }

        @keyframes sfa-attacker {
          0%, 16% { transform: translateX(132px); }
          26% { transform: translate(-6px, 0); }
          30% { transform: translate(-10px, -3px); }
          34% { transform: translate(-4px, 1px); }
          40% { transform: translate(-10px, -3px); }
          46% { transform: translate(-4px, 1px); }
          52% { transform: translate(-10px, -3px); }
          58% { transform: translate(-4px, 1px); }
          64% { transform: translate(-8px, -2px); }
          68% { transform: translate(14px, 0); }
          80%, 100% { transform: translateX(132px); }
        }
        @keyframes sfa-boy {
          0%, 30% { transform: translateX(-232px); }
          46% { transform: translateX(0); }
          66% { transform: translateX(2px); }
          82% { transform: translateX(34px); }
          100% { transform: translateX(150px); }
        }
        @keyframes sfa-girl {
          0%, 24% { transform: translateX(0); }
          30% { transform: translateX(-2px); }
          38% { transform: translateX(2px); }
          46% { transform: translateX(-2px); }
          54% { transform: translateX(2px); }
          62% { transform: translateX(0); }
          100% { transform: translateX(0); }
        }
        @keyframes sfa-pet {
          0%, 24% { transform: translateY(0); }
          32% { transform: translateY(3px); }
          58% { transform: translateY(3px); }
          66%, 100% { transform: translateY(0); }
        }
        @keyframes sfa-flail {
          0%, 26% { transform: rotate(0deg); }
          32% { transform: rotate(-55deg); }
          44% { transform: rotate(-25deg); }
          56% { transform: rotate(-55deg); }
          62% { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes sfa-swing {
          0%, 42% { transform: rotate(-100deg); }
          48% { transform: rotate(45deg); }
          54% { transform: rotate(-55deg); }
          60% { transform: rotate(45deg); }
          66% { transform: rotate(-25deg); }
          82%, 100% { transform: rotate(-18deg); }
        }
      `}</style>

      <div className="sfa">
        <svg viewBox="0 0 300 96" width="300" height="96" fill="none"
          stroke="var(--t-lo)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {/* piso */}
          <line x1="0" y1="82" x2="300" y2="82" stroke="var(--line)" strokeWidth="1.2" />

          {/* Chica (dueña) en x≈110 */}
          <g className="sfa-actor sfa-girl">
            <circle cx="110" cy="30" r="6" />
            {/* pelo/rodete */}
            <circle cx="115" cy="27" r="2.4" stroke="none" fill="var(--t-lo)" />
            <line x1="110" y1="36" x2="110" y2="58" />
            {/* pollera */}
            <path d="M110 52 L103 66 L117 66 Z" />
            <line x1="110" y1="66" x2="106" y2="80" />
            <line x1="110" y1="66" x2="114" y2="80" />
            {/* brazo quieto */}
            <line x1="110" y1="42" x2="101" y2="52" />
            {/* brazo que se agita cuando la muerden (pivote en el hombro) */}
            <g transform="translate(110,42)">
              <g className="sfa-girl-arm">
                <line x1="0" y1="0" x2="10" y2="10" />
              </g>
            </g>
            {/* correa hacia su perro */}
            <line x1="120" y1="52" x2="134" y2="62" stroke="#64748b" strokeWidth="1" />
          </g>

          {/* Perro de la chica en x≈140 (cuenta con cower) */}
          <g className="sfa-actor sfa-pet">
            <ellipse cx="142" cy="66" rx="11" ry="5" />
            <line x1="133" y1="70" x2="133" y2="78" />
            <line x1="139" y1="70" x2="139" y2="78" />
            <line x1="146" y1="70" x2="146" y2="78" />
            <line x1="151" y1="70" x2="151" y2="78" />
            {/* cabeza a la derecha, mirando al atacante */}
            <line x1="153" y1="64" x2="158" y2="58" />
            <circle cx="159" cy="56" r="3.2" />
            {/* cola */}
            <line x1="131" y1="63" x2="125" y2="59" />
          </g>

          {/* Perro atacante: entra desde la derecha, muerde, huye */}
          <g className="sfa-actor sfa-attacker">
            <ellipse cx="192" cy="66" rx="12" ry="5" />
            {/* lomo erizado (agresivo) */}
            <path d="M186 61 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3" strokeWidth="1.1" />
            <line x1="183" y1="70" x2="183" y2="78" />
            <line x1="189" y1="70" x2="189" y2="78" />
            <line x1="196" y1="70" x2="196" y2="78" />
            <line x1="201" y1="70" x2="201" y2="78" />
            {/* cabeza a la izquierda (hacia la víctima), boca abierta */}
            <line x1="181" y1="65" x2="175" y2="61" />
            <circle cx="172" cy="60" r="3.4" />
            <path d="M169 61 l-3 1 l3 1" strokeWidth="1.1" />
            {/* cola tiesa */}
            <line x1="204" y1="63" x2="211" y2="60" />
          </g>

          {/* Chico: entra desde la izquierda y pega con el cinto */}
          <g className="sfa-actor sfa-boy">
            <circle cx="165" cy="28" r="6" />
            <line x1="165" y1="34" x2="165" y2="58" />
            <line x1="165" y1="58" x2="159" y2="76" />
            <line x1="165" y1="58" x2="171" y2="76" />
            {/* brazo libre */}
            <line x1="165" y1="40" x2="156" y2="50" />
            {/* brazo con cinto (pivote en el hombro) */}
            <g transform="translate(165,40)">
              <g className="sfa-belt-arm">
                <line x1="0" y1="0" x2="2" y2="14" />
                {/* cinto colgando de la mano */}
                <path d="M2 14 q4 8 1 18" stroke="var(--t-md)" strokeWidth="1.4" />
                <rect x="1" y="31" width="3" height="2.4" rx="0.5" stroke="var(--t-md)" strokeWidth="0.9" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
