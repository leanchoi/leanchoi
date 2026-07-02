export default function Footer() {
  return (
    <footer className="fixed bottom-2 left-3 z-30 text-[11px] text-white/45 pointer-events-none">
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
