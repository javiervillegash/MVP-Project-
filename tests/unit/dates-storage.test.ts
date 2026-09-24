import { describe, expect, it } from "vitest";
import { formatDate, isValidIsoDate, monthRange, todayIso } from "@/lib/dates";
import { detectContentType, safeFileName } from "@/lib/storage";

describe("fechas", () => {
  it("valida fechas reales", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("26-02-01")).toBe(false);
  });
  it("hoy en Madrid, aunque en UTC ya sea otro día", () => {
    expect(todayIso(new Date("2026-09-24T22:30:00Z"))).toBe("2026-09-25");
  });
  it("formato y rango de mes", () => {
    expect(formatDate("2026-09-24")).toBe("24/09/2026");
    expect(monthRange("2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("archivos", () => {
  it("detecta el tipo real por su contenido, no por el nombre", () => {
    expect(detectContentType(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(detectContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(detectContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectContentType(Buffer.from('<?xml version="1.0"?><Facturae/>'))).toBe("application/xml");
    expect(detectContentType(Buffer.from("MZ ejecutable"))).toBeNull();
    expect(detectContentType(Buffer.from("<html>"))).toBeNull();
  });
  it("limpia nombres de archivo peligrosos", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("factura <endesa>;.pdf")).toBe("factura _endesa__.pdf");
    expect(safeFileName("Factura Nº 12 – Julio.pdf")).toBe("Factura Nº 12 _ Julio.pdf");
  });
});
