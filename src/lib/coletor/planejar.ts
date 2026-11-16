// Planejamento puro (sem escrita): o que o coletor CRIARIA/MOVERIA no monday.
import { ddmm, hoje as hojeSP, somarDias, type DataISO } from "../calendario";
import { COLUNA_ANCORA, finalizarAposDiasDoQuadro, getConfig, type JornalConfig } from "../config";
import { mesmoRotulo } from "../rotulos";
import { ancoraEfetiva, montarOcorrencia, parseFrequencia, projetarOcorrencias, proximaData, type Janela, type Ocorrencia } from "../recorrencia";
import { areaDaColuna, type Aviso, type ItemNormalizado, type QuadroLido } from "./ler";

export interface AcaoBase {
  itemId: string;
  itemNome: string;
  ocorrencia: Ocorrencia;
  /** o grupo de mês de destino já existe no quadro? */
  grupoExiste: boolean;
}
export type Acao =
  | (AcaoBase & { tipo: "existe"; itemExistenteId: string })
  | (AcaoBase & { tipo: "seria_criada"; frequencia: string; grupoSeriaCriado: boolean })
  | (AcaoBase & { tipo: "seria_movido"; grupoSeriaCriado: boolean });

/** Ações de quadros por_area (aplicadas nesta ordem). */
export type AcaoArea =
  /** a coluna oculta "Âncora" não existe: é criada antes de qualquer gravação de âncora */
  | { tipo: "coluna_criada"; titulo: string }
  | { tipo: "area_atualizada"; itemId: string; itemNome: string; area: string; areaAtual: string | null }
  /** (a) cópia de histórico do período encerrado, criada direto em "Atividades finalizadas", com Chave `${itemId}:${Prazo}` */
  | { tipo: "historico_criado"; itemId: string; itemNome: string; nome: string; chave: string; data: DataISO; status: string; area: string | null; grupo: { id: string; titulo: string } }
  /** (b) o item vivo avança: Prazo = próxima data, Status = inicial, Âncora */
  | { tipo: "recorrencia_avancada"; itemId: string; itemNome: string; de: DataISO; para: DataISO; ancora: DataISO; status: string; statusAtual: string }
  /** alguém mudou o Prazo à mão (ou a âncora estava vazia): a âncora passa a ser o Prazo */
  | { tipo: "ancora_atualizada"; itemId: string; itemNome: string; ancora: DataISO; ancoraAtual: string | null }
  | { tipo: "seria_finalizado"; itemId: string; itemNome: string; data: DataISO; status: string; grupo: { id: string; titulo: string } };

export interface PlanoQuadro {
  quadroId: string;
  quadroNome: string;
  janela: Janela;
  acoes: Acao[];
  /** só em quadros por_area */
  acoesArea: AcaoArea[];
  /** por_mes: ocorrências projetadas que já existem no quadro (por_area não projeta mais)*/
  ocorrenciasExistentes: number;
  /** regras ignoradas (ex.: canceladas no Cadastro) */
  ignorados: { itemId: string; itemNome: string; motivo: string }[];
  avisos: Aviso[];
}

/** "[TESTE] Conciliação bancária · 06/11" (também o nome da cópia de histórico) */
export function nomeOcorrencia(nomeRegra: string, dataOriginal: DataISO): string {
  return `${nomeRegra} · ${ddmm(dataOriginal)}`;
}

/**
 * Uma atividade recorrente viva (modelo de item único, estilo ClickUp). Concluída ou cancelada: (a) cópia de histórico em
 * "Atividades finalizadas" com Chave `${id}:${Prazo}`, pulada se essa Chave já existe no quadro (isso torna o passo
 * idempotente: se (b) falhou numa rodada, a seguinte só refaz (b)); (b) o item avança um período a partir do Prazo atual
 * e volta ao Status inicial. Aberta: só confere a âncora. Sem Prazo: nada (o aviso sai na leitura).
 */
