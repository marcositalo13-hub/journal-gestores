import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AbrirItem } from "@/components/pauta/abrir-item";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { ConteudoLinha } from "@/components/pauta/linha";
import { RotuloNivel } from "@/components/pauta/nivel";
import { HistoricoAutorizados } from "@/components/pauta/historico-autorizados";
import { LinhaItem } from "@/components/pauta/secao";
import { SeletorPagamentos } from "@/components/pauta/seletor-pagamentos";
import { Valor } from "@/components/pauta/valor";
import { dataPorExtenso, hoje } from "@/lib/calendario";
import { leitorDaSessao } from "@/lib/auth";
import { acessoPagamentos, getConfig } from "@/lib/config";
import { dataDeTeste, fixturePagamentosAtiva } from "@/lib/edicao/data-dev";
import { fixturePagamentos } from "@/lib/edicao/fixture-pagamentos";
import { itemDaUrl } from "@/lib/edicao/item-da-url";
import { obterItens } from "@/lib/edicao/obter";
import { montarPagamentos, type PagamentoAguardando } from "@/lib/edicao/pagamentos";
import { nivelUrgencia } from "@/lib/edicao/urgencia";
import { contagem } from "@/lib/formato";
import type { DataISO } from "@/lib/calendario";
import type { ItemEdicao } from "@/lib/edicao/itens";

export const metadata: Metadata = { title: "Pagamentos" };

/** Valor e motivo da aprovação, em duas linhas curtas (cabem ao lado do prazo em telas de 375px). */
function MetaPagamento({ item }: { item: ItemEdicao }) {
  return (
    <>
      <span className="block font-semibold tabular-nums text-tinta">{typeof item.valor === "number" ? <Valor valor={item.valor} /> : "Sem valor informado"}</span>
      {item.motivoAprovacao && <span className="block">{item.motivoAprovacao}</span>}
    </>
  );
}

/** Pagamento aguardando aprovação: barra na cor da urgência, nome, valor, motivo e o prazo (texto + cor). */
function LinhaAguardando({ p, hoje: dia }: { p: PagamentoAguardando; hoje: DataISO }) {
  const nivel = nivelUrgencia(p.item, dia, getConfig());
  return (
    <LinhaItem item={p.item} hoje={dia}>
      <ConteudoLinha item={p.item} mostrarTipo={false} meta={<MetaPagamento item={p.item} />} direita={<RotuloNivel nivel={nivel} rotulo={p.rotulo} />} />
    </LinhaItem>
  );
}

export default async function PaginaPagamentos({ searchParams }: PageProps<"/pagamentos">) {
  const sp = await searchParams;
  // Aba oculta (abas.pagamentos = false): abre por URL só para os e-mails de abas.previa_para (com aviso); os demais veem 404.
  const leitor = await leitorDaSessao();
  const { pode, oculta } = acessoPagamentos(leitor?.email);
  if (!pode) notFound();

  const hojeEfetivo = dataDeTeste(sp.data, process.env.NODE_ENV) ?? hoje();
  // ?fixture=pagamentos: dados de exemplo, SÓ fora de produção (o quadro real pode estar vazio).
  const exemplo = fixturePagamentosAtiva(sp.fixture, process.env.NODE_ENV);

  const itens = exemplo
    ? fixturePagamentos(hojeEfetivo)
    : await obterItens().then(
        (d) => [...d.itens, ...d.semPrazo],
        (erro: unknown) => {
          console.error("[pagamentos] itens indisponíveis:", erro instanceof Error ? erro.message : "erro desconhecido");
          return null;
        },
      );
  if (!itens) return <ErroEdicao />;

  const p = montarPagamentos(itens, hojeEfetivo);
  const itemAberto = await itemDaUrl(sp.item); // ?item=ID: aberto por uma notificação
  const { aguardando, autorizados } = p;
  const ver = sp.ver === "autorizados" ? "autorizados" : "aguardando";

  return (
    <>
      {itemAberto && <AbrirItem item={itemAberto} />}
      {oculta && <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">Em construção — oculta para o diretor</p>}
      {(exemplo || sp.data) && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          {exemplo ? "Dados de exemplo" : "Simulando"} — {dataPorExtenso(hojeEfetivo)} (somente em desenvolvimento).
        </p>
      )}
      <h2 className="titulo-jornal text-[1.75rem]">Pagamentos</h2>
      <p className="mt-1 text-[0.9375rem] text-tinta-2">Para a sua autorização</p>
      <SeletorPagamentos atual={ver} />

      {ver === "autorizados" ? (
        <HistoricoAutorizados grupos={autorizados} />
      ) : aguardando.quantidade === 0 ? (
        <p className="py-6 text-base text-tinta-2">Nenhum pagamento aguardando autorização.</p>
      ) : (
        <section aria-label="Aguardando sua autorização">
          <p className="mt-4 mb-1 flex items-baseline justify-between gap-4 text-[0.9375rem] text-tinta-2">
            <span>{contagem(aguardando.quantidade, "pagamento", "pagamentos")} aguardando</span>
            <span className="whitespace-nowrap text-[1.125rem] font-semibold tabular-nums text-tinta">
              <Valor valor={aguardando.total} />
            </span>
          </p>
          <ul>
            {aguardando.itens.map((x) => (
              <LinhaAguardando key={x.item.id} p={x} hoje={hojeEfetivo} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
