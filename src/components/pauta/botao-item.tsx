"use client";

import type { ReactNode } from "react";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { cn } from "@/lib/utils";
import { useDetalhe } from "./detalhe";

/** Qualquer linha ou a manchete: ao tocar, abre a folha de detalhes. O conteúdo vem do servidor. */
export function BotaoItem({ item, className, children }: { item: ItemEdicao; className?: string; children: ReactNode }) {
  const { abrir } = useDetalhe();
  return (
    <button type="button" onClick={() => abrir(item)} className={cn("linha -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-3 px-5 text-left", className)}>
      {children}
    </button>
  );
}
