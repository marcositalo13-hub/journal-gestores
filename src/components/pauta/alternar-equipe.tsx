"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { cn } from "@/lib/utils";

/** "Só {nome}" | "Com equipe" — mesmo idioma do navegador de dias: tinta + régua de 2px. Estado na URL (?equipe=1). */
export function AlternarEquipe({ primeiroNome, comEquipe }: { primeiroNome: string; comEquipe: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [atual, setAtual] = useOptimistic(comEquipe);

  function escolher(valor: boolean) {
    if (valor === atual) return;
    const p = new URLSearchParams(params.toString()); // preserva ?data= (simulação em dev)
    if (valor) p.set("equipe", "1");
    else p.delete("equipe");
    const q = p.toString();
    startTransition(() => {
      setAtual(valor);
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    });
  }

  const opcoes = [
    { rotulo: `Só ${primeiroNome}`, valor: false },
    { rotulo: "Com equipe", valor: true },
  ];
  return (
    <div role="group" aria-label="Itens exibidos" className="relative mt-5 grid w-full max-w-[20rem] grid-cols-2 border-b border-borda">
      {opcoes.map((o) => (
        <button
          key={o.rotulo}
          type="button"
          aria-pressed={o.valor === atual}
          onClick={() => escolher(o.valor)}
          className={cn("dia-nav min-h-11 truncate px-2 text-base", o.valor === atual ? "font-semibold text-tinta" : "font-medium text-tinta-2")}
        >
          {o.rotulo}
        </button>
      ))}
      <span aria-hidden className="regua-tinta absolute bottom-[-1px] left-0 h-0.5 w-1/2 bg-tinta" style={{ transform: `translateX(${atual ? 100 : 0}%)` }} />
    </div>
  );
}
