/** Etiquetas sin dependencias de servidor (se usan también en el navegador). */
export const PAYMENT_METHODS = ["bank", "card", "cash", "direct_debit", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Transferencia",
  card: "Tarjeta",
  cash: "Efectivo",
  direct_debit: "Domiciliación",
  other: "Otro",
};
