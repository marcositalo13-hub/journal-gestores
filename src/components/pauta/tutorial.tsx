"use client";

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { construirRoteiro, deveOferecer, indiceAnterior, marcarOfertaVista, ofertaVista, resolverSeletor, rotuloProgresso, seletorDaAncora, type Ancora, type Armazem, type Passo } from "@/lib/tour";

const EVENTO = "pauta:tutorial";
const ESPERA_PAGINA_MS = 4000;
const ESPERA_FOLHA_MS = 3000;
const ESPERA_ANCORA_MS = 1500;
const TEXTO_SEM_ITEM = "Quando houver itens na tela, toque em um deles para ver os detalhes.";

function armazem(): Armazem | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const reduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const existe = (a: Ancora) => document.querySelector(seletorDaAncora(a)) !== null;

/** Espera `pronto()` ficar verdadeiro (verifica a cada 100 ms), no máximo `ms`. */
async function esperar(pronto: () => boolean, ms: number): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (pronto()) return true;
    await dormir(100);
  }
  return pronto();
}

/** A primeira linha de item da tela recebe a âncora na hora (as linhas vêm de vários componentes; só a primeira importa). */
function marcarPrimeiraLinha() {
  document.querySelectorAll('[data-tour="primeira-linha"]').forEach((e) => e.removeAttribute("data-tour"));
  document.querySelector<HTMLElement>("main section[aria-labelledby] ul > li")?.setAttribute("data-tour", "primeira-linha");
}

// data-state="closed" é a folha em animação de saída: já não conta como aberta
const folhaAberta = () => document.querySelector('[data-slot="drawer-content"][data-state="open"]') !== null;
function fecharFolha() {
  document.querySelector<HTMLElement>('[data-slot="drawer-content"] [aria-label="Fechar"]')?.click();
}

// ---------- sessão do tour (módulo: sobrevive à troca de aba, porque o layout não desmonta) ----------

interface Sessao {
  roteiro: Passo[];
  i: number;
  d: Driver | null;
  /** o passo atual está sem destaque (âncora ausente): popover centralizado */
  semDestaque: boolean;
  /** a folha foi aberta pelo tour (fechar ao encerrar) */
  abriuFolha: boolean;
  /** navegação feita pelo próprio tour (a troca manual da aba pelo usuário encerra o tour) */
  navegando: boolean;
  /** invalida esperas pendentes quando o passo muda ou o tour acaba */
  token: number;
  /** limpeza do passo atual (toque no destaque, temporizadores) */
  limpar: (() => void)[];
  /** ouvintes da sessão inteira (ESC, gesto de voltar) */
  globais: (() => void)[];
}

let sessao: Sessao | null = null;
let roteador: { push: (rota: string) => void } | null = null;

const ativa = (s: Sessao, t: number) => sessao === s && s.token === t;

function limparPasso(s: Sessao) {
  s.limpar.splice(0).forEach((f) => f());
}

/** Encerra sem erro, em qualquer estado: Pular, Pronto, ESC, gesto de voltar ou troca manual de aba. */
function encerrar() {
  const s = sessao;
  if (!s) return;
  sessao = null;
  s.token++;
  limparPasso(s);
  s.globais.splice(0).forEach((f) => f());
  try {
    s.d?.destroy();
  } catch {
    // já destruído
  }
  if (s.abriuFolha && folhaAberta()) fecharFolha();
}

function avancar() {
  const s = sessao;
  if (!s) return;
  const p = s.roteiro[s.i];
  if (p.tipo === "final") {
    encerrar();
    if (window.location.pathname !== "/") roteador?.push("/");
    return;
  }
  void (async () => {
    const t = ++s.token;
    // passo interativo sem item na tela: não há folha para mostrar, pula direto
    const pulo = p.tipo === "interativo" ? 2 : 1;
    if (p.tipo === "folha" && folhaAberta()) {
      fecharFolha();
      await esperar(() => !folhaAberta(), 1500);
      if (!ativa(s, t)) return;
    }
    void ir(s, s.i + pulo);
  })();
}

