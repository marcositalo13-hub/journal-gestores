import type { MetadataRoute } from "next";
import { COR_PAPEL } from "@/lib/icone";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A Pauta",
    short_name: "A Pauta",
    description: "O jornal diário da Diretoria.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: COR_PAPEL,
    theme_color: COR_PAPEL,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
