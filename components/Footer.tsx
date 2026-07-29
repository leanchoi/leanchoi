export default function Footer() {
  return (
    // En pantallas chicas quedaba pisado por la barra de "Mi Agenda": ahí se oculta.
    <footer className="fixed bottom-2 left-3 z-30 hidden text-micro text-white/60 pointer-events-none sm:block">
      <span className="pointer-events-auto">
        Creado con ❤️ por{' '}
        <a
          href="https://www.instagram.com/colabtur/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/30 underline-offset-2 hover:text-white transition-colors"
        >
          co-LABtur
        </a>
      </span>
    </footer>
  );
}
