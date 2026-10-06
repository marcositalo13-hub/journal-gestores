import { Check, Lock } from "lucide-react";
import type { Categoria } from "@/lib/edicao/itens";
import { cn } from "@/lib/utils";

const PADRAO: Record<Categoria, string> = {
  aberto: "Em aberto",
  concluido: "Concluído",
  travado: "Travado",
  cancelado: "Cancelado",
};

/** Cor nunca é o único sinal: sempre há o texto do status; concluído e travado têm também um ícone. */
export function PillStatus({ categoria, status }: { categoria: Categoria; status: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-semibold leading-5",
        categoria === "concluido" && "border-ok/30 text-ok",
        categoria === "travado" && "border-alerta/30 text-alerta",
        categoria !== "concluido" && categoria !== "travado" && "border-borda text-tinta-2",
      )}
    >
      {categoria === "concluido" && <Check aria-hidden size={14} strokeWidth={2.5} />}
      {categoria === "travado" && <Lock aria-hidden size={13} strokeWidth={2.25} />}
      {status?.trim() || PADRAO[categoria]}
    </span>
  );
}
