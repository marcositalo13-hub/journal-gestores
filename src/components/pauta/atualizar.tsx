"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { atualizarEdicao } from "@/app/(app)/acoes";
import { cn } from "@/lib/utils";

/** Expira o cache da leitura e re-renderiza a rota atual (router.refresh). */
export function useAtualizar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const atualizar = () =>
    iniciar(async () => {
      try {
        await atualizarEdicao();
      } finally {
        router.refresh();
      }
    });
  return { pendente, atualizar };
}

/** "atualizado às 14h22": tocar atualiza. A área de toque é ampliada sem mexer no layout do texto. */
export function AtualizadoBotao({ texto }: { texto: string }) {
  const { pendente, atualizar } = useAtualizar();
  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={pendente}
      aria-busy={pendente}
      aria-label={`${texto}. Toque para atualizar.`}
      className={cn("relative inline underline decoration-borda decoration-1 underline-offset-4 transition-opacity duration-150 after:absolute after:inset-x-0 after:-inset-y-3.5", pendente && "opacity-50")}
    >
      {pendente ? "atualizando…" : texto}
    </button>
  );
}

export function ErroEdicao() {
  const { pendente, atualizar } = useAtualizar();
  return (
    <div role="alert" className="py-10 text-center">
      <p className="font-jornal text-[1.375rem] leading-snug text-tinta">Não foi possível carregar a edição agora.</p>
      <button type="button" onClick={atualizar} disabled={pendente} className="botao-primario mt-6 px-6">
        {pendente ? "Tentando…" : "Tentar de novo"}
      </button>
    </div>
  );
}
