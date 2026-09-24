import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="text-xl font-semibold">No encontrado</h1>
      <p className="mt-2 text-sm text-muted">Esta página no existe o no tienes acceso a ella.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-accent underline">
        Volver al inicio
      </Link>
    </div>
  );
}