export function planejarRecorrente(
  it: ItemNormalizado,
  q: Pick<QuadroLido, "grupos" | "grupoFinalizadas" | "tipo">,
  chaves: ReadonlySet<string>,
  cfg: JornalConfig = getConfig(),
): AcaoArea[] {
  const t = cfg.tipos_de_quadro[q.tipo];
  const freq = parseFrequencia(it.recorrencia);
  if (!it.data || freq === null || freq === "nao_recorrente" || freq === "diaria") return [];
  const ctx = { itemId: it.id, itemNome: it.nome };
  const ancoraAtual = it.valores[COLUNA_ANCORA]?.text || null;
  const { ancora, mudou } = ancoraEfetiva(freq, it.data, ancoraAtual);
  const encerrado = mesmoRotulo(it.status, t.status_concluido) || mesmoRotulo(it.status, t.status_cancelado);
  if (!encerrado) return mudou ? [{ tipo: "ancora_atualizada", ...ctx, ancora, ancoraAtual }] : [];

  const out: AcaoArea[] = [];
  const chave = `${it.id}:${it.data}`;
  if (!chaves.has(chave)) {
    const finalizadas = q.grupos.find((g) => g.titulo === q.grupoFinalizadas);
    if (!finalizadas) return []; // sem onde guardar o histórico, não avança (o aviso "grupo_finalizadas_ausente" já saiu)
    const area = areaDaColuna(it, cfg) ?? it.porArea?.areaGrupo ?? null;
    out.push({ tipo: "historico_criado", ...ctx, nome: nomeOcorrencia(it.nome, it.data), chave, data: it.data, status: it.status!, area, grupo: finalizadas });
  }
  const para = proximaData(freq, it.data, ancora);
  // Semanal/Quinzenal não têm dia fixo: a âncora acompanha o Prazo. Mensal/Anual guardam o dia-base (31 volta depois de fevereiro).
  const novaAncora = freq === "Semanal" || freq === "Quinzenal" ? para : ancora;
  out.push({ tipo: "recorrencia_avancada", ...ctx, de: it.data, para, ancora: novaAncora, status: t.status_inicial, statusAtual: it.status! });
  return out;
}

/** Plano de um quadro por_area: coluna Âncora, Área, recorrências vivas e finalização. Nunca cria ocorrências futuras. */
function planejarPorArea(q: QuadroLido, plano: PlanoQuadro, ref: DataISO, cfg: JornalConfig): PlanoQuadro {
  const t = cfg.tipos_de_quadro[q.tipo];
  const limite = somarDias(ref, -cfg.finalizar_apos_dias);
  const finalizadas = q.grupos.find((g) => g.titulo === q.grupoFinalizadas);

  // Existência no quadro INTEIRO: uma cópia de histórico, onde quer que esteja, nunca é criada duas vezes.
  const chaves = new Set(q.itens.flatMap((i) => (i.chave ? [i.chave] : [])));

  const coluna: AcaoArea[] = COLUNA_ANCORA in t.colunas && !q.colunas[COLUNA_ANCORA] ? [{ tipo: "coluna_criada", titulo: COLUNA_ANCORA }] : [];
  const areas: AcaoArea[] = [];
  const recorrentes: AcaoArea[] = [];
  const finalizar: AcaoArea[] = [];

  for (const it of q.itens) {
    const pa = it.porArea;
    if (!pa || pa.finalizada || !pa.areaGrupo) continue; // finalizadas (inclui recorrências encerradas) e grupos desconhecidos: nada a fazer
    const ctx = { itemId: it.id, itemNome: it.nome };

    const atual = it.valores["Área"]?.labels ?? [];
    if (q.colunas["Área"] && !(atual.length === 1 && atual[0] === pa.areaGrupo)) {
      areas.push({ tipo: "area_atualizada", ...ctx, area: pa.areaGrupo, areaAtual: atual.join(", ") || null });
    }

    if (pa.classe === "regra") {
      recorrentes.push(...planejarRecorrente(it, q, chaves, cfg));
      continue;
    }

    if (pa.classe === "unico" && it.recorrencia) {
      const f = parseFrequencia(it.recorrencia);
      if (f === null) plano.avisos.push({ quadroId: q.id, ...ctx, codigo: "recorrencia_desconhecida", mensagem: `"${it.nome}": Recorrência "${it.recorrencia}" desconhecida; tratado como item único.` });
      else if (f === "diaria") plano.avisos.push({ quadroId: q.id, ...ctx, codigo: "recorrencia_diaria_nao_suportada", mensagem: `"${it.nome}": Recorrência diária não é suportada; tratado como item único.` });
    }
    const encerrado = mesmoRotulo(it.status, t.status_concluido) || mesmoRotulo(it.status, t.status_cancelado);
    if (finalizadas && encerrado && it.data && it.data <= limite) {
      finalizar.push({ tipo: "seria_finalizado", ...ctx, data: it.data, status: it.status!, grupo: finalizadas });
    }
  }

  plano.acoesArea = [...coluna, ...areas, ...recorrentes, ...finalizar];
  return plano;
}

/**
 * Plano de um quadro "lista" (Pagamentos): sem recorrência, sem Chave e sem grupos de mês.
 * Só finaliza: Autorizado ou Cancelado com Vencimento <= hoje - finalizar_apos_dias vai para o grupo de finalizados
 * (com finalizar_apos_dias = 0 do quadro, vai na próxima rodada, qualquer que seja o Vencimento).
 * Itens sem Vencimento nunca são movidos (e já saem avisados como "obrigatória vazia").
 * Nunca grava colunas: o que o app autorizou (Status, Autorizado por/em) fica intacto; o item só muda de grupo.
 */
