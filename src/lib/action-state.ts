import { ZodError } from "zod";
import { AccessDeniedError } from "@/modules/access/context";
import { DomainError } from "./errors";

/** Resultado de una acción de formulario, apto para useActionState. */
export interface FormState<T = unknown> {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
  /** Valores enviados, para no perder lo escrito si hay errores (React 19 reinicia el formulario). */
  values?: Record<string, string>;
}

/** Añade los valores enviados al resultado cuando la acción falla. */
export function keepValues<T>(res: FormState<T>, fd: FormData): FormState<T> {
  if (res.ok) return res;
  const values: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  });
  return { ...res, values };
}

/**
 * Ejecuta una acción y convierte los errores en mensajes para el formulario.
 * Los errores inesperados se registran y se muestran de forma genérica.
 */
export async function runAction<T>(fn: () => Promise<T | void>): Promise<FormState<T>> {
  try {
    const data = await fn();
    return { ok: true, data: data ?? undefined };
  } catch (e) {
    if (e instanceof DomainError) {
      return { error: e.field ? undefined : e.message, fieldErrors: e.field ? { [e.field]: e.message } : undefined };
    }
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = String(issue.path[0] ?? "form");
        fieldErrors[key] ??= issue.message;
      }
      return { fieldErrors };
    }
    if (e instanceof AccessDeniedError) return { error: e.message };
    // redirect() y notFound() de Next.js deben propagarse.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const optStr = (fd: FormData, key: string) => str(fd, key) || null;
