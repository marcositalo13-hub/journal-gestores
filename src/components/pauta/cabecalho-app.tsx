"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const Sep = () => <span className="shrink-0">&nbsp;·&nbsp;</span>;

/**
 * Cabeçalho compacto em todas as abas. Linha 1: "A Pauta" pequeno à esquerda; olho e Sair à direita.
 * Linha 2: em Hoje, "Bom dia, {nome} · {data} · atualizado às HHhMM"; nas demais, o mesmo sem a saudação.
 * Em tela estreita só a data é cortada (com reticências): o nome e o "atualizado" (que atualiza ao toque) nunca quebram.
 * Os pedaços vêm prontos do servidor (props); aqui só se decide se a saudação aparece.
 */
export function CabecalhoApp({
  acoes,
  saudacao,
  dataCompacta,
  atualizado,
}: {
  acoes: ReactNode;
  saudacao: ReactNode;
  dataCompacta: ReactNode;
  atualizado: ReactNode;
}) {
  const emHoje = usePathname() === "/";
  return (
    <header className="topo-seguro regua-dupla">
      <div className="mx-auto w-full max-w-[640px] px-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="titulo-jornal text-[1.5rem]">
            <span data-marca-cabecalho className="marca-cabecalho inline-block">
              A Pauta
            </span>
          </h1>
          <div className="flex items-center gap-1">{acoes}</div>
        </div>
        <p className="-mt-1 flex min-w-0 whitespace-nowrap text-[0.8125rem] text-tinta-2">
          {emHoje && (
            <>
              <span className="shrink-0">{saudacao}</span>
              <Sep />
            </>
          )}
          <span className="min-w-0 truncate">{dataCompacta}</span>
          <Sep />
          <span className="shrink-0">{atualizado}</span>
        </p>
      </div>
    </header>
  );
}
