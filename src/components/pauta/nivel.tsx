// Apresentação dos níveis de urgência. Sem hooks e sem config: serve a Server e Client Components.
import type { Nivel } from "@/lib/niveis";
import { cn } from "@/lib/utils";

/** Classes literais (o Tailwind só gera o que aparece escrito no código). */
export const COR_BARRA: Record<Nivel, string> = {
  preto: "bg-nivel-preto",
  vermelho: "bg-nivel-vermelho",
  amarelo: "bg-nivel-amarelo",
  verde: "bg-nivel-verde",
};

export const COR_TEXTO: Record<Nivel, string> = {
  preto: "text-nivel-preto",
  vermelho: "text-nivel-vermelho",
  amarelo: "text-nivel-amarelo-texto",
  verde: "text-nivel-verde",
};

/** Barra vertical de 4px na borda esquerda da linha (a linha precisa ser `relative`). */
export function BarraNivel({ nivel }: { nivel: Nivel | null }) {
  if (!nivel) return null;
  return <span aria-hidden data-nivel={nivel} className={cn("absolute inset-y-0 left-0 w-1", COR_BARRA[nivel])} />;
}

/** Texto do nível, à direita da linha. Pode quebrar em duas linhas ("Atrasado há / 12 dias"). */
export function RotuloNivel({ nivel, rotulo, className }: { nivel: Nivel | null; rotulo: string | null; className?: string }) {
  if (!nivel || !rotulo) return null;
  return <span className={cn("max-w-[7.25rem] shrink-0 text-balance text-right text-[0.9375rem] font-semibold leading-tight", COR_TEXTO[nivel], className)}>{rotulo}</span>;
}
