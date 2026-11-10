// Planejamento puro (sem escrita): o que o coletor CRIARIA/MOVERIA no monday.
import { ddmm, hoje as hojeSP, somarDias, type DataISO } from "../calendario";
import { getConfig, type JornalConfig } from "../config";
import { mesmoRotulo } from "../rotulos";
import { montarOcorrencia, parseFrequencia, projetarOcorrencias, type Janela, type Ocorrencia } from "../recorrencia";
import type { Aviso, QuadroLido } from "./ler";

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
  | { tipo: "area_atualizada"; itemId: string; itemNome: string; area: string; areaAtual: string | null }
  | { tipo: "regra_rotulada"; itemId: string; itemNome: string; statusAtual: string | null; status: string }
  | { tipo: "seria_criada"; regraId: string; regraNome: string; itemNome: string; ocorrencia: Ocorrencia; area: string; grupo: { id: string; titulo: string } }
  | { tipo: "seria_finalizado"; itemId: string; itemNome: string; data: DataISO; status: string; grupo: { id: string; titulo: string } };

export interface PlanoQuadro {
  quadroId: string;
  quadroNome: string;
  janela: Janela;
  acoes: Acao[];
  /** só em quadros por_area */
  acoesArea: AcaoArea[];
  /** por_area: ocorrências projetadas que já existem no quadro */
  ocorrenciasExistentes: number;
  /** regras ignoradas (ex.: canceladas no Cadastro) */
  ignorados: { itemId: string; itemNome: string; motivo: string }[];
  avisos: Aviso[];
}

/** "[TESTE] Conciliação bancária · 06/11" */
export function nomeOcorrencia(nomeRegra: string, dataOriginal: DataISO): string {
  return `${nomeRegra} · ${ddmm(dataOriginal)}`;
}

/** Plano de um quadro por_area: Área, rótulo das regras, ocorrências e finalização. Grupos de mês nunca entram aqui. */
function planejarPorArea(q: QuadroLido, plano: PlanoQuadro, janela: Janela, ref: DataISO, cfg: JornalConfig): PlanoQuadro {
  const t = cfg.tipos_de_quadro[q.tipo];
  const limite = somarDias(ref, -cfg.finalizar_apos_dias);
  const finalizadas = q.grupos.find((g) => g.titulo === q.grupoFinalizadas);

  // Existência no quadro INTEIRO: uma ocorrência finalizada não pode renascer.
  const chaves = new Set(q.itens.flatMap((i) => (i.chave ? [i.chave] : [])));

  const areas: AcaoArea[] = [];
  const rotulos: AcaoArea[] = [];
  const criar: AcaoArea[] = [];
  const finalizar: AcaoArea[] = [];

  for (const it of q.itens) {
    const pa = it.porArea;
    if (!pa || pa.finalizada || !pa.areaGrupo) continue; // finalizadas (inclui regras encerradas) e grupos desconhecidos: nada a fazer
    const ctx = { itemId: it.id, itemNome: it.nome };

    const atual = it.valores["Área"]?.labels ?? [];
    if (q.colunas["Área"] && !(atual.length === 1 && atual[0] === pa.areaGrupo)) {
      areas.push({ tipo: "area_atualizada", ...ctx, area: pa.areaGrupo, areaAtual: atual.join(", ") || null });
    }

    if (pa.classe === "regra") {
      if (t.status_regra && !mesmoRotulo(it.status, t.status_regra)) rotulos.push({ tipo: "regra_rotulada", ...ctx, statusAtual: it.status, status: t.status_regra });
      const freq = parseFrequencia(it.recorrencia);
      if (!it.data || freq === null || freq === "nao_recorrente" || freq === "diaria") continue; // sem data: já avisado como obrigatória vazia
      const grupo = { id: it.grupo.id, titulo: it.grupo.titulo };
      for (const oc of projetarOcorrencias({ id: it.id, frequencia: freq, dataBase: it.data, ajuste: t.ajuste_dia_nao_util }, janela, cfg)) {
        if (chaves.has(oc.chave)) plano.ocorrenciasExistentes++;
        else criar.push({ tipo: "seria_criada", regraId: it.id, regraNome: it.nome, itemNome: nomeOcorrencia(it.nome, oc.dataOriginal), ocorrencia: oc, area: pa.areaGrupo, grupo });
      }
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

  plano.acoesArea = [...areas, ...rotulos, ...criar, ...finalizar];
  return plano;
}

/**
 * Plano de um quadro "lista" (Pagamentos): sem recorrência, sem Chave e sem grupos de mês.
 * Só finaliza: Aprovado ou Cancelado com Vencimento <= hoje - finalizar_apos_dias vai para o grupo de finalizados.
 * Itens sem Vencimento nunca são movidos (e já saem avisados como "obrigatória vazia").
 */
export function planejarLista(q: QuadroLido, plano: PlanoQuadro, ref: DataISO, cfg: JornalConfig): PlanoQuadro {
  const t = cfg.tipos_de_quadro[q.tipo];
  const limite = somarDias(ref, -cfg.finalizar_apos_dias);
  const finalizados = q.grupos.find((g) => g.titulo === q.grupoFinalizadas);
  if (!finalizados) return plano; // o aviso "grupo_finalizadas_ausente" já foi emitido na leitura
  for (const it of q.itens) {
    if (it.lista?.finalizada) continue;
    const encerrado = mesmoRotulo(it.status, t.status_concluido) || mesmoRotulo(it.status, t.status_cancelado);
    if (encerrado && it.data && it.data <= limite) {
      plano.acoesArea.push({ tipo: "seria_finalizado", itemId: it.id, itemNome: it.nome, data: it.data, status: it.status!, grupo: finalizados });
    }
  }
  return plano;
}

export function planejarQuadro(q: QuadroLido, janela: Janela, cfg: JornalConfig = getConfig(), ref: DataISO = hojeSP(undefined, cfg)): PlanoQuadro {
  const tipoCfg = cfg.tipos_de_quadro[q.tipo];
  const plano: PlanoQuadro = { quadroId: q.id, quadroNome: q.nome, janela, acoes: [], acoesArea: [], ocorrenciasExistentes: 0, ignorados: [], avisos: [] };
  if (q.layout === "por_area") return planejarPorArea(q, plano, janela, ref, cfg);
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
