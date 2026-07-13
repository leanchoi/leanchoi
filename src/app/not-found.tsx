import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-6xl font-bold text-pine">404</p>
      <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/60">
        Puede que el sitio esté pausado o que el enlace haya cambiado.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex h-11 items-center rounded-full bg-pine px-7 text-sm font-medium text-bone hover:bg-pine-deep"
      >
        Ir al inicio
      </Link>
    </div>
  );
}
