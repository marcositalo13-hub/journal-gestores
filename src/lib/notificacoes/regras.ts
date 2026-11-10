// Regras de notificação R1–R4. Puro: tudo entra por argumento (item relido do monday, evento, agora, config).
// Nenhum texto leva valores monetários: o item das regras nem carrega o valor, os nomes passam por limparValores
// e o payload ainda recusa qualquer texto com valor.
import { diasEntre, diaDaSemana, hoje as hojeSP, type DataISO } from "../calendario";
import { areaCurta, type JornalConfig } from "../config";
import type { Categoria, TipoItem } from "../edicao/itens";
import { limparValores } from "../push/payload";

export type Regra = "R1" | "R2" | "R3" | "R4";
export type Prioridade = "imediata" | "normal";

/** O que mudou no monday (o payload só diz QUAL coluna mudou; o estado vem da releitura do item). */
export type EventoItem = { tipo: "criado" } | { tipo: "coluna"; titulo: string };

/** Item relido do monday e normalizado com o código do coletor/edição. */
export interface ItemParaRegras {
  id: string;
  nome: string;
  tipoQuadro: "atividades" | "pagamentos";
  tipo: TipoItem;
  categoria: Categoria;
  /** YYYY-MM-DD ou null */
  data: string | null;
  /** criação no monday (ISO) */
  criadoEm: string;
  /** tem Chave: ocorrência criada pelo coletor */
  geradoPeloColetor: boolean;
  /** está no grupo "Atividades finalizadas" */
  finalizada: boolean;
  dono: string;
}

export interface NotificacaoFila {
  chave_dedupe: string;
  regra: Regra;
  prioridade: Prioridade;
  titulo: string;
  corpo: string;
  url: string;
  item_id: string;
}

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "13/11" */
export function ddmm(d: DataISO): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "sexta, 13/11" */
export function diaEData(d: DataISO): string {
  return `${SEMANA[diaDaSemana(d)]}, ${ddmm(d)}`;
}

const aberto = (c: Categoria) => c === "aberto" || c === "travado";
const prefixoArea = (i: ItemParaRegras, cfg: JornalConfig) => areaCurta(i.dono, cfg) ?? i.dono;
const urlDoItem = (id: string) => `/?item=${id}`;
/** Pagamentos vivem na aba deles; com a aba oculta, a notificação abre a tela Hoje (nunca /pagamentos). */
const urlDoPagamento = (id: string, cfg: JornalConfig) => (cfg.abas.pagamentos ? `/pagamentos?item=${id}` : "/");

/** Criado há no máximo `novo_horas` (e não no futuro, por segurança contra relógios). */
export function ehNovo(criadoEm: string, agora: Date, cfg: JornalConfig): boolean {
  const t = Date.parse(criadoEm);
  if (!Number.isFinite(t)) return false;
  const idade = agora.getTime() - t;
  return idade >= -5 * 60_000 && idade <= cfg.notificacoes.novo_horas * 3_600_000;
}

/**
 * Quais regras um evento pode disparar. Criação: todas; colunas: só a(s) regra(s) daquela coluna.
 * Pagamentos: R3 também quando Vencimento ou Status mudam (o webhook de criação pode chegar antes de o
 * colaborador preencher o vencimento); a chave de dedupe garante um único aviso por pagamento.
 */
function regrasDoEvento(e: EventoItem, i: ItemParaRegras, cfg: JornalConfig): Set<Regra> {
  if (e.tipo === "criado") return new Set(["R1", "R2", "R3", "R4"]);
  const t = cfg.tipos_de_quadro[i.tipoQuadro];
  const out = new Set<Regra>();
  if (i.tipoQuadro === "atividades") {
    if (e.titulo === t.status) out.add("R2");
    if (e.titulo === t.data) out.add("R1");
    if (e.titulo === "Tipo") out.add("R4");
  } else if (e.titulo === t.data || e.titulo === t.status) out.add("R3");
  return out;
}

/**
 * Avalia R1–R4 para o item relido após um evento. Itens criados pelo coletor (com Chave) não geram nada na
 * criação; mudanças feitas por pessoas neles (ex.: Travado) contam normalmente.
 */
export function avaliarRegras(evento: EventoItem, i: ItemParaRegras, agora: Date, cfg: JornalConfig): NotificacaoFila[] {
  if (evento.tipo === "criado" && i.geradoPeloColetor) return [];
  const possiveis = regrasDoEvento(evento, i, cfg);
  const hoje = hojeSP(agora, cfg);
  const nome = limparValores(i.nome);
  const out: NotificacaoFila[] = [];
  const add = (n: Omit<NotificacaoFila, "item_id" | "url">) => out.push({ ...n, item_id: i.id, url: urlDoItem(i.id) });
  const ativ = i.tipoQuadro === "atividades";
  const humano = !i.geradoPeloColetor && !i.finalizada;

  // R4: contrato novo (ou que virou contrato logo após criado), qualquer prazo. Fura o agrupamento.
  const r4 = possiveis.has("R4") && ativ && humano && i.tipo === "Contrato" && aberto(i.categoria) && ehNovo(i.criadoEm, agora, cfg);
  if (r4) {
    add({
      chave_dedupe: `R4:${i.id}`,
      regra: "R4",
      prioridade: "imediata",
      titulo: "Contrato para análise",
      corpo: `${prefixoArea(i, cfg)}: ${nome}${i.data ? ` · prazo ${ddmm(i.data)}` : ""}`,
    });
  }

  // R1: atividade nova com prazo hoje ou amanhã (não repete se já virou R4)
  if (!r4 && possiveis.has("R1") && ativ && humano && aberto(i.categoria) && i.data && ehNovo(i.criadoEm, agora, cfg)) {
    const d = diasEntre(hoje, i.data);
    if (d === 0 || d === 1) {
      add({ chave_dedupe: `R1:${i.id}`, regra: "R1", prioridade: "normal", titulo: d === 0 ? "Nova para hoje" : "Nova para amanhã", corpo: `${prefixoArea(i, cfg)}: ${nome}` });
    }
  }

  // R2: virou Travado (só atividades; pagamentos não têm esse status). No máximo uma vez por item por dia.
  if (possiveis.has("R2") && !i.finalizada && i.categoria === "travado") {
    add({ chave_dedupe: `R2:${i.id}:${hoje}`, regra: "R2", prioridade: "normal", titulo: "Travado", corpo: `${prefixoArea(i, cfg)}: ${nome}` });
  }

  // R3: pagamento novo aguardando a autorização do diretor (com vencimento). Imediata; uma vez por pagamento.
  // Nunca leva o valor: só o nome (sem valores) e o vencimento.
  if (possiveis.has("R3") && !ativ && i.categoria === "aberto" && i.data && ehNovo(i.criadoEm, agora, cfg)) {
    out.push({
      chave_dedupe: `R3:${i.id}`,
      regra: "R3",
      prioridade: "imediata",
      titulo: "Autorização pendente",
      corpo: `${nome} · vence ${ddmm(i.data)}`,
      item_id: i.id,
      url: urlDoPagamento(i.id, cfg),
    });
  }
  return out;
}
