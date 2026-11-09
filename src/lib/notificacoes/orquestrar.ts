// Orquestração das notificações (evento → fila → envio). Sem rede/banco aqui: tudo entra por `deps`.
import type { JornalConfig } from "../config";
import { montarPayload } from "../push/payload";
import { agrupar, planejarEnvios, textoResumo, type Envio, type Pendente } from "./agrupar";
import { dentroDaJanela, inicioDaJanelaDeHoje } from "./janela";
import { avaliarRegras, type EventoItem, type ItemParaRegras, type NotificacaoFila } from "./regras";
import type { EventoMonday } from "./webhook";

export interface RepoFila {
  /** INSERT ... ON CONFLICT (chave_dedupe) DO NOTHING */
  inserir(ns: NotificacaoFila[]): Promise<void>;
  /** pendentes (enviado_em nulo) criados a partir de `desde` ou antes de `antes` */
  pendentes(f: { desde?: Date; antes?: Date }): Promise<Pendente[]>;
  ultimoEnvioNormal(): Promise<Date | null>;
  /** marca enviado_em só nas linhas ainda pendentes e devolve os ids marcados (evita envio duplo entre cron e webhook) */
  reivindicar(ids: string[], quando: Date): Promise<string[]>;
}

export interface ItemRelido {
  /** null: o item não entra na edição (regra recorrente, modelo no Cadastro, grupo desconhecido) */
  item: ItemParaRegras | null;
  tipoQuadro: "atividades" | "pagamentos";
  /** título da coluna pelo id (das colunas relidas do quadro) */
  tituloDaColuna(id: string): string | null;
}

export interface DepsNotificacoes {
  repo: RepoFila;
  /** envia o payload a todos os leitores */
  enviarATodos(payload: string): Promise<void>;
  relerItem(itemId: string, boardId: string): Promise<ItemRelido | null>;
  contagens(): Promise<{ hoje: number; atrasados: number } | null>;
  log(linha: string): void;
}

/** Colunas que interessam por tipo de quadro; Área, Chave, Observação, Mês etc. são ignoradas. */
export function colunasRelevantes(tipo: "atividades" | "pagamentos", cfg: JornalConfig): string[] {
  const t = cfg.tipos_de_quadro[tipo];
  return tipo === "atividades" ? [t.data, t.status, "Tipo"] : [t.data, t.status, "Valor (R$)"];
}

async function enviar(envios: Envio[], deps: DepsNotificacoes) {
  for (const e of envios) await deps.enviarATodos(montarPayload({ titulo: e.titulo, corpo: e.corpo, tag: e.tag, url: e.url }));
}

/**
 * Envia o que está pendente (cron a cada 5 min; e o webhook, só para as imediatas). Fora da janela não faz nada.
 * Só considera o que entrou na fila desde o início da janela de hoje: o da noite fica para o resumo da manhã.
 */
export async function enviarPendentes(agora: Date, deps: DepsNotificacoes, cfg: JornalConfig, opcoes: { soImediatas?: boolean } = {}) {
  if (!dentroDaJanela(agora, cfg)) return { enviados: 0, foraDaJanela: true };
  const todas = await deps.repo.pendentes({ desde: inicioDaJanelaDeHoje(agora, cfg) });
  const pend = opcoes.soImediatas ? todas.filter((p) => p.prioridade === "imediata") : todas;
  const ultimo = await deps.repo.ultimoEnvioNormal();
  const planejados = planejarEnvios(pend, ultimo, agora, cfg);
  if (!planejados.length) return { enviados: 0, foraDaJanela: false };

  const marcados = new Set(await deps.repo.reivindicar(planejados.flatMap((e) => e.ids), agora));
  const meus = pend.filter((p) => marcados.has(p.id));
  // replaneja só com o que ESTE processo reivindicou (outro pode ter levado parte)
  const envios = [
    ...meus.filter((p) => p.prioridade === "imediata").map((p) => agrupar([p])),
    ...(meus.some((p) => p.prioridade === "normal") ? [agrupar(meus.filter((p) => p.prioridade === "normal"))] : []),
  ];
  await enviar(envios, deps);
  deps.log(`[notificar] ${envios.length} envio(s) · ${meus.length} item(ns) da fila`);
  return { enviados: envios.length, foraDaJanela: false };
}

/** 07:00: "Bom dia" com contagens e a fila da noite marcada como enviada. */
export async function resumoDaManha(agora: Date, deps: DepsNotificacoes, cfg: JornalConfig) {
  const noite = await deps.repo.pendentes({ antes: inicioDaJanelaDeHoje(agora, cfg) });
  const marcados = noite.length ? await deps.repo.reivindicar(noite.map((p) => p.id), agora) : [];
  const c = await deps.contagens().catch(() => null);
  const corpo = textoResumo({ hoje: c?.hoje ?? null, atrasados: c?.atrasados ?? null, noite: marcados.length });
  await deps.enviarATodos(montarPayload({ titulo: "Bom dia", corpo, tag: "resumo", url: "/" }));
  deps.log(`[resumo] enviado: ${corpo}`);
  return { corpo, noite: marcados.length };
}

/** Webhook: relê o item, decide pelas regras, enfileira e manda as imediatas se estiver na janela. */
export async function processarEvento(ev: EventoMonday, agora: Date, deps: DepsNotificacoes, cfg: JornalConfig): Promise<NotificacaoFila[]> {
  const pre = `[webhook] item ${ev.itemId} (quadro ${ev.boardId}) ${ev.tipo}`;
  const relido = await deps.relerItem(ev.itemId, ev.boardId);
  if (!relido) {
    deps.log(`${pre}: ignorado (item não encontrado ou fora dos quadros do config)`);
    return [];
  }
  let evento: EventoItem = { tipo: "criado" };
  if (ev.tipo === "update_column_value") {
    const titulo = ev.columnId ? relido.tituloDaColuna(ev.columnId) : null;
    if (!titulo || !colunasRelevantes(relido.tipoQuadro, cfg).includes(titulo)) {
      deps.log(`${pre}: ignorado (coluna ${titulo ?? ev.columnId ?? "?"} não interessa)`);
      return [];
    }
    evento = { tipo: "coluna", titulo };
  }
  if (!relido.item) {
    deps.log(`${pre}: ignorado (regra/modelo, não entra na edição)`);
    return [];
  }
  const ns = avaliarRegras(evento, relido.item, agora, cfg);
  if (!ns.length) {
    deps.log(`${pre}${evento.tipo === "coluna" ? ` ${evento.titulo}` : ""}: nenhuma regra`);
    return [];
  }
  await deps.repo.inserir(ns);
  deps.log(`${pre}${evento.tipo === "coluna" ? ` ${evento.titulo}` : ""}: enfileirado ${ns.map((n) => `${n.regra}/${n.prioridade}`).join(", ")}`);
  if (ns.some((n) => n.prioridade === "imediata")) await enviarPendentes(agora, deps, cfg, { soImediatas: true });
  return ns;
}
