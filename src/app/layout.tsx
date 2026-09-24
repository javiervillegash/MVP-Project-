import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Plataforma Financiera", template: "%s · Plataforma Financiera" },
  description: "Administración y control financiero operativo multiempresa",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
