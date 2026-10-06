import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { cn } from "@/lib/utils";

/**
 * Conteúdo de uma linha de item (o toque é do BotaoItem). Sem hooks: serve a Server e Client Components.
 * `meta`: linhas de apoio abaixo do nome. `direita`: pílula de status ou "há N dias".
 */
export function ConteudoLinha({
  item,
  meta,
  direita,
  mostrarTipo = true,
}: {
  item: ItemEdicao;
  meta?: ReactNode;
  direita?: ReactNode;
  mostrarTipo?: boolean;
}) {
  const concluido = item.categoria === "concluido";
  return (
    <>
      <span className="block min-w-0 flex-1 py-3.5">
        {mostrarTipo && <span className="rotulo-tipo">{item.tipo}</span>}
        <span className={cn("nome-item", concluido && "text-tinta-2")}>
          {concluido && <Check aria-hidden size={18} strokeWidth={2.5} className="mr-1.5 inline-block -translate-y-px text-ok" />}
          {item.nome}
        </span>
        {meta && <span className="meta-item">{meta}</span>}
      </span>
      {direita}
      <ChevronRight aria-hidden size={18} className="shrink-0 text-tinta-2/70" />
    </>
  );
}
