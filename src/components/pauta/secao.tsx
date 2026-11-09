import { Fragment, type ReactNode } from "react";
import type { DataISO } from "@/lib/calendario";
import { areaCurta, getConfig } from "@/lib/config";
import type { ItemEdicao, ItemSemPrazo } from "@/lib/edicao/itens";
import { urgenciaDoItem } from "@/lib/edicao/urgencia";
import { cn } from "@/lib/utils";
import { BotaoItem } from "./botao-item";
import { ConteudoLinha } from "./linha";
import { COR_TEXTO, RotuloNivel } from "./nivel";
import { Valor } from "./valor";

export function Secao({ id, titulo, children, alerta, pequeno }: { id: string; titulo: string; children: ReactNode; alerta?: boolean; pequeno?: boolean }) {
  return (
    <section aria-labelledby={id} className="mt-8 border-t border-borda pt-5">
      <h2 id={id} className={cn("titulo-secao mb-1", alerta && "text-alerta", pequeno && "text-[1.0625rem]")}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Linha tocável (abre a folha de detalhes), com a barra de 4px na cor do nível do item (em relação a `hoje`). */
export function LinhaItem({ item, hoje, children }: { item: ItemEdicao; hoje: DataISO; children: ReactNode }) {
  return (
    <li className="border-b border-borda last:border-b-0">
      <BotaoItem item={item} nivel={urgenciaDoItem(item, hoje, getConfig()).nivel}>
        {children}
      </BotaoItem>
    </li>
  );
}

/**
 * Linha da seção "Sem prazo": nome; "{gestor} · {área curta}"; e o motivo ("Sem prazo" ou "Recorrência sem data
 * inicial — não gera as cópias"), na cor do nível (amarelo; vermelho se o item também estiver travado).
 */
export function LinhaSemPrazo({ item, hoje }: { item: ItemSemPrazo; hoje: DataISO }) {
  const { nivel, rotulo } = urgenciaDoItem(item, hoje, getConfig());
  return (
    <LinhaItem item={item} hoje={hoje}>
      <ConteudoLinha
        item={item}
        mostrarTipo={false}
        meta={
          <>
            <MetaItem item={item} />
            {rotulo && <span className={cn("mt-0.5 block text-[0.9375rem] font-semibold leading-snug", nivel && COR_TEXTO[nivel])}>{rotulo}</span>}
          </>
        }
      />
    </LinhaItem>
  );
}

/** Texto do nível do item ("Atrasado há 3 dias", "Vence hoje", "Em dia"...), com a mesma cor da barra. */
export function RotuloItem({ item, hoje, className }: { item: ItemEdicao; hoje: DataISO; className?: string }) {
  const { nivel, rotulo } = urgenciaDoItem(item, hoje, getConfig());
  return <RotuloNivel nivel={nivel} rotulo={rotulo} className={className} />;
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
