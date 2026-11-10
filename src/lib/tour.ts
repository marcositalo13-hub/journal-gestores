// Tutorial guiado: um único roteiro contínuo Hoje → Pagamentos → Gestores. Puro e sem imports: serve ao cliente e aos testes.
// Âncoras são atributos data-tour estáveis no HTML; se uma não existir na tela (ex.: sem itens hoje), o passo vira um
// popover centralizado, sem destaque (nunca aponta para o nada).

export type Capitulo = "hoje" | "pagamentos" | "gestores";

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
  | "gestor-selo"
  | "folha-contato"
  | "folha-cabecalho";

/**
 * normal: "Próximo" avança. interativo: o destaque é tocável (abre a folha) e avança sozinho; sem "Próximo".
 * folha: destaca a folha de detalhes; "Próximo" fecha a folha e segue. final: mensagem centralizada.
 */
export type TipoPasso = "normal" | "interativo" | "folha" | "final";

export interface Passo {
  id: string;
  capitulo: Capitulo;
  /** âncoras tentadas em ordem; nenhuma na tela → popover centralizado */
  ancoras: Ancora[];
  titulo: string;
  texto: string;
  /** lado preferido do popover em relação ao destaque (o driver ajusta se não couber) */
  lado: "top" | "bottom";
  tipo: TipoPasso;
  rota: "/" | "/pagamentos" | "/gestores";
  /** posição no capítulo (1…total) */
  ordem: number;
  total: number;
  /** rótulo do botão principal; null no passo interativo (sem botão) */
  botao: string | null;
}

export const ROTA: Record<Capitulo, Passo["rota"]> = { hoje: "/", pagamentos: "/pagamentos", gestores: "/gestores" };
const NOME: Record<Capitulo, string> = { hoje: "Hoje", pagamentos: "Pagamentos", gestores: "Gestores" };

type Base = Pick<Passo, "id" | "ancoras" | "titulo" | "texto" | "lado"> & { tipo?: TipoPasso };

const HOJE: Base[] = [
  { id: "manchete", ancoras: ["manchete"], titulo: "Manchete", texto: "Aqui fica o item mais urgente do dia.", lado: "bottom" },
  { id: "legenda", ancoras: ["legenda"], titulo: "Legenda", texto: "As cores mostram a urgência: preto atrasado, vermelho hoje ou travado, amarelo nos próximos dias, verde em dia.", lado: "top" },
  { id: "dias", ancoras: ["dias"], titulo: "Dias", texto: "Toque num dia para ver o que vence nele.", lado: "bottom" },
  { id: "primeira-linha", ancoras: ["primeira-linha"], titulo: "Itens", texto: "Toque neste item.", lado: "bottom", tipo: "interativo" },
  { id: "folha", ancoras: ["folha-contato", "folha-cabecalho"], titulo: "Detalhes", texto: "Aqui ficam os detalhes e o contato com o responsável.", lado: "top", tipo: "folha" },
  { id: "olho", ancoras: ["olho"], titulo: "Valores", texto: "Oculta os valores quando você estiver em reunião.", lado: "bottom" },
];
const PAGAMENTOS: Base[] = [
  { id: "pag-aguardando", ancoras: ["pag-aguardando"], titulo: "Aguardando", texto: "Pagamentos que aguardam a sua autorização. Toque em um para autorizar.", lado: "bottom" },
  { id: "pag-autorizados", ancoras: ["pag-autorizados"], titulo: "Autorizados", texto: "Tudo o que você já autorizou, com busca.", lado: "bottom" },
];
const GESTORES: Base[] = [
  { id: "gestores-grade", ancoras: ["gestores-grade"], titulo: "Gestores", texto: "Toque num gestor para ver as atividades da área.", lado: "top" },
  { id: "gestor-selo", ancoras: ["gestor-selo"], titulo: "Selo", texto: "O selo mostra pendências: a cor indica a mais grave.", lado: "bottom" },
  { id: "final", ancoras: [], titulo: "Pronto", texto: "Pronto. Para rever, toque em Tutorial no fim da tela Hoje.", lado: "bottom", tipo: "final" },
];

