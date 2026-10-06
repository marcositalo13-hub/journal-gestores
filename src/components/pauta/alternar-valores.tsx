"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";

export const CHAVE_OCULTAR_VALORES = "pauta:ocultar-valores";
const EVENTO = "pauta:valores";

// A fonte da verdade é o atributo data-ocultar no <html> (aplicado por um script inline antes
// da primeira pintura, lendo o localStorage). O botão só lê e altera esse atributo.
function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
}
const ler = () => document.documentElement.hasAttribute("data-ocultar");
const lerNoServidor = () => false;

export function AlternarValores() {
  const oculto = useSyncExternalStore(assinar, ler, lerNoServidor);

  function alternar() {
    const novo = !oculto;
    document.documentElement.toggleAttribute("data-ocultar", novo);
    try {
      localStorage.setItem(CHAVE_OCULTAR_VALORES, novo ? "1" : "0");
    } catch {
      // modo privado / armazenamento bloqueado: vale só nesta sessão
    }
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oculto}
      aria-label={oculto ? "Mostrar valores" : "Ocultar valores"}
      className="pressionavel flex min-h-11 min-w-11 items-center justify-center text-tinta-2"
    >
      {oculto ? <EyeOff aria-hidden size={22} strokeWidth={1.75} /> : <Eye aria-hidden size={22} strokeWidth={1.75} />}
    </button>
  );
}
