// Ponto de entrada único do coletor (CLI e rota de cron).
import { coberturaCalendario, hoje } from "../calendario";
import { getConfig } from "../config";
import { janelaPadrao, type Janela } from "../recorrencia";
import { aplicarPlano, type RelatorioAplicacao } from "./aplicar";
import { lerQuadro, lerQuadros, type Aviso, type QuadroLido } from "./ler";
import { planejarQuadro, type AcaoArea, type PlanoQuadro } from "./planejar";

export interface ContagemPlano {
  existe: number;
  seria_criada: number;
  seria_movido: number;
  /** por_area */
  area_atualizada: number;
  /** por_area */
  coluna_criada: number;
  /** por_area: cópias de histórico */
  historico_criado: number;
  /** por_area */
  recorrencia_avancada: number;
  /** por_area */
  ancora_atualizada: number;
  /** por_area */
  seria_finalizado: number;
}

export interface RelatorioQuadro {
  quadroId: string;
  quadroNome: string;
  contagem: ContagemPlano;
  /** contagem do plano depois de aplicar (só com aplicar: true) */
  contagemDepois?: ContagemPlano;
  avisos: Aviso[];
  gruposCriados: RelatorioAplicacao["gruposCriados"];
  gruposReordenados: RelatorioAplicacao["gruposReordenados"];
  itensCriados: RelatorioAplicacao["itensCriados"];
  itensMovidos: RelatorioAplicacao["itensMovidos"];
  areasAtualizadas: RelatorioAplicacao["areasAtualizadas"];
  colunasCriadas: RelatorioAplicacao["colunasCriadas"];
  historicosCriados: RelatorioAplicacao["historicosCriados"];
  recorrenciasAvancadas: RelatorioAplicacao["recorrenciasAvancadas"];
  ancorasAtualizadas: RelatorioAplicacao["ancorasAtualizadas"];
  falhas: RelatorioAplicacao["falhas"];
}

export interface RelatorioColeta {
  modo: "aplicar" | "dry-run";
  hoje: string;
  janela: Janela;
  avisoCalendario: string | null;
  quadros: RelatorioQuadro[];
  totalFalhas: number;
  durationMs: number;
  /** estado completo (para o JSON do CLI) */
  detalhe: {
    antes: { quadros: QuadroLido[]; planos: PlanoQuadro[] };
    depois?: { quadros: QuadroLido[]; planos: PlanoQuadro[] };
  };
}

const contar = (p: PlanoQuadro): ContagemPlano => {
  const area = (t: string) => p.acoesArea.filter((a) => a.tipo === t).length;
  return {
    existe: p.acoes.filter((a) => a.tipo === "existe").length + p.ocorrenciasExistentes,
    seria_criada: p.acoes.filter((a) => a.tipo === "seria_criada").length + area("seria_criada"),
    seria_movido: p.acoes.filter((a) => a.tipo === "seria_movido").length,
    area_atualizada: area("area_atualizada"),
    coluna_criada: area("coluna_criada"),
    historico_criado: area("historico_criado"),
    recorrencia_avancada: area("recorrencia_avancada"),
    ancora_atualizada: area("ancora_atualizada"),
    seria_finalizado: area("seria_finalizado"),
  };
};

async function lerEPlanejar(janela: Janela, ref: string) {
  const cfg = getConfig();
  const quadros = await lerQuadros(cfg);
  return { quadros, planos: quadros.map((q) => planejarQuadro(q, janela, cfg, ref)) };
}

export async function executarColeta({ aplicar }: { aplicar: boolean }): Promise<RelatorioColeta> {
  const inicio = Date.now();
  getConfig();
  const ref = hoje();
  const janela = janelaPadrao(ref);
  const avisoCalendario = coberturaCalendario(ref);

  const antes = await lerEPlanejar(janela, ref);
  const relatorios: RelatorioAplicacao[] = [];
  let depois: Awaited<ReturnType<typeof lerEPlanejar>> | undefined;

  if (aplicar) {
    for (const [i, q] of antes.quadros.entries()) relatorios.push(await aplicarPlano(q, antes.planos[i]));
    depois = await lerEPlanejar(janela, ref);
  }

  const quadros: RelatorioQuadro[] = antes.quadros.map((q, i) => {
    const r = relatorios[i];
    return {
      quadroId: q.id,
      quadroNome: q.nome,
      contagem: contar(antes.planos[i]),
      contagemDepois: depois ? contar(depois.planos[i]) : undefined,
      avisos: [...(depois?.quadros[i] ?? q).avisos, ...(depois?.planos[i] ?? antes.planos[i]).avisos],
      gruposCriados: r?.gruposCriados ?? [],
      gruposReordenados: r?.gruposReordenados ?? [],
      itensCriados: r?.itensCriados ?? [],
      itensMovidos: r?.itensMovidos ?? [],
      areasAtualizadas: r?.areasAtualizadas ?? [],
      colunasCriadas: r?.colunasCriadas ?? [],
      historicosCriados: r?.historicosCriados ?? [],
      recorrenciasAvancadas: r?.recorrenciasAvancadas ?? [],
      ancorasAtualizadas: r?.ancorasAtualizadas ?? [],
      falhas: r?.falhas ?? [],
    };
  });

  return {
    modo: aplicar ? "aplicar" : "dry-run",
    hoje: ref,
    janela,
    avisoCalendario,
    quadros,
    totalFalhas: quadros.reduce((n, q) => n + q.falhas.length, 0),
    durationMs: Date.now() - inicio,
    detalhe: { antes, depois },
  };
}

const ACOES_RECORRENCIA = new Set<AcaoArea["tipo"]>(["historico_criado", "recorrencia_avancada", "ancora_atualizada"]);

/** Do plano do quadro, só o que é da recorrência deste item (e a criação da coluna Âncora, se ele precisar dela). */
export function acoesRecorrenciaDoItem(acoes: AcaoArea[], itemId: string): AcaoArea[] {
  const doItem = acoes.filter((a) => ACOES_RECORRENCIA.has(a.tipo) && "itemId" in a && a.itemId === itemId);
  return doItem.length ? [...acoes.filter((a) => a.tipo === "coluna_criada"), ...doItem] : [];
}

/**
 * Webhook (mudança de Status): processa NA HORA a recorrência de um item do quadro de Atividades (histórico + avanço
 * ou âncora). Lê o quadro inteiro, porque a Chave do histórico é procurada no quadro todo; aplica só as ações desse
 * item. O coletor de hora em hora faz o mesmo para todos (rede de segurança). null = nada a fazer.
 */
export async function processarRecorrenteDoItem(itemId: string, boardId: string): Promise<RelatorioAplicacao | null> {
  const cfg = getConfig();
  const qc = cfg.quadros.find((q) => q.id === boardId);
  if (!qc || qc.layout !== "por_area") return null;
  const q = await lerQuadro(qc, cfg);
  if (!q) return null;
  const ref = hoje();
  const plano = planejarQuadro(q, janelaPadrao(ref), cfg, ref);
  plano.acoesArea = acoesRecorrenciaDoItem(plano.acoesArea, itemId);
  if (!plano.acoesArea.length) return null;
  return aplicarPlano(q, plano, cfg);
}

/** Relatório sem o `detalhe` pesado (para resposta HTTP). */
export function resumo(r: RelatorioColeta): Omit<RelatorioColeta, "detalhe"> {
  const { detalhe: _detalhe, ...resto } = r;
  void _detalhe;
  return resto;
}

export type { RelatorioAplicacao };
