"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Cabeçalho do app. Em "Hoje" (/): cabeçalho completo (nome grande, saudação, data por extenso).
 * Nas demais páginas: compacto: "A Pauta" pequeno com olho e Sair na mesma linha, e abaixo "data · atualizado".
 * Os pedaços vêm prontos do servidor (props); aqui só se escolhe qual mostrar.
 */
export function CabecalhoApp({
  acoes,
  saudacao,
  dataExtenso,
  dataCompacta,
  atualizado,
}: {
  acoes: ReactNode;
  saudacao: ReactNode;
  dataExtenso: ReactNode;
  dataCompacta: ReactNode;
  atualizado: ReactNode;
}) {
  const completo = usePathname() === "/";
  return (
    <header className="topo-seguro regua-dupla">
      <div className="mx-auto w-full max-w-[640px] px-5 pb-5">
        {completo ? (
          <>
            <div className="flex items-center justify-end gap-1">{acoes}</div>
            <h1 className="titulo-jornal text-[2.1rem] sm:text-[2.55rem]">A Pauta</h1>
            <p className="mt-3 text-base text-tinta">{saudacao}</p>
            <p className="mt-1 text-base text-tinta-2">{dataExtenso}</p>
            <p className="mt-1 text-[0.875rem] text-tinta-2">{atualizado}</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="titulo-jornal text-[1.5rem]">A Pauta</h1>
              <div className="flex items-center gap-1">{acoes}</div>
            </div>
            <p className="-mt-1 whitespace-nowrap text-[0.875rem] text-tinta-2">
              {dataCompacta} · {atualizado}
            </p>
          </>
        )}
      </div>
    </header>
  );
}
