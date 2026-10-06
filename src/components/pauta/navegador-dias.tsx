"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { contagem, inicialDoDia, numeroDoDia } from "@/lib/formato";
import { cn } from "@/lib/utils";

export interface DiaNavegador {
  data: string;
  ehDiaUtil: boolean;
  itens: number;
}

/**
 * "Hoje" + os 6 dias seguintes. O dia escolhido vai para a URL (?dia=YYYY-MM-DD): atualizar e
 * voltar funcionam, e a troca é no cliente (sem recarregar). A régua de tinta desliza na hora
 * (estado otimista) enquanto o servidor monta a lista do dia.
 */
export function NavegadorDias({ dias, selecionado }: { dias: DiaNavegador[]; selecionado: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [atual, setAtual] = useOptimistic(selecionado);
  const indice = Math.max(0, dias.findIndex((d) => d.data === atual));

  function ir(d: string, i: number) {
    if (d === atual) return;
    const p = new URLSearchParams(params.toString()); // preserva ?data= (simulação em dev)
    if (i === 0) p.delete("dia");
    else p.set("dia", d);
    const q = p.toString();
    startTransition(() => {
      setAtual(d);
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    });
  }

  return (
    <nav aria-label="Dias" className="relative -mt-2 mb-6 border-b border-borda">
      <ul className="grid grid-cols-7">
        {dias.map((d, i) => {
          const marcado = i === indice;
          const rotulo = i === 0 ? "Hoje" : inicialDoDia(d.data);
          return (
            <li key={d.data} className="min-w-0">
              <button
                type="button"
                onClick={() => ir(d.data, i)}
                aria-current={marcado ? "date" : undefined}
                aria-label={`${i === 0 ? "Hoje, " : ""}${d.data.split("-").reverse().slice(0, 2).join("/")}${d.ehDiaUtil ? "" : ", dia não útil"}, ${d.itens === 0 ? "sem itens" : contagem(d.itens, "item", "itens")}`}
                className={cn(
                  "dia-nav flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 pb-1.5 pt-1",
                  marcado ? "text-tinta" : d.ehDiaUtil ? "text-tinta-2" : "text-tinta-2/55",
                )}
              >
                <span className={cn("text-[0.8125rem] leading-none", marcado || i === 0 ? "font-semibold" : "font-medium")}>{rotulo}</span>
                <span className={cn("text-[1.1875rem] leading-tight tabular-nums", marcado ? "font-semibold" : "font-normal")}>{numeroDoDia(d.data)}</span>
                <span aria-hidden className={cn("size-1 rounded-full", d.itens > 0 ? "bg-tinta" : "bg-transparent")} />
              </button>
            </li>
          );
        })}
      </ul>
      {/* régua de tinta de 2px: desliza só com transform */}
      <span
        aria-hidden
        className="regua-tinta absolute bottom-[-1px] left-0 h-0.5 w-[calc(100%/7)] bg-tinta"
        style={{ transform: `translateX(${indice * 100}%)` }}
      />
    </nav>
  );
}
