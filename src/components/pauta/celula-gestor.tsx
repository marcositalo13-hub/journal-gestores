import Link from "next/link";
import { primeiroEUltimo, seloGestor } from "@/lib/fotos";
import type { NivelSelo } from "@/lib/fotos";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { COR_BARRA } from "./nivel";

/** Célula da grade de gestores: foto (ou iniciais) + selo de pendências, nome e área curta. Toda a célula é o link. */
export function CelulaGestor({
  nome,
  areaCurta,
  url,
  href,
  contagens,
  nivel,
  grande,
}: {
  nome: string;
  areaCurta: string | null;
  url: string | null;
  href: string;
  contagens: { atrasados: number; travados: number; semPrazo: number };
  /** pior nível entre os itens abertos do gestor (null: tudo em dia, sem selo) */
  nivel: NivelSelo | null;
  grande?: boolean;
}) {
  const selo = seloGestor(contagens, nivel);
  return (
    <Link href={href} className={cn("linha flex flex-col items-center gap-2 rounded-xl px-1 py-2 text-center", grande ? "w-40" : "w-full")}>
      <span className="relative">
        <Avatar nome={nome} url={url} tamanho={grande ? 112 : 84} />
        {selo?.tipo === "pendencias" && (
          <span
            role="img"
            data-tour="gestor-selo"
            aria-label={selo.rotulo}
            className={cn(
              "absolute -right-1 -top-1 flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full px-1 text-[0.75rem] font-bold leading-none ring-2 ring-papel",
              COR_BARRA[selo.nivel],
              selo.nivel === "amarelo" ? "text-tinta" : "text-white",
            )}
          >
            <span aria-hidden>{selo.n}</span>
          </span>
        )}
        {selo?.tipo === "atencao" && <span role="img" data-tour="gestor-selo" aria-label={selo.rotulo} className={cn("absolute right-0 top-0 size-3.5 rounded-full ring-2 ring-papel", COR_BARRA[selo.nivel])} />}
      </span>
      <span className="block min-w-0">
        <span className={cn("block font-semibold leading-tight", grande ? "text-[1.0625rem]" : "text-[0.9375rem]")}>{primeiroEUltimo(nome)}</span>
        {areaCurta && <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-tinta-2">{areaCurta}</span>}
      </span>
    </Link>
  );
}
