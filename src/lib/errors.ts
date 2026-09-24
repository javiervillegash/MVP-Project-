/**
 * Error de negocio con un mensaje apto para mostrar al usuario
 * (p. ej. "Ya existe una sociedad con ese NIF"). Cualquier otro error se
 * trata como inesperado y se muestra un mensaje genérico.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Código de PostgreSQL de un error envuelto por Drizzle, si lo hay. */
export function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.cause?.code ?? err?.code;
}

export function pgConstraint(e: unknown): string | undefined {
  const err = e as { constraint?: string; cause?: { constraint?: string } };
  return err?.cause?.constraint ?? err?.constraint;
}