function voltar() {
  const s = sessao;
  if (!s) return;
  const j = indiceAnterior(s.roteiro, s.i);
  if (j === null) return;
  void (async () => {
    const t = ++s.token;
    if (s.roteiro[s.i].tipo === "folha" && folhaAberta()) {
      fecharFolha();
      await esperar(() => !folhaAberta(), 1500);
      if (!ativa(s, t)) return;
    }
    void ir(s, j);
  })();
}

/** Rodapé numa linha: progresso à esquerda; Pular, Voltar e o botão principal à direita (largura do conteúdo). */
function montarRodape(footer: HTMLElement) {
  const s = sessao;
  if (!s) return;
  const p = s.roteiro[s.i];
  const botao = (classe: string, texto: string, aoClicar: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = classe;
    b.textContent = texto;
    b.addEventListener("click", aoClicar);
    return b;
  };
  const progresso = document.createElement("span");
  progresso.className = "tour-progresso";
  progresso.textContent = rotuloProgresso(p);
  const acoes = document.createElement("div");
  acoes.className = "tour-acoes";
  acoes.append(botao("tour-pular", "Pular", encerrar));
  if (indiceAnterior(s.roteiro, s.i) !== null) acoes.append(botao("tour-voltar", "Voltar", voltar));
  // sem o item para tocar, o passo interativo vira um aviso com "Próximo"
  const rotulo = p.botao ?? (p.tipo === "interativo" && s.semDestaque ? "Próximo" : null);
  if (rotulo) acoes.append(botao("tour-primario", rotulo, avancar));
  footer.replaceChildren(progresso, acoes);
  footer.style.display = "flex";
}

function criarDriver(): Driver {
  const sem = reduzido();
  return driver({
    animate: !sem,
    smoothScroll: !sem,
    overlayColor: getComputedStyle(document.documentElement).getPropertyValue("--tinta").trim() || "#16181d",
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 12,
    popoverOffset: 12,
    // só "Pular" e "Pronto" encerram: toque no escurecido, ESC do driver e setas do driver ficam desligados
    allowClose: false,
    overlayClickBehavior: "none",
    allowKeyboardControl: false,
    popoverClass: "tour-pauta",
    onPopoverRender: (popover) => {
      popover.closeButton.style.display = "none";
      montarRodape(popover.footer);
    },
  });
}

