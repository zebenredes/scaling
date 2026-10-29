import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scaling · Agencia IA",
  description: "Plataforma para operar los 7 servicios de una agencia de IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
