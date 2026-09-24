/**
 * Almacenamiento de archivos. Los documentos NUNCA se sirven directamente:
 * se descargan a través de /api/documentos/[id], que comprueba permisos.
 *
 * Hoy: disco local (STORAGE_DIR, por defecto ./storage), fuera de /public.
 * En producción se añadirá un proveedor compatible con S3 en la UE con la
 * misma interfaz; el resto del código no cambiará.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalDiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    if (!/^[a-z0-9/-]+$/i.test(key) || key.includes("..")) throw new Error("Clave de almacenamiento no válida");
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error("Ruta fuera del almacenamiento");
    return p;
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    // "wx": nunca sobrescribe un archivo existente.
    await writeFile(p, data, { flag: "wx" });
  }

  async get(key: string) {
    return readFile(this.path(key));
  }
}

let storage: Storage | undefined;
export function getStorage(): Storage {
  storage ??= new LocalDiskStorage(process.env.STORAGE_DIR ?? join(process.cwd(), "storage"));
  return storage;
}

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Tipo real del archivo según sus primeros bytes (no según la extensión, que
 * se puede falsear). Devuelve null si no es un tipo admitido.
 */
export function detectContentType(data: Buffer): string | null {
  const head = data.subarray(0, 12);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  const text = data.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart();
  if (text.startsWith("<?xml")) return "application/xml"; // Facturae
  return null;
}

/** Nombre de archivo seguro para guardar y para la cabecera de descarga. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "documento";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .trim();
  return (cleaned || "documento").slice(0, 150);
}
