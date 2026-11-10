// Quadro "lista" (Pagamentos para aprovação): leitura, avisos, finalização e itens da edição.
import { describe, expect, it } from "vitest";
import { getConfig } from "../config";
import { montarItensJornal } from "../edicao/itens";
import { janelaPadrao } from "../recorrencia";
import { normalizarQuadro } from "./ler";
import { planejarQuadro } from "./planejar";

const cfg = getConfig();
const qc = cfg.quadros.find((q) => q.tipo === "pagamentos")!;
const HOJE = "2026-11-10"; // terça; finalizar_apos_dias = 7 → limite 2026-11-03

const STATUS = JSON.stringify({ labels: { "0": "Aguardando autorização", "1": "Autorizado", "2": "Cancelado" } });
const COLUNAS = [
  { id: "c_val", title: "Valor (R$)", type: "numbers" },
  { id: "c_venc", title: "Vencimento", type: "date" },
  { id: "c_st", title: "Status", type: "status", settings_str: STATUS },
  { id: "c_obs", title: "Observação", type: "text" },
  { id: "c_por", title: "Autorizado por", type: "text" },
  { id: "c_em", title: "Autorizado em", type: "date" },
];
const GRUPOS = [
  { id: "g1", title: "Pagamentos", position: "1" },
  { id: "g2", title: "Finalizados", position: "2" },
];

interface P {
  nome?: string;
  valor?: number | null;
  venc?: string | null;
  status?: string | null;
  grupo?: "g1" | "g2";
  obs?: string;
  por?: string;
  em?: string | null;
}
let n = 0;
function api(o: P = {}) {
  n++;
  const { nome = `Fornecedor ${n}`, valor = 1000, venc = "2026-11-20", status = "Aguardando autorização", grupo = "g1", obs = "", por = "", em = null } = o;
  return {
    id: String(n),
    name: nome,
    url: "https://x",
    updated_at: "2026-11-05T10:00:00Z",
    created_at: "2026-11-05T10:00:00Z",
    group: { id: grupo, title: grupo === "g1" ? "Pagamentos" : "Finalizados" },
    column_values: [
      { id: "c_val", text: valor === null ? "" : String(valor), number: valor },
      { id: "c_venc", text: venc ?? "", date: venc },
      { id: "c_st", text: status ?? "", label: status },
      { id: "c_obs", text: obs },
      { id: "c_por", text: por },
      { id: "c_em", text: em ?? "", date: em },
    ],
    subitems: [],
  };
}
const ler = (itens: ReturnType<typeof api>[], colunas = COLUNAS, grupos = GRUPOS) =>
  normalizarQuadro(qc, { id: qc.id, name: "Pagamentos", hierarchy_type: "classic", columns: colunas, groups: grupos, items_page: { cursor: null, items: [] } }, itens, cfg);
const plano = (itens: ReturnType<typeof api>[], grupos = GRUPOS) => {
  const q = ler(itens, COLUNAS, grupos);
  return { q, p: planejarQuadro(q, janelaPadrao(HOJE), cfg, HOJE) };
};

describe("config do quadro de Pagamentos", () => {
  it("layout lista, grupo de finalizados próprio, sem Chave/Recorrência/Coordenação e sem grupos de mês", () => {
    expect(qc.layout).toBe("lista");
    expect(qc.grupo_finalizadas).toBe("Finalizados");
    const t = cfg.tipos_de_quadro.pagamentos;
    expect(Object.keys(t.colunas)).toEqual(["Valor (R$)", "Vencimento", "Status", "Observação", "Autorizado por", "Autorizado em"]);
    expect(t.status_inicial).toBe("Aguardando autorização");
    expect(t.status_concluido).toBe("Autorizado");
    expect(t.status_cancelado).toBe("Cancelado");
    expect(t.status_travado).toBeUndefined();
    expect(t.obrigatorias).toEqual(["Vencimento", "Valor (R$)"]);
  });
});

