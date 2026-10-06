import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

// Newsreader só no cabeçalho e manchetes; o corpo usa a fonte do sistema.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "A Pauta", template: "%s · A Pauta" },
  description: "O jornal diário da Diretoria.",
  applicationName: "A Pauta",
  appleWebApp: { capable: true, title: "A Pauta", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={newsreader.variable}>
      <body className="min-h-dvh bg-papel text-tinta">{children}</body>
    </html>
  );
}
