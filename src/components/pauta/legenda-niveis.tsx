"use client";

import { X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import type { Nivel } from "@/lib/niveis";
import { COR_BARRA } from "./nivel";

/** As regras chegam prontas do servidor (geradas dos valores da config; o config não vai para o navegador). */
export function LegendaNiveis({ regras }: { regras: { nivel: Nivel; titulo: string; regra: string }[] }) {
  return (
    <div className="mt-10 flex justify-center">
      <Drawer>
        <DrawerTrigger asChild>
          <button type="button" className="pressionavel min-h-11 px-3 text-[0.9375rem] text-tinta-2 underline decoration-borda decoration-1 underline-offset-4">
            Legenda
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3">
              <DrawerTitle className="titulo-jornal text-[1.625rem] leading-[1.15]">Legenda das cores</DrawerTitle>
              <DrawerClose asChild>
                <button type="button" aria-label="Fechar" className="pressionavel -mr-2 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-tinta-2">
                  <X aria-hidden size={24} strokeWidth={1.75} />
                </button>
              </DrawerClose>
            </div>
            <DrawerDescription className="mt-1 text-[0.9375rem] text-tinta-2">
              A barra à esquerda de cada item mostra a urgência; o texto ao lado repete o motivo.
            </DrawerDescription>
          </DrawerHeader>
          <ul className="overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {regras.map((r) => (
              <li key={r.nivel} className="flex items-stretch gap-4 border-b border-borda py-3.5 last:border-b-0">
                <span aria-hidden className={`w-1 shrink-0 rounded-full ${COR_BARRA[r.nivel]}`} />
                <span className="block min-w-0">
                  <span className="block text-base font-semibold leading-6">{r.titulo}</span>
                  <span className="block text-[0.9375rem] leading-6 text-tinta-2">{r.regra}</span>
                </span>
              </li>
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