describe("leitura (ler.ts)", () => {
  it("quadro novo limpo: nenhum aviso (sem cadastro, sem recorrência, sem chave, sem coordenação)", () => {
    const q = ler([api(), api({ status: "Autorizado" })]);
    expect(q.avisos).toEqual([]);
    expect(q.layout).toBe("lista");
    expect(q.grupoFinalizadas).toBe("Finalizados");
    expect(q.itens.every((i) => i.noCadastro === false && i.lista !== undefined && i.porArea === undefined)).toBe(true);
  });

  it("avisa Valor ou Vencimento vazios (com o id do item)", () => {
    const q = ler([api({ nome: "Sem valor", valor: null }), api({ nome: "Sem data", venc: null }), api({ nome: "Completo" })]);
    const vazios = q.avisos.filter((a) => a.codigo === "obrigatoria_vazia");
    expect(vazios.map((a) => [a.itemNome, /Valor \(R\$\)/.test(a.mensagem) ? "Valor" : "Vencimento"])).toEqual([
      ["Sem valor", "Valor"],
      ["Sem data", "Vencimento"],
    ]);
    expect(vazios.every((a) => a.itemId)).toBe(true);
  });

  it("marca quem está no grupo de finalizados; grupo de finalizados ausente vira aviso", () => {
    const q = ler([api(), api({ grupo: "g2", status: "Autorizado" })]);
    expect(q.itens.map((i) => i.lista!.finalizada)).toEqual([false, true]);
    const sem = ler([api()], COLUNAS, [GRUPOS[0]]);
    expect(sem.avisos.map((a) => a.codigo)).toContain("grupo_finalizadas_ausente");
  });

  it("colunas que sobraram no quadro (ex.: Coordenação) são ignoradas, sem aviso", () => {
    const q = ler([api()], [...COLUNAS, { id: "c_c", title: "Coordenação", type: "dropdown" }]);
    expect(q.avisos).toEqual([]);
  });
});

describe("finalizar: Autorizado ou Cancelado com Vencimento <= hoje - finalizar_apos_dias", () => {
  it("limite: 03/11 (hoje − 7) finaliza; 04/11 não", () => {
    const { p } = plano([
      api({ nome: "no limite", status: "Autorizado", venc: "2026-11-03" }),
      api({ nome: "um dia depois", status: "Autorizado", venc: "2026-11-04" }),
      api({ nome: "cancelado no limite", status: "Cancelado", venc: "2026-11-03" }),
      api({ nome: "cancelado um dia depois", status: "Cancelado", venc: "2026-11-04" }),
    ]);
    expect(p.acoesArea.map((a) => a.tipo === "seria_finalizado" && a.itemNome)).toEqual(["no limite", "cancelado no limite"]);
  });

  it("move para o grupo Finalizados (id do grupo), com a data e o status", () => {
    const { p } = plano([api({ nome: "velho", status: "Autorizado", venc: "2026-10-01" })]);
    expect(p.acoesArea).toEqual([expect.objectContaining({ tipo: "seria_finalizado", itemNome: "velho", data: "2026-10-01", status: "Autorizado", grupo: { id: "g2", titulo: "Finalizados" } })]);
  });

  it("nunca move: aguardando (mesmo vencido), sem vencimento, sem status ou o que já está em Finalizados", () => {
    const { p } = plano([
      api({ nome: "aguardando antigo", status: "Aguardando autorização", venc: "2026-01-01" }),
      api({ nome: "sem data", status: "Autorizado", venc: null }),
      api({ nome: "sem status", status: null, venc: "2026-01-01" }),
      api({ nome: "já finalizado", status: "Autorizado", venc: "2026-01-01", grupo: "g2" }),
    ]);
    expect(p.acoesArea).toEqual([]);
  });

  it("sem grupo Finalizados no quadro não há o que mover (e o aviso já foi emitido na leitura)", () => {
    const { p } = plano([api({ status: "Autorizado", venc: "2026-01-01" })], [GRUPOS[0]]);
    expect(p.acoesArea).toEqual([]);
  });

  it("não projeta recorrência, não cria itens, não cria grupos de mês", () => {
    const { p } = plano([api({ status: "Autorizado", venc: "2026-01-01" }), api()]);
    expect(p.acoes).toEqual([]);
    expect(p.ocorrenciasExistentes).toBe(0);
    expect(p.acoesArea.every((a) => a.tipo === "seria_finalizado")).toBe(true);
  });
});

