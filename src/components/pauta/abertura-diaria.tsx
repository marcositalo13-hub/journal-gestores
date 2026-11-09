"use client";

import { useEffect, useRef } from "react";
import { CHAVE_ABERTURA } from "@/lib/abertura";

// Tempos (ms). Com movimento: ENTRADA + PAUSA + VOO = 750 (≤ 900).
const ENTRADA = 180;
const PAUSA = 120;
const VOO = 450;
// Sem movimento (prefers-reduced-motion): marca parada e uma dissolvência curta.
const PAUSA_REDUZIDA = 300;
const DISSOLVER = 150;
const SAIDA_RAPIDA = 100; // toque para pular

const CURVA_VOO = "cubic-bezier(0.77, 0, 0.175, 1)"; // ease-in-out forte: a marca atravessa a tela
const CURVA_SAIDA = "cubic-bezier(0.23, 1, 0.32, 1)"; // ease-out forte

/**
 * Primeira abertura do dia (dia de São Paulo): "A Pauta" grande no centro e, em seguida, ela voa até a posição
 * da marca no cabeçalho (FLIP: só transform e opacity). Um toque pula. A decisão de mostrar vem do atributo
 * data-intro do html, posto por script antes da primeira pintura (veja lib/abertura.ts); a página carrega por baixo.
 */
export function AberturaDiaria() {
  const camada = useRef<HTMLDivElement>(null);
  const fundo = useRef<HTMLDivElement>(null);
  const marca = useRef<HTMLSpanElement>(null);
  const pular = useRef<(() => void) | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const dia = html.getAttribute("data-intro");
    const c = camada.current;
    const f = fundo.current;
    const m = marca.current;
    if (!dia || !c || !f || !m) return;

    try {
      localStorage.setItem(CHAVE_ABERTURA, dia); // gravado ao começar: recarregar não repete
    } catch {
      // armazenamento bloqueado: segue só nesta visita
    }

    const animacoes: Animation[] = [];
    let terminou = false;
    const terminar = () => {
      if (terminou) return;
      terminou = true;
      animacoes.forEach((a) => a.cancel());
      html.removeAttribute("data-intro"); // some a camada e a marca do cabeçalho reaparece, no mesmo quadro
    };
    const anim = (e: HTMLElement, k: Keyframe[], o: KeyframeAnimationOptions) => {
      const a = e.animate(k, { fill: "both", ...o });
      animacoes.push(a);
      return a.finished;
    };
    const aoFim = (ps: Promise<unknown>[]) => Promise.all(ps).then(terminar, () => undefined); // cancelada: ignora

    pular.current = () => {
      if (terminou) return;
      animacoes.forEach((a) => a.cancel());
      animacoes.length = 0;
      void aoFim([anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: SAIDA_RAPIDA, easing: CURVA_SAIDA })]);
    };

    const alvo = html.querySelector<HTMLElement>("[data-marca-cabecalho]");
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduzido || !alvo) {
      // sem movimento: a marca fica parada e tudo se dissolve em 150 ms
      void aoFim([
        anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: DISSOLVER, delay: PAUSA_REDUZIDA, easing: "linear" }),
        anim(m, [{ opacity: 1 }, { opacity: 0 }], { duration: DISSOLVER, delay: PAUSA_REDUZIDA, easing: "linear" }),
      ]);
    } else {
      const de = m.getBoundingClientRect();
      const para = alvo.getBoundingClientRect();
      const escala = para.width / de.width;
      const dx = para.left + para.width / 2 - (de.left + de.width / 2);
      const dy = para.top + para.height / 2 - (de.top + de.height / 2);
      void aoFim([
        // a marca aparece, espera um instante e voa até o cabeçalho
        anim(m, [{ opacity: 0 }, { opacity: 1 }], { duration: ENTRADA, easing: CURVA_SAIDA }),
        anim(m, [{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${escala})` }], {
          duration: VOO,
          delay: ENTRADA + PAUSA,
          easing: CURVA_VOO,
        }),
        // o papel se dissolve durante o voo, revelando a página que já carregou por baixo
        anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: VOO, delay: ENTRADA + PAUSA, easing: CURVA_SAIDA }),
      ]);
    }

    return () => {
      pular.current = null;
      animacoes.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div ref={camada} className="abertura" aria-hidden onPointerDown={() => pular.current?.()}>
      <div ref={fundo} className="absolute inset-0 bg-papel" />
      <span ref={marca} className="abertura-marca titulo-jornal relative">
        A Pauta
      </span>
    </div>
  );
}