/**
 * O roteiro inteiro, em ordem. Com a aba Pagamentos oculta pela config, o capítulo dela é pulado (e o último passo de Hoje
 * leva direto a Gestores). O botão principal do último passo de cada capítulo é "Ir para …"; o do final é "Pronto".
 */
export function construirRoteiro(comPagamentos: boolean): Passo[] {
  const capitulos: [Capitulo, Base[]][] = [["hoje", HOJE], ["pagamentos", PAGAMENTOS], ["gestores", GESTORES]];
  const ativos = capitulos.filter(([c]) => c !== "pagamentos" || comPagamentos);
  return ativos.flatMap(([capitulo, base], ci) => {
    const proximo = ativos[ci + 1]?.[0];
    return base.map((b, i): Passo => {
      const tipo = b.tipo ?? "normal";
      const ultimo = i === base.length - 1;
      const botao = tipo === "interativo" ? null : tipo === "final" ? "Pronto" : ultimo && proximo ? `Ir para ${NOME[proximo]}` : "Próximo";
      return { ...b, tipo, capitulo, rota: ROTA[capitulo], ordem: i + 1, total: base.length, botao };
    });
  });
}

/** "Hoje · 3 de 6" */
export const rotuloProgresso = (p: Passo) => `${NOME[p.capitulo]} · ${p.ordem} de ${p.total}`;

/** "Voltar" some no primeiro passo de cada capítulo (não se volta de uma aba para a outra). */
export const mostrarVoltar = (p: Passo) => p.ordem > 1;

/** Para onde "Voltar" leva: o passo anterior, pulando a folha (já fechada; volta-se ao item que a abriu). null = sem volta. */
export function indiceAnterior(roteiro: Passo[], i: number): number | null {
  const p = roteiro[i];
  if (!p || !mostrarVoltar(p)) return null;
  let j = i - 1;
  while (j >= 0 && roteiro[j].tipo === "folha") j--;
  return j >= 0 && roteiro[j].capitulo === p.capitulo ? j : null;
}

export const seletorDaAncora = (a: Ancora) => `[data-tour="${a}"]`;

/** Seletor do destaque do passo: a primeira âncora presente na tela, ou null (popover centralizado, sem destaque). */
export function resolverSeletor(p: Pick<Passo, "ancoras">, existe: (a: Ancora) => boolean): string | null {
  const a = p.ancoras.find(existe);
  return a ? seletorDaAncora(a) : null;
}

// ---------- oferta do primeiro acesso (único estado guardado) ----------

/** Valor guardado quando a oferta do tutorial já foi vista (aceita ou recusada). */
export const VISTO = "visto";
export const CHAVE_OFERTA = "pauta:tour:hoje";

/** O mínimo de Storage de que o tutorial precisa (facilita o teste). */
export interface Armazem {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** A oferta já foi vista? null = armazenamento ilegível (então o tutorial não se oferece sozinho). */
export function ofertaVista(a: Armazem | null): boolean | null {
  if (!a) return null;
  try {
    return a.getItem(CHAVE_OFERTA) === VISTO;
  } catch {
    return null;
  }
}

export function marcarOfertaVista(a: Armazem | null): void {
  try {
    a?.setItem(CHAVE_OFERTA, VISTO);
  } catch {
    // armazenamento bloqueado: vale só nesta visita
  }
}

/** Oferecer só em Hoje, uma vez, com o armazenamento legível e nada na frente (abertura animada, cartão, folha). */
export function deveOferecer(o: { rota: string; vista: boolean | null; ocupado: boolean }): boolean {
  return o.rota === "/" && o.vista === false && !o.ocupado;
}
