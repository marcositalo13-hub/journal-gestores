import { Fragment, type ReactNode } from "react";
import { areaCurta } from "@/lib/config";
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

/**
 * Linha de apoio, sempre em UMA linha e começando por quem responde: "{gestor} · {área curta} · {extras} · {valor}".
 * Sem espaço, só a área curta é cortada com reticências; nome, extras e valor nunca. O valor respeita "ocultar valores".
 */
export function MetaItem({ item, extras = [] }: { item: ItemEdicao; extras?: ReactNode[] }) {
  const area = areaCurta(item.dono);
  const fixos: ReactNode[] = [...extras];
  if (typeof item.valor === "number") fixos.push(<Valor valor={item.valor} />);
  return (
    <span className="flex min-w-0 items-baseline whitespace-nowrap">
      <span className="shrink-0">{item.dono}</span>
      {area && (
        <>
          <span className="shrink-0">&nbsp;·&nbsp;</span>
          <span className="min-w-0 truncate">{area}</span>
        </>
      )}
      {fixos.map((p, i) => (
        <Fragment key={i}>
          <span className="shrink-0">&nbsp;·&nbsp;</span>
          <span className="shrink-0">{p}</span>
        </Fragment>
      ))}
    </span>
  );
}
