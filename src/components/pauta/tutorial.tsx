"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { construirPassos, decidir, lerEstado, marcarVisto, recusarOferta, reiniciar, seletorDaAncora, type Ancora, type Armazem, type Tour } from "@/lib/tour";

const EVENTO = "pauta:tutorial";

function armazem(): Armazem | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const reduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A primeira linha de item da tela recebe a âncora na hora (as linhas são de vários componentes; só a primeira importa). */
function marcarPrimeiraLinha() {
  document.querySelectorAll('[data-tour="primeira-linha"]').forEach((e) => e.removeAttribute("data-tour"));
  document.querySelector<HTMLElement>("main section[aria-labelledby] ul > li")?.setAttribute("data-tour", "primeira-linha");
}

const existe = (a: Ancora) => document.querySelector(seletorDaAncora(a)) !== null;

let ativo: ReturnType<typeof driver> | null = null;

/** Roda o tour: spotlight sobre a tela escurecida; âncora ausente vira popover centralizado. */
function iniciarTour(tour: Tour) {
  ativo?.destroy();
  if (tour === "hoje") marcarPrimeiraLinha();
  const sem = reduzido();
  const passos: DriveStep[] = construirPassos(tour, existe).map((p) => ({
    ...(p.seletor ? { element: p.seletor } : {}),
    popover: { title: p.titulo, description: p.texto, ...(p.seletor ? { side: p.lado, align: "center" as const } : {}) },
  }));
  const tinta = getComputedStyle(document.documentElement).getPropertyValue("--tinta").trim() || "#16181d";
  const d = driver({
    steps: passos,
    animate: !sem,
    smoothScroll: !sem,
    overlayColor: tinta,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 12,
    popoverOffset: 12,
    allowClose: true,
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    prevBtnText: "Voltar",
    nextBtnText: "Próximo",
    doneBtnText: "Concluir",
    closeBtnLabel: "Fechar",
    popoverClass: "tour-pauta",
    onPopoverRender: (popover, { driver: dr }) => {
      popover.closeButton.style.display = "none"; // "Pular" faz esse papel, em texto
      popover.footer.querySelector(".tour-pular")?.remove();
      const pular = document.createElement("button");
      pular.type = "button";
      pular.className = "tour-pular";
      pular.textContent = "Pular";
      pular.addEventListener("click", () => dr.destroy());
      popover.footer.appendChild(pular);
    },
    onDestroyed: () => {
      if (ativo === d) ativo = null;
    },
  });
  ativo = d;
  d.drive();
}

/** Há algo na frente que não deve ser coberto: abertura animada, cartão de notificações ou folha aberta. */
function ocupado(): boolean {
  return (
    document.documentElement.hasAttribute("data-intro") ||
    document.querySelector("[data-cartao-notificacoes]") !== null ||
    document.querySelector('[role="dialog"], [role="alertdialog"]') !== null ||
    new URLSearchParams(window.location.search).has("item")
  );
}

/** Espera a abertura animada terminar (atributo data-intro sai do html) e dá um respiro antes de agir. */
function aposAbertura(agir: () => void): () => void {
  const html = document.documentElement;
  let t: ReturnType<typeof setTimeout> | undefined;
  let obs: MutationObserver | undefined;
  const seguir = () => {
    t = setTimeout(agir, 700);
  };
  if (html.hasAttribute("data-intro")) {
    obs = new MutationObserver(() => {
      if (!html.hasAttribute("data-intro")) {
        obs?.disconnect();
        seguir();
      }
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-intro"] });
  } else seguir();
  return () => {
    obs?.disconnect();
    if (t) clearTimeout(t);
  };
}

/**
 * Orquestra o tutorial: oferta ao primeiro acesso (cartão inferior), tour de cada aba na primeira vez que ela abre e o
 * reinício pelo link "Tutorial". Nunca por cima da abertura animada nem do cartão de notificações.
 */
export function Tutorial() {
  const rota = usePathname();
  const [ofertaEm, setOfertaEm] = useState<string | null>(null); // rota em que a oferta foi aberta (trocar de aba a esconde)

  useEffect(() => {
    return aposAbertura(() => {
      const acao = decidir({ rota, estado: lerEstado(armazem()), ocupado: ocupado() });
      if (acao === "oferecer") setOfertaEm(rota);
      else if (acao) {
        marcarVisto(armazem(), acao); // marcado ao começar: recarregar no meio não repete
        iniciarTour(acao);
      }
    });
  }, [rota]);

  useEffect(() => {
    const aoPedir = () => {
      if (window.location.pathname !== "/") return;
      reiniciar(armazem());
      setOfertaEm(null);
      iniciarTour("hoje");
    };
    window.addEventListener(EVENTO, aoPedir);
    return () => {
      window.removeEventListener(EVENTO, aoPedir);
      ativo?.destroy();
    };
  }, []);

  const comecar = useCallback(() => {
    marcarVisto(armazem(), "hoje");
    setOfertaEm(null);
    iniciarTour("hoje");
  }, []);
  const agoraNao = useCallback(() => {
    recusarOferta(armazem());
    setOfertaEm(null);
  }, []);

  if (ofertaEm !== rota) return null;
  return (
    <section aria-label="Tutorial" className="oferta-tour fixed inset-x-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[608px] rounded-2xl border border-borda bg-papel px-4 pt-4 pb-3 shadow-[0_8px_28px_rgba(22,24,29,0.16)]">
      <p className="titulo-jornal text-[1.25rem] leading-snug">Quer conhecer A Pauta em 1 minuto?</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={agoraNao} className="pressionavel min-h-11 px-3 text-base text-tinta-2">
          Agora não
        </button>
        <button type="button" onClick={comecar} className="pressionavel min-h-11 rounded-xl bg-tinta px-5 text-base font-semibold text-papel">
          Começar
        </button>
      </div>
    </section>
  );
}

/** Link discreto "Tutorial", ao lado de "Legenda": reabre o tour de Hoje. */
export function BotaoTutorial() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO))}
      className="pressionavel min-h-11 px-3 text-[0.9375rem] text-tinta-2 underline decoration-borda decoration-1 underline-offset-4"
    >
      Tutorial
    </button>
  );
}
