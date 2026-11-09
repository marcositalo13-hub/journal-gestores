"use client";

import { useEffect } from "react";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { useDetalhe } from "./detalhe";

/** Ao abrir o app por uma notificação (?item=ID), abre a folha de detalhes do item e limpa o parâmetro da URL. */
export function AbrirItem({ item }: { item: ItemEdicao }) {
  const { abrir } = useDetalhe();
  useEffect(() => {
    abrir(item);
    const u = new URL(window.location.href);
    u.searchParams.delete("item");
    window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
  }, [item, abrir]);
  return null;
}
