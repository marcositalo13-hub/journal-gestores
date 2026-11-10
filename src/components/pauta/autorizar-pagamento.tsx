"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Drawer as DrawerPrimitive } from "vaul";
import { autorizarPagamento, desfazerAutorizacao } from "@/app/(app)/pagamentos/acoes";
import { DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { perguntaAutorizacao } from "@/lib/textos-pagamento";

const DESFAZER_MS = 10_000;

function oferecerDesfazer(itemId: string) {
  toast("Pagamento autorizado", {
    duration: DESFAZER_MS,
    action: {
      label: "Desfazer",
      onClick: () => {
        const id = toast.loading("Desfazendo…");
        desfazerAutorizacao(itemId)
          .then((r) => (r.ok ? toast("Autorização desfeita", { id }) : toast.error(r.erro, { id })))
          .catch(() => toast.error("Não foi possível desfazer agora. Altere o Status no monday.", { id }));
      },
    },
  });
}

/**
 * Botão de tinta "Autorizar pagamento" + confirmação numa folha aninhada. Sem atualização otimista: a tela só
 * muda quando o monday confirma (a ação revalida o cache e as telas). Em erro, a mensagem fica na confirmação.
 */
export function AutorizarPagamento({ item, aoAutorizar }: { item: ItemEdicao; aoAutorizar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function abrir() {
    setErro(null);
    setConfirmando(true);
  }

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await autorizarPagamento(item.id).catch(() => null);
      if (r?.ok) {
        setConfirmando(false);
        aoAutorizar();
        oferecerDesfazer(item.id);
      } else setErro(r?.erro ?? "Não foi possível falar com o servidor. Nada foi alterado; tente de novo.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="pressionavel flex min-h-12 w-full items-center justify-center rounded-xl bg-tinta px-4 text-[1.0625rem] font-semibold text-papel"
      >
        Autorizar pagamento
      </button>

      <DrawerPrimitive.NestedRoot open={confirmando} onOpenChange={(v) => !pendente && setConfirmando(v)} dismissible={!pendente}>
        <DrawerContent role="alertdialog" aria-busy={pendente || undefined}>
          <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <DrawerTitle className="titulo-jornal text-[1.375rem] leading-[1.2]">{perguntaAutorizacao(item)}</DrawerTitle>
            <DrawerDescription className="mt-2 text-[0.9375rem]">O Status no monday passa para Autorizado, com o seu nome e a data de hoje.</DrawerDescription>
            {erro && (
              <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-snug text-alerta">
                {erro}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2.5">
              <button type="button" onClick={confirmar} disabled={pendente} className="pressionavel flex min-h-12 w-full items-center justify-center rounded-xl bg-tinta px-4 text-[1.0625rem] font-semibold text-papel disabled:opacity-60">
                {pendente ? "Autorizando…" : "Autorizar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pendente}
                className="pressionavel min-h-12 w-full rounded-xl border border-borda px-4 text-[1.0625rem] font-semibold text-tinta disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DrawerContent>
      </DrawerPrimitive.NestedRoot>
    </>
  );
}
