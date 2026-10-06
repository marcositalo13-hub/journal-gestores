"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { dataCurta, etapasTexto } from "@/lib/formato";
import { PillStatus } from "./pill-status";
import { Valor } from "./valor";

interface ContextoDetalhe {
  abrir: (item: ItemEdicao) => void;
}
const Contexto = createContext<ContextoDetalhe | null>(null);

export function useDetalhe(): ContextoDetalhe {
  const c = useContext(Contexto);
  if (!c) throw new Error("useDetalhe precisa estar dentro de <ProvedorDetalhe>.");
  return c;
}

/** Um único painel de detalhes para o app inteiro (Hoje e Gestores). */
export function ProvedorDetalhe({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ItemEdicao | null>(null);
  const [aberto, setAberto] = useState(false);

  const abrir = useCallback((i: ItemEdicao) => {
    setItem(i); // o item fica montado enquanto a folha fecha (sem "piscar" vazio)
    setAberto(true);
  }, []);
  const valor = useMemo(() => ({ abrir }), [abrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <FolhaDetalhe item={item} aberto={aberto} onAberto={setAberto} />
    </Contexto.Provider>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-borda py-3 last:border-b-0">
      <dt className="w-[7.25rem] shrink-0 text-[0.9375rem] leading-6 text-tinta-2">{rotulo}</dt>
      <dd className="min-w-0 flex-1 break-words text-base leading-6">{children}</dd>
    </div>
  );
}

function FolhaDetalhe({ item, aberto, onAberto }: { item: ItemEdicao | null; aberto: boolean; onAberto: (v: boolean) => void }) {
  return (
    <Drawer open={aberto} onOpenChange={onAberto}>
      <DrawerContent>
        {item && (
          <>
            <DrawerHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="rotulo-tipo">
                    {item.tipo} · {item.dono}
                  </p>
                  <DrawerTitle className="titulo-jornal mt-1.5 text-[1.625rem] leading-[1.15]">{item.nome}</DrawerTitle>
                </div>
                <DrawerClose asChild>
                  <button type="button" aria-label="Fechar" className="pressionavel -mr-2 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-tinta-2">
                    <X aria-hidden size={24} strokeWidth={1.75} />
                  </button>
                </DrawerClose>
              </div>
              <DrawerDescription className="sr-only">Detalhes do item selecionado.</DrawerDescription>
            </DrawerHeader>

            <dl className="overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <Campo rotulo={"dataHerdada" in item && item.dataHerdada ? "Prazo da última etapa" : "Prazo"}>
                {item.data ? dataCurta(item.data) : <span className="text-alerta">Sem prazo definido</span>}
              </Campo>
              <Campo rotulo="Status">
                <PillStatus categoria={item.categoria} status={item.status} />
              </Campo>
              {item.responsavel && <Campo rotulo="Responsável">{item.responsavel}</Campo>}
              {item.observacao && <Campo rotulo="Observação">{item.observacao}</Campo>}
              {item.recorrencia && <Campo rotulo="Recorrência">{item.recorrencia}</Campo>}
              {typeof item.valor === "number" && (
                <Campo rotulo="Valor">
                  <Valor valor={item.valor} />
                </Campo>
              )}
              {item.favorecido && <Campo rotulo="Favorecido">{item.favorecido}</Campo>}
              {item.coordenacao && <Campo rotulo="Coordenação">{item.coordenacao}</Campo>}
              {item.etapas && (
                <Campo rotulo="Etapas">
                  <div
                    role="progressbar"
                    aria-label="Etapas concluídas"
                    aria-valuemin={0}
                    aria-valuemax={item.etapas.total}
                    aria-valuenow={item.etapas.concluidas}
                    aria-valuetext={etapasTexto(item.etapas)}
                    className="h-2 overflow-hidden rounded-full border border-borda bg-papel-alt"
                  >
                    <div className="h-full bg-destaque" style={{ width: `${(item.etapas.concluidas / item.etapas.total) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[0.9375rem] text-tinta-2">{etapasTexto(item.etapas)}</p>
                </Campo>
              )}
            </dl>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