describe("o coletor nunca reverte nem sobrescreve o que o app autorizou", () => {
  it("autorizado pelo app com vencimento recente ou futuro: nenhuma ação", () => {
    const { p } = plano([api({ status: "Autorizado", por: "Egídio", em: HOJE, venc: "2026-11-20" }), api({ status: "Autorizado", por: "Egídio", em: HOJE, venc: "2026-11-04" })]);
    expect(p.acoesArea).toEqual([]);
    expect(p.acoes).toEqual([]);
  });
  it("autorizado e vencido há mais de 7 dias: só muda de grupo (seria_finalizado); nenhuma ação grava colunas", () => {
    const { p } = plano([api({ status: "Autorizado", por: "Egídio", em: "2026-10-20", venc: "2026-10-30" }), api(), api({ venc: "2026-01-01" })]);
    expect(p.acoesArea.map((a) => a.tipo)).toEqual(["seria_finalizado"]);
    expect(p.acoes).toEqual([]);
  });
});

describe("itens da edição (montarItensJornal)", () => {
  const itens = () => {
    const q = ler([
      api({ nome: "Aguardando", valor: 99999.99 }),
      api({ nome: "Autorizado", status: "Autorizado", valor: 100000 }),
      api({ nome: "Cancelado", status: "Cancelado" }),
      api({ nome: "Sem vencimento", venc: null }),
      api({ nome: "Sem valor", valor: null }),
      api({ nome: "Finalizado", grupo: "g2", status: "Autorizado", por: "Egídio", em: "2026-10-01" }),
    ]);
    return montarItensJornal([q], cfg);
  };

  it("categorias: Aguardando = aberto, Autorizado = concluído, Cancelado = cancelado; os dois grupos entram (histórico)", () => {
    const { itens: i, semPrazo } = itens();
    const por = Object.fromEntries([...i, ...semPrazo].map((x) => [x.nome, x.categoria]));
    expect(por).toEqual({ Aguardando: "aberto", Autorizado: "concluido", Cancelado: "cancelado", "Sem vencimento": "aberto", "Sem valor": "aberto", Finalizado: "concluido" });
  });

  it("Autorizado por / Autorizado em viram campos do item (só quando preenchidos)", () => {
    const { itens: i } = itens();
    expect(i.find((x) => x.nome === "Finalizado")).toMatchObject({ autorizadoPor: "Egídio", autorizadoEm: "2026-10-01" });
    expect(i.find((x) => x.nome === "Autorizado")).not.toHaveProperty("autorizadoPor");
    expect(i.find((x) => x.nome === "Autorizado")).not.toHaveProperty("autorizadoEm");
  });

  it("o dono é o diretor (nunca um gestor), o tipo é Pagamento e não há coordenação nem favorecido", () => {
    const { itens: i, semPrazo } = itens();
    for (const x of [...i, ...semPrazo]) {
      expect(x.dono).toBe(cfg.diretor);
      expect(x.tipo).toBe("Pagamento");
      expect(x).not.toHaveProperty("coordenacao");
      expect(x).not.toHaveProperty("favorecido");
    }
    expect(cfg.gestores.some((g) => g.nome === cfg.diretor)).toBe(false);
  });

  it("motivoAprovacao: 99999,99 → Área subordinada; 100000 → Acima de R$ 100 mil; sem valor → nenhum", () => {
    const { itens: i } = itens();
    const m = (nome: string) => i.find((x) => x.nome === nome)?.motivoAprovacao;
    expect(m("Aguardando")).toBe("Área subordinada");
    expect(m("Autorizado")).toBe("Acima de R$ 100 mil");
    expect(m("Sem valor")).toBeUndefined();
  });

  it("sem Vencimento vai para semPrazo (continua aparecendo na aba)", () => {
    expect(itens().semPrazo.map((x) => x.nome)).toEqual(["Sem vencimento"]);
  });
});
