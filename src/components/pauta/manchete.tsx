import { diasEntre } from "@/lib/calendario";
import type { MancheteEdicao, RegraManchete } from "@/lib/edicao/montar";
import { dataCurta, venceEm } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BotaoItem } from "./botao-item";
import { Valor } from "./valor";

const KICKER: Record<RegraManchete, string> = {
  pagamento: "Pagamento relevante",
  contrato: "Contrato vencendo",
  pendencia: "Atrasado",
  travado: "Travado",
};

const semPontoFinal = (s: string) => s.replace(/\.$/, "");
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Para pagamentos NÃO usamos o texto pronto da edição (ele embute o valor em reais e não poderia
 * ser ocultado pelo botão do olho): montamos "Vence ..." aqui e mostramos o valor com <Valor/>.
 */
function motivoDe(m: MancheteEdicao, hojeISO: string): string {
  if (m.regra === "pagamento" && m.item.data) return maiuscula(venceEm(diasEntre(hojeISO, m.item.data)));
  return semPontoFinal(m.motivo);
}

export function Manchete({ manchete, hoje }: { manchete: MancheteEdicao | null; hoje: string }) {
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
          {motivoDe(manchete, hoje)} · {item.dono}
          {item.data && ` · ${dataCurta(item.data)}`}
          {typeof item.valor === "number" && (
            <>
              {" · "}
              <Valor valor={item.valor} />
            </>
          )}
        </span>
      </BotaoItem>
    </section>
  );
}
