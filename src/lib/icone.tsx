import { ImageResponse } from "next/og";

// Cores dos tokens (globals.css); o ImageResponse não lê variáveis CSS.
export const COR_DESTAQUE = "#00539F";
export const COR_PAPEL = "#FFFFFF";

/**
 * Busca a Newsreader (só o glifo "P") no Google Fonts para o ícone ficar serifado.
 * Roda no build (ícones são estáticos); se falhar, cai na fonte padrão sem quebrar o build.
 */
async function fonteNewsreader(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@72,700&text=P")).text();
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Ícone quadrado: "P" serifado branco sobre o azul de destaque. */
export async function gerarIcone(lado: number, { cantos = false }: { cantos?: boolean } = {}) {
  const fonte = await fonteNewsreader();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COR_DESTAQUE,
          color: COR_PAPEL,
          fontFamily: fonte ? "Newsreader" : "serif",
          fontWeight: 700,
          fontSize: Math.round(lado * 0.68),
          lineHeight: 1,
          // o iOS aplica a máscara arredondada sozinho; só arredondamos quando pedido
          borderRadius: cantos ? Math.round(lado * 0.22) : 0,
          paddingTop: Math.round(lado * 0.04),
        }}
      >
        P
      </div>
    ),
    {
      width: lado,
      height: lado,
      fonts: fonte ? [{ name: "Newsreader", data: fonte, weight: 700, style: "normal" }] : undefined,
    },
  );
}
