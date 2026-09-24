"use client";

import Link from "next/link";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  const denied = error.name === "AccessDeniedError" || /permiso/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="text-xl font-semibold">{denied ? "No tienes acceso a esta página" : "Algo ha fallado"}</h1>
      <p className="mt-2 text-sm text-muted">
        {denied
          ? "Tu rol no permite ver o hacer esto. Si crees que deberías, habla con un Administrador."
          : "No se ha podido completar la operación. Vuelve a intentarlo; si se repite, avisa al equipo técnico."}
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Referencia: {error.digest}</p>}
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-accent underline">
        Volver al inicio
      </Link>
    </div>
  );
}