/** Mostra o passo `i`: navega se for de outra aba, espera a âncora (até 4 s) e destaca; sem âncora, popover centralizado. */
async function ir(s: Sessao, i: number) {
  const p = s.roteiro[i];
  if (!p) {
    encerrar();
    return;
  }
  const t = ++s.token;
  limparPasso(s);
  s.i = i;

  if (window.location.pathname !== p.rota) {
    s.d?.destroy();
    s.d = null;
    s.navegando = true;
    roteador?.push(p.rota);
    await esperar(() => window.location.pathname === p.rota && document.querySelector("main h2") !== null, ESPERA_PAGINA_MS);
    if (!ativa(s, t)) return;
    s.navegando = false;
  }
  // a tela pode ainda estar chegando (a edição do monday vem em seguida): dá um respiro curto antes de desistir da âncora
  const achar = () => {
    if (p.id === "primeira-linha") marcarPrimeiraLinha();
    return resolverSeletor(p, existe);
  };
  if (p.ancoras.length > 0 && !achar()) {
    await esperar(() => achar() !== null, ESPERA_ANCORA_MS);
    if (!ativa(s, t)) return;
  }
  const seletor = achar();
  const el = seletor ? document.querySelector<HTMLElement>(seletor) : null;

  s.semDestaque = !el;
  s.d ??= criarDriver();
  s.d.highlight({
    ...(el ? { element: el } : {}),
    popover: {
      title: p.titulo,
      description: p.tipo === "interativo" && !el ? TEXTO_SEM_ITEM : p.texto,
      showButtons: [],
      showProgress: true,
      progressText: rotuloProgresso(p),
      ...(el ? { side: p.lado, align: "center" as const } : {}),
    },
  });

  // o driver posiciona o popover antes de a rolagem/animação da tela assentar; um "resize" depois refaz a posição certa
  for (const ms of [150, 600]) {
    const id = setTimeout(() => ativa(s, t) && window.dispatchEvent(new Event("resize")), ms);
    s.limpar.push(() => clearTimeout(id));
  }

  // passo interativo: o toque no próprio destaque abre a folha e o tour segue sozinho para ela
  if (p.tipo === "interativo" && el) {
    const aoTocar = () => {
      void (async () => {
        const tt = ++s.token;
        const abriu = await esperar(() => document.querySelector('[data-slot="drawer-content"] [data-tour]') !== null, ESPERA_FOLHA_MS);
        if (!ativa(s, tt)) return;
        if (abriu) await dormir(reduzido() ? 0 : 420); // a folha termina de subir antes de ser destacada
        if (!ativa(s, tt)) return;
        s.abriuFolha = abriu;
        void ir(s, abriu ? i + 1 : i + 2);
      })();
    };
    el.addEventListener("click", aoTocar, { once: true, capture: true });
    s.limpar.push(() => el.removeEventListener("click", aoTocar, { capture: true }));
  }
}

function iniciar(comPagamentos: boolean) {
  encerrar();
  const s: Sessao = { roteiro: construirRoteiro(comPagamentos), i: 0, d: null, semDestaque: false, abriuFolha: false, navegando: false, token: 0, limpar: [], globais: [] };
  sessao = s;
  const aoTecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") encerrar();
  };
  window.addEventListener("keydown", aoTecla);
  window.addEventListener("popstate", encerrar); // gesto/botão de voltar
  s.globais.push(() => {
    window.removeEventListener("keydown", aoTecla);
    window.removeEventListener("popstate", encerrar);
  });
  void ir(s, 0);
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
 * Tutorial único e contínuo (Hoje → Pagamentos → Gestores). Aqui: a oferta do primeiro acesso (cartão inferior), o início
 * pelo link "Tutorial" e o encerramento quando o usuário troca de aba por conta própria.
 */
export function Tutorial({ comPagamentos }: { comPagamentos: boolean }) {
  const rota = usePathname();
  const router = useRouter();
  const [ofertaEm, setOfertaEm] = useState<string | null>(null); // rota em que a oferta foi aberta (trocar de aba a esconde)

  useEffect(() => {
    roteador = router;
  }, [router]);

  // troca de aba que não foi do tour (ou de rota por qualquer outro motivo): termina sem alarde
  useEffect(() => {
    const s = sessao;
    if (s && !s.navegando && rota !== s.roteiro[s.i].rota) encerrar();
  }, [rota]);

  useEffect(() => {
    return aposAbertura(() => {
      if (deveOferecer({ rota, vista: ofertaVista(armazem()), ocupado: ocupado() })) setOfertaEm(rota);
    });
  }, [rota]);

  useEffect(() => {
    const aoPedir = () => {
      setOfertaEm(null);
      iniciar(comPagamentos);
    };
    window.addEventListener(EVENTO, aoPedir);
    return () => {
      window.removeEventListener(EVENTO, aoPedir);
      encerrar();
    };
  }, [comPagamentos]);

  const comecar = useCallback(() => {
    marcarOfertaVista(armazem());
    setOfertaEm(null);
    iniciar(comPagamentos);
  }, [comPagamentos]);
  const agoraNao = useCallback(() => {
    marcarOfertaVista(armazem());
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

/** Link discreto "Tutorial", ao lado de "Legenda": inicia o tour. */
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
