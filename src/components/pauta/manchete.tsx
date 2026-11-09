import { areaCurta } from "@/lib/config";
import type { MancheteEdicao, RegraManchete } from "@/lib/edicao/montar";
import { dataCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BotaoItem } from "./botao-item";

const KICKER: Record<RegraManchete, string> = {
  contrato: "Contrato vencendo",
  pendencia: "Atrasado",
  travado: "Travado",
};

const semPontoFinal = (s: string) => s.replace(/\.$/, "");

export function Manchete({ manchete }: { manchete: MancheteEdicao | null }) {
  if (!manchete) {
    return (
      <section aria-label="Manchete" className="pb-2">
        <p className="font-jornal text-[1.5rem] leading-snug text-tinta-2">Sem urgências hoje.</p>
      </section>
    );
  }
  const { item, regra } = manchete;
  const urgente = regra === "pendencia" || regra === "travado";
  return (
    <section aria-label="Manchete" className="pb-1">
      <BotaoItem item={item} className="block pt-1 pb-5">
        <span className={cn("kicker", urgente ? "text-alerta" : "text-destaque")}>{KICKER[regra]}</span>
        <span className="titulo-jornal mt-2 block text-[1.875rem] leading-[1.1]">{item.nome}</span>
        <span className="mt-3 block text-base leading-6 text-tinta-2">
          {semPontoFinal(manchete.motivo)} · {item.dono}
          {areaCurta(item.dono) && ` · ${areaCurta(item.dono)}`}
          {item.data && ` · ${dataCurta(item.data)}`}
        </span>
      </BotaoItem>
    </section>
  );
}