export function planejarLista(q: QuadroLido, plano: PlanoQuadro, ref: DataISO, cfg: JornalConfig): PlanoQuadro {
  const t = cfg.tipos_de_quadro[q.tipo];
  const qc = cfg.quadros.find((x) => x.id === q.id);
  const dias = qc ? finalizarAposDiasDoQuadro(qc, cfg) : cfg.finalizar_apos_dias;
  const limite = somarDias(ref, -dias);
  const finalizados = q.grupos.find((g) => g.titulo === q.grupoFinalizadas);
  if (!finalizados) return plano; // o aviso "grupo_finalizadas_ausente" já foi emitido na leitura
  for (const it of q.itens) {
    if (it.lista?.finalizada) continue;
    const encerrado = mesmoRotulo(it.status, t.status_concluido) || mesmoRotulo(it.status, t.status_cancelado);
    // dias = 0: move logo que o Status encerra, com ou sem Vencimento; senão exige Vencimento <= hoje - dias.
    if (encerrado && (dias === 0 || (it.data && it.data <= limite))) {
      plano.acoesArea.push({ tipo: "seria_finalizado", itemId: it.id, itemNome: it.nome, data: it.data ?? "", status: it.status!, grupo: finalizados });
    }
  }
  return plano;
}

export function planejarQuadro(q: QuadroLido, janela: Janela, cfg: JornalConfig = getConfig(), ref: DataISO = hojeSP(undefined, cfg)): PlanoQuadro {
  const tipoCfg = cfg.tipos_de_quadro[q.tipo];
  const plano: PlanoQuadro = { quadroId: q.id, quadroNome: q.nome, janela, acoes: [], acoesArea: [], ocorrenciasExistentes: 0, ignorados: [], avisos: [] };
  if (q.layout === "por_area") return planejarPorArea(q, plano, ref, cfg);
  if (q.layout === "lista") return planejarLista(q, plano, ref, cfg);
  const grupos = new Set(q.grupos.map((g) => g.titulo));

  // Chaves já materializadas em qualquer grupo de mês (= fora do Cadastro).
  const porChave = new Map<string, string>();
  for (const it of q.itens) if (!it.noCadastro && it.chave) porChave.set(it.chave, it.id);

  for (const it of q.itens.filter((i) => i.noCadastro)) {
    const ctx = { itemId: it.id, itemNome: it.nome };
    if (mesmoRotulo(it.status, tipoCfg.status_cancelado)) {
      plano.ignorados.push({ ...ctx, motivo: `status "${tipoCfg.status_cancelado}"` });
      continue;
    }
    if (!it.data) continue; // obrigatória vazia: já reportada na leitura
    const freq = parseFrequencia(it.recorrencia);
    if (freq === "diaria") {
      plano.avisos.push({ quadroId: q.id, ...ctx, codigo: "recorrencia_diaria_nao_suportada", mensagem: `"${it.nome}": Recorrência diária não é suportada; o item foi ignorado.` });
      continue;
    }
    if (freq === null) {
      if (it.recorrencia) {
        plano.avisos.push({ quadroId: q.id, ...ctx, codigo: "recorrencia_desconhecida", mensagem: `"${it.nome}": Recorrência "${it.recorrencia}" desconhecida.` });
      }
      continue;
    }

    if (freq === "nao_recorrente") {
      if (it.data < janela.inicio || it.data > janela.fim) continue;
      const oc = montarOcorrencia(it.id, it.data, tipoCfg.ajuste_dia_nao_util, cfg);
      const grupoExiste = grupos.has(oc.grupoMes);
      plano.acoes.push({ tipo: "seria_movido", ...ctx, ocorrencia: oc, grupoExiste, grupoSeriaCriado: !grupoExiste });
      continue;
    }

    const regra = { id: it.id, frequencia: freq, dataBase: it.data, ajuste: tipoCfg.ajuste_dia_nao_util };
    for (const oc of projetarOcorrencias(regra, janela, cfg)) {
      const grupoExiste = grupos.has(oc.grupoMes);
      const existente = porChave.get(oc.chave);
      if (existente) plano.acoes.push({ tipo: "existe", ...ctx, ocorrencia: oc, grupoExiste, itemExistenteId: existente });
      else plano.acoes.push({ tipo: "seria_criada", ...ctx, ocorrencia: oc, frequencia: freq, grupoExiste, grupoSeriaCriado: !grupoExiste });
    }
  }
  return plano;
}
