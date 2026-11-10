// Tutorial guiado: passos, âncoras e estado (localStorage). Puro e sem imports: serve ao cliente e aos testes.
// Âncoras são atributos data-tour estáveis no HTML; se uma não existir na tela (ex.: sem itens hoje), o passo vira um
// popover centralizado, sem destaque.

export type Tour = "hoje" | "pagamentos" | "gestores";
export const TOURS: readonly Tour[] = ["hoje", "pagamentos", "gestores"];

export type Ancora =
  | "manchete"
  | "legenda"
  | "dias"
  | "primeira-linha"
  | "olho"
  | "abas"
  | "aba-pagamentos"
  | "aba-gestores"
  | "pag-aguardando"
  | "pag-autorizados"
  | "gestores-grade"
  | "gestor-selo";

export interface PassoTour {
  ancora: Ancora;
  titulo: string;
  texto: string;
  /** lado preferido do popover em relação ao destaque (o driver ajusta se não couber) */
  lado: "top" | "bottom";
}

/** Valor guardado quando o tour (ou a oferta) já foi visto. */
export const VISTO = "visto";
export const chaveTour = (t: Tour) => `pauta:tour:${t}`;

export const PASSOS: Record<Tour, PassoTour[]> = {
  hoje: [
    { ancora: "manchete", titulo: "Manchete", texto: "Aqui fica o item mais urgente do dia.", lado: "bottom" },
    { ancora: "legenda", titulo: "Legenda", texto: "As cores mostram a urgência: preto atrasado, vermelho hoje ou travado, amarelo nos próximos dias, verde em dia.", lado: "top" },
    { ancora: "dias", titulo: "Dias", texto: "Toque num dia para ver o que vence nele.", lado: "bottom" },
    { ancora: "primeira-linha", titulo: "Itens", texto: "Toque em qualquer item para ver os detalhes e falar com o responsável pelo WhatsApp.", lado: "bottom" },
    { ancora: "olho", titulo: "Valores", texto: "Oculta os valores quando você estiver em reunião.", lado: "bottom" },
    { ancora: "abas", titulo: "Abas", texto: "Pagamentos traz o que depende da sua autorização. Gestores mostra cada área.", lado: "top" },
  ],
  pagamentos: [
    { ancora: "pag-aguardando", titulo: "Aguardando", texto: "Pagamentos que aguardam a sua autorização. Toque em um para autorizar.", lado: "bottom" },
    { ancora: "pag-autorizados", titulo: "Autorizados", texto: "Tudo o que você já autorizou, com busca.", lado: "bottom" },
  ],
  gestores: [
    { ancora: "gestores-grade", titulo: "Gestores", texto: "Toque num gestor para ver as atividades da área.", lado: "top" },
    { ancora: "gestor-selo", titulo: "Selo", texto: "O selo mostra pendências: a cor indica a mais grave.", lado: "bottom" },
  ],
};

/** Texto do passo "abas" quando a aba Pagamentos está oculta (não cita o que o leitor não vê). */
const TEXTO_ABAS_SEM_PAGAMENTOS = "Gestores mostra cada área.";

export const seletorDaAncora = (a: Ancora) => `[data-tour="${a}"]`;

export interface PassoMontado extends PassoTour {
  /** seletor CSS do destaque; null = âncora ausente, popover centralizado sem destaque */
  seletor: string | null;
}

/** Lista de passos do tour; `existe` diz se a âncora está na tela agora. Âncora ausente → passo sem destaque (nunca some). */
export function construirPassos(tour: Tour, existe: (a: Ancora) => boolean): PassoMontado[] {
  return PASSOS[tour].map((p) => ({
    ...p,
    texto: p.ancora === "abas" && !existe("aba-pagamentos") ? TEXTO_ABAS_SEM_PAGAMENTOS : p.texto,
    seletor: existe(p.ancora) ? seletorDaAncora(p.ancora) : null,
  }));
}

// ---------- estado ----------

/** O mínimo de Storage de que o tutorial precisa (facilita o teste). */
export interface Armazem {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export type EstadoTour = Record<Tour, boolean>;

/** Quais tours já foram vistos. Armazenamento ilegível: null (o tutorial então não se oferece sozinho). */
export function lerEstado(a: Armazem | null): EstadoTour | null {
  if (!a) return null;
  try {
    return { hoje: a.getItem(chaveTour("hoje")) === VISTO, pagamentos: a.getItem(chaveTour("pagamentos")) === VISTO, gestores: a.getItem(chaveTour("gestores")) === VISTO };
  } catch {
    return null;
  }
}

export function marcarVisto(a: Armazem | null, ...tours: Tour[]): void {
  try {
    for (const t of tours) a?.setItem(chaveTour(t), VISTO);
  } catch {
    // armazenamento bloqueado: vale só nesta visita
  }
}

/** "Tutorial": reabre o tour de Hoje e volta a valer os tours de cada aba (Hoje segue marcado como visto). */
export function reiniciar(a: Armazem | null): void {
  try {
    a?.removeItem(chaveTour("pagamentos"));
    a?.removeItem(chaveTour("gestores"));
  } catch {
    // idem
  }
}

/** Recusar a oferta ("Agora não") marca tudo como visto: nada de tour por conta própria; o link "Tutorial" segue valendo. */
export function recusarOferta(a: Armazem | null): void {
  marcarVisto(a, ...TOURS);
}

export type Acao = "oferecer" | "pagamentos" | "gestores" | null;

/**
 * O que fazer ao abrir uma tela, agora. Nada enquanto a abertura animada roda, enquanto o cartão de notificações está na
 * tela ou enquanto há uma folha aberta. A oferta só aparece em Hoje; o tour de cada aba, só depois de o de Hoje ter sido visto.
 */
export function decidir(o: { rota: string; estado: EstadoTour | null; ocupado: boolean }): Acao {
  if (!o.estado || o.ocupado) return null;
  if (o.rota === "/") return o.estado.hoje ? null : "oferecer";
  if (!o.estado.hoje) return null;
  if (o.rota === "/pagamentos" || o.rota.startsWith("/pagamentos/")) return o.estado.pagamentos ? null : "pagamentos";
  if (o.rota === "/gestores") return o.estado.gestores ? null : "gestores"; // só a grade; o caderno de um gestor não tem tour
  return null;
}
