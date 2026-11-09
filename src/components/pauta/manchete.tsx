import type { DataISO } from "@/lib/calendario";
import { areaCurta, getConfig } from "@/lib/config";
import type { MancheteEdicao } from "@/lib/edicao/montar";
import { nivelUrgencia } from "@/lib/edicao/urgencia";
import { dataCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BotaoItem } from "./botao-item";
import { COR_TEXTO } from "./nivel";

export function Manchete({ manchete, hoje }: { manchete: MancheteEdicao | null; hoje: DataISO }) {
  if (!manchete) {
    return (
      <section aria-label="Manchete" className="pb-2">
        <p className="font-jornal text-[1.5rem] leading-snug text-tinta-2">Sem urgências hoje.</p>
      </section>
    );
  }
  const { item, kicker } = manchete;
  const nivel = nivelUrgencia(item, hoje, getConfig());
  return (
    <section aria-label="Manchete" className="pb-1">
      <BotaoItem item={item} className="block pt-1 pb-5">
        <span className={cn("kicker", nivel ? COR_TEXTO[nivel] : "text-tinta")}>{kicker}</span>
        <span className="titulo-jornal mt-2 block text-[1.875rem] leading-[1.1]">{item.nome}</span>
        {/* Observação: as 2 primeiras linhas (a folha de detalhes mostra o texto inteiro) */}
        {item.observacao && <span className="mt-2.5 line-clamp-2 whitespace-pre-line text-base leading-6 text-tinta-2">{item.observacao}</span>}
        <span className="mt-2 block text-[0.9375rem] leading-6 text-tinta-2">
          {item.dono}
          {areaCurta(item.dono) && ` · ${areaCurta(item.dono)}`}
          {item.data && ` · ${dataCurta(item.data)}`}
        </span>
      </BotaoItem>
    </section>
  );
}
