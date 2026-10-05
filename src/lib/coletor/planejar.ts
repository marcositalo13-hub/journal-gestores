// Planejamento puro (sem escrita): o que o coletor CRIARIA/MOVERIA no monday.
import { getConfig, type JornalConfig } from "../config";
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

export interface PlanoQuadro {
  quadroId: string;
  quadroNome: string;
  janela: Janela;
  acoes: Acao[];
  /** regras ignoradas (ex.: canceladas no Cadastro) */
  ignorados: { itemId: string; itemNome: string; motivo: string }[];
  avisos: Aviso[];
}

export function planejarQuadro(q: QuadroLido, janela: Janela, cfg: JornalConfig = getConfig()): PlanoQuadro {
  const tipoCfg = cfg.tipos_de_quadro[q.tipo];
  const plano: PlanoQuadro = { quadroId: q.id, quadroNome: q.nome, janela, acoes: [], ignorados: [], avisos: [] };
  const grupos = new Set(q.grupos.map((g) => g.titulo));

  // Chaves já materializadas em qualquer grupo de mês (= fora do Cadastro).
  const porChave = new Map<string, string>();
  for (const it of q.itens) if (!it.noCadastro && it.chave) porChave.set(it.chave, it.id);

  for (const it of q.itens.filter((i) => i.noCadastro)) {
    const ctx = { itemId: it.id, itemNome: it.nome };
    if (it.status === tipoCfg.status_cancelado) {
      plano.ignorados.push({ ...ctx, motivo: `status "${tipoCfg.status_cancelado}"` });
      continue;
    }
    if (!it.data) continue; // obrigatória vazia: já reportada na leitura
    const freq = parseFrequencia(it.recorrencia);
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
