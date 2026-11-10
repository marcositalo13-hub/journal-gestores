"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { cn } from "@/lib/utils";

export type VisaoPagamentos = "aguardando" | "autorizados";

const OPCOES: { valor: VisaoPagamentos; rotulo: string }[] = [
  { valor: "aguardando", rotulo: "Aguardando" },
  { valor: "autorizados", rotulo: "Autorizados" },
];

/**
 * "Aguardando" | "Autorizados", no mesmo estilo do navegador de dias: texto, régua de tinta de 2px que desliza
 * (só transform) e estado na URL (?ver=autorizados), com a troca no cliente e a régua otimista.
 */
export function SeletorPagamentos({ atual: doServidor }: { atual: VisaoPagamentos }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [atual, setAtual] = useOptimistic(doServidor);
  const indice = OPCOES.findIndex((o) => o.valor === atual);

  function ir(v: VisaoPagamentos) {
    if (v === atual) return;
    const p = new URLSearchParams(params.toString()); // preserva ?data= / ?fixture= (desenvolvimento)
    p.delete("item");
    if (v === "aguardando") p.delete("ver");
    else p.set("ver", v);
    const q = p.toString();
    startTransition(() => {
      setAtual(v);
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    });
  }

  return (
    <nav aria-label="Pagamentos" className="relative mt-4 mb-2 border-b border-borda">
      <ul className="grid grid-cols-2">
        {OPCOES.map((o, i) => {
          const marcado = i === indice;
          return (
            <li key={o.valor} data-tour={o.valor === "autorizados" ? "pag-autorizados" : undefined}>
              <button
                type="button"
                onClick={() => ir(o.valor)}
                aria-current={marcado ? "page" : undefined}
                className={cn("dia-nav flex min-h-11 w-full items-center justify-center pb-1 text-[1rem]", marcado ? "font-semibold text-tinta" : "font-medium text-tinta-2")}
              >
                {o.rotulo}
              </button>
            </li>
          );
        })}
      </ul>
      <span aria-hidden className="regua-tinta absolute bottom-[-1px] left-0 h-0.5 w-1/2 bg-tinta" style={{ transform: `translateX(${indice * 100}%)` }} />
    </nav>
  );
}
