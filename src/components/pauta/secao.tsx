import { Fragment, type ReactNode } from "react";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { BotaoItem } from "./botao-item";
import { Valor } from "./valor";

export function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 border-t border-borda pt-5">
      <h2 id={id} className="titulo-secao mb-1">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Linha tocável (abre a folha de detalhes). */
export function LinhaItem({ item, children }: { item: ItemEdicao; children: ReactNode }) {
  return (
    <li className="border-b border-borda last:border-b-0">
      <BotaoItem item={item}>{children}</BotaoItem>
    </li>
  );
}

/** Linha de apoio: partes separadas por " · ", com o dono (modo equipe) e o valor (respeita ocultar valores). */
export function MetaItem({ item, dono, extras = [] }: { item: ItemEdicao; dono?: boolean; extras?: ReactNode[] }) {
  const partes: ReactNode[] = [];
  if (dono) partes.push(item.dono);
  partes.push(...extras);
  if (typeof item.valor === "number") partes.push(<Valor valor={item.valor} />);
  if (!partes.length) return null;
  return (
    <>
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {p}
        </Fragment>
      ))}
    </>
  );
}
