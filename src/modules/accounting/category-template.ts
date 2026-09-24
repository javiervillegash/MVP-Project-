/**
 * Plantilla de categorías basada en el Plan General Contable (PGC 2007).
 * Se copia a cada sociedad nueva; después cada sociedad puede renombrar,
 * añadir o archivar las suyas sin afectar a las demás.
 *
 * Las cuentas PGC son orientativas: sirven para que la gestoría reconozca
 * cada gasto, no sustituyen a la contabilidad oficial.
 *
 * `key` es estable y no debe cambiarse: la usarán las reglas automáticas
 * (p. ej. "ENDESA" → suministros.electricidad) en todas las sociedades.
 */
export type PlLine =
  | "ingresos"
  | "costes_directos"
  | "personal"
  | "alquiler"
  | "suministros"
  | "marketing"
  | "servicios_profesionales"
  | "otros_gastos"
  | "resultado_financiero"
  | "impuesto_beneficios";

export interface TemplateCategory {
  key: string;
  name: string;
  pgc: string;
  pl: PlLine;
  children?: Omit<TemplateCategory, "children">[];
}

export const INCOME_TEMPLATE: TemplateCategory[] = [
  { key: "ventas.servicios", name: "Prestación de servicios", pgc: "705", pl: "ingresos" },
  { key: "ventas.mercaderias", name: "Venta de mercaderías", pgc: "700", pl: "ingresos" },
  { key: "ingresos.arrendamientos", name: "Ingresos por arrendamientos", pgc: "752", pl: "ingresos" },
  { key: "ingresos.subvenciones", name: "Subvenciones", pgc: "740", pl: "ingresos" },
  { key: "ingresos.otros", name: "Otros ingresos", pgc: "759", pl: "ingresos" },
  { key: "ingresos.financieros", name: "Ingresos financieros", pgc: "769", pl: "resultado_financiero" },
];

export const EXPENSE_TEMPLATE: TemplateCategory[] = [
  {
    key: "compras",
    name: "Compras y aprovisionamientos",
    pgc: "600",
    pl: "costes_directos",
    children: [
      { key: "compras.mercaderias", name: "Compras de mercaderías", pgc: "600", pl: "costes_directos" },
      { key: "compras.materiales", name: "Materias primas y materiales", pgc: "601", pl: "costes_directos" },
      { key: "compras.subcontratas", name: "Trabajos de otras empresas", pgc: "607", pl: "costes_directos" },
    ],
  },
  {
    key: "personal",
    name: "Personal",
    pgc: "640",
    pl: "personal",
    children: [
      { key: "personal.sueldos", name: "Sueldos y salarios", pgc: "640", pl: "personal" },
      { key: "personal.seguridad_social", name: "Seguridad Social a cargo de la empresa", pgc: "642", pl: "personal" },
      { key: "personal.otros", name: "Otros gastos sociales", pgc: "649", pl: "personal" },
    ],
  },
  { key: "alquiler", name: "Alquiler", pgc: "621", pl: "alquiler" },
  {
    key: "suministros",
    name: "Suministros",
    pgc: "628",
    pl: "suministros",
    children: [
      { key: "suministros.electricidad", name: "Electricidad", pgc: "628", pl: "suministros" },
      { key: "suministros.agua", name: "Agua", pgc: "628", pl: "suministros" },
      { key: "suministros.gas", name: "Gas", pgc: "628", pl: "suministros" },
      { key: "suministros.telecomunicaciones", name: "Telecomunicaciones", pgc: "628", pl: "suministros" },
    ],
  },
  { key: "marketing", name: "Publicidad y marketing", pgc: "627", pl: "marketing" },
  {
    key: "profesionales",
    name: "Servicios profesionales",
    pgc: "623",
    pl: "servicios_profesionales",
    children: [
      { key: "profesionales.asesoria", name: "Asesoría y gestoría", pgc: "623", pl: "servicios_profesionales" },
      { key: "profesionales.legal", name: "Abogados y notaría", pgc: "623", pl: "servicios_profesionales" },
      { key: "profesionales.otros", name: "Otros profesionales", pgc: "623", pl: "servicios_profesionales" },
    ],
  },
  {
    key: "otros",
    name: "Otros gastos de explotación",
    pgc: "629",
    pl: "otros_gastos",
    children: [
      { key: "otros.reparaciones", name: "Reparaciones y mantenimiento", pgc: "622", pl: "otros_gastos" },
      { key: "otros.transportes", name: "Transportes y mensajería", pgc: "624", pl: "otros_gastos" },
      { key: "otros.seguros", name: "Seguros", pgc: "625", pl: "otros_gastos" },
      { key: "otros.bancarios", name: "Comisiones bancarias", pgc: "626", pl: "otros_gastos" },
      { key: "otros.software", name: "Software y suscripciones", pgc: "629", pl: "otros_gastos" },
      { key: "otros.oficina", name: "Material de oficina", pgc: "629", pl: "otros_gastos" },
      { key: "otros.viajes", name: "Viajes y desplazamientos", pgc: "629", pl: "otros_gastos" },
      { key: "otros.representacion", name: "Comidas y representación", pgc: "629", pl: "otros_gastos" },
      { key: "otros.tributos", name: "Tributos (IBI, IAE, tasas)", pgc: "631", pl: "otros_gastos" },
      { key: "otros.varios", name: "Otros gastos", pgc: "659", pl: "otros_gastos" },
    ],
  },
  { key: "financieros.intereses", name: "Intereses de préstamos", pgc: "662", pl: "resultado_financiero" },
  { key: "impuesto_sociedades", name: "Impuesto sobre beneficios", pgc: "630", pl: "impuesto_beneficios" },
];

export const PL_LINE_LABELS: Record<PlLine, string> = {
  ingresos: "Ingresos",
  costes_directos: "Costes directos",
  personal: "Gastos de personal",
  alquiler: "Alquiler",
  suministros: "Suministros",
  marketing: "Marketing",
  servicios_profesionales: "Servicios profesionales",
  otros_gastos: "Otros gastos",
  resultado_financiero: "Resultado financiero",
  impuesto_beneficios: "Impuesto sobre beneficios",
};

/** Líneas válidas por tipo, para no poner un gasto en «Ingresos». */
export const PL_LINES_BY_KIND: Record<"income" | "expense", PlLine[]> = {
  income: ["ingresos", "resultado_financiero"],
  expense: [
    "costes_directos",
    "personal",
    "alquiler",
    "suministros",
    "marketing",
    "servicios_profesionales",
    "otros_gastos",
    "resultado_financiero",
    "impuesto_beneficios",
  ],
};
