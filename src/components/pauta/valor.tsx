import { moeda } from "@/lib/formato";

/**
 * Valor monetário que respeita "ocultar valores". Renderiza as duas versões e o CSS
 * (html[data-ocultar], definido por um script antes da pintura) escolhe qual mostrar:
 * assim não há "flash" do número real e funciona em Server Components.
 */
export function Valor({ valor }: { valor: number }) {
  return (
    <>
      <span className="valor-real">{moeda(valor)}</span>
      <span className="valor-oculto">R$ •••</span>
    </>
  );
}
