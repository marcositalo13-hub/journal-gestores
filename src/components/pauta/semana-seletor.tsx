"use client";

import { useState } from "react";
import type { DiaSemana } from "@/lib/edicao/montar";
import { contagem, inicialDoDia, numeroDoDia } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BotaoItem } from "./botao-item";
import { ConteudoLinha } from "./linha";
import { PillStatus } from "./pill-status";
import { Valor } from "./valor";

/** 7 células (cabem em 375px sem rolagem lateral); tocar numa célula lista os itens daquele dia. */
export function SemanaSeletor({ dias }: { dias: DiaSemana[] }) {
  const [sel, setSel] = useState(() => Math.max(0, dias.findIndex((d) => d.itens.length > 0)));
  const dia = dias[sel];

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5" role="group" aria-label="Próximos 7 dias">
        {dias.map((d, i) => {
          const marcado = i === sel;
          const n = d.itens.length;
          return (
            <button
              key={d.data}
              type="button"
              onClick={() => setSel(i)}
              aria-pressed={marcado}
              aria-label={`${d.rotulo}${d.ehDiaUtil ? "" : ", dia não útil"}, ${n === 0 ? "sem itens" : contagem(n, "item", "itens")}`}
              className={cn(
                "celula-dia flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl",
                marcado ? "bg-tinta text-papel" : d.ehDiaUtil ? "text-tinta" : "bg-papel-alt text-tinta-2",
              )}
            >
              <span className="text-[0.8125rem] font-medium leading-none">{inicialDoDia(d.data)}</span>
              <span className={cn("text-xl leading-none tabular-nums", d.ehDiaUtil ? "font-semibold" : "font-normal")}>{numeroDoDia(d.data)}</span>
              <span aria-hidden className={cn("mt-0.5 size-1.5 rounded-full", n > 0 ? (marcado ? "bg-papel" : "bg-destaque") : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <h3 className="rotulo-gestor mt-5">
        {dia.rotulo}
        {!dia.ehDiaUtil && " · dia não útil"}
      </h3>
      {dia.itens.length === 0 ? (
        <p className="py-3 text-base text-tinta-2">Nada neste dia.</p>
      ) : (
        <ul>
          {dia.itens.map((item) => (
            <li key={item.id} className="border-b border-borda last:border-b-0">
              <BotaoItem item={item}>
                <ConteudoLinha
                  item={item}
                  meta={
                    <>
                      {item.dono}
                      {typeof item.valor === "number" && (
                        <>
                          {" · "}
                          <Valor valor={item.valor} />
                        </>
                      )}
                    </>
                  }
                  direita={<PillStatus categoria={item.categoria} status={item.status} />}
                />
              </BotaoItem>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
