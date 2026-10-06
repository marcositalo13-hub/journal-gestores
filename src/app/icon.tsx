import { gerarIcone } from "@/lib/icone";

export const contentType = "image/png";

// 192 e 512 são os tamanhos exigidos no manifest; 32 serve de favicon.
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType },
    { id: "192", size: { width: 192, height: 192 }, contentType },
    { id: "512", size: { width: 512, height: 512 }, contentType },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  return gerarIcone(Number(await id));
}
