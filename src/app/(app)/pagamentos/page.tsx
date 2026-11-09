import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { ConteudoLinha } from "@/components/pauta/linha";
import { PillStatus } from "@/components/pauta/pill-status";
import { LinhaItem, MetaItem, Secao } from "@/components/pauta/secao";
import { Valor } from "@/components/pauta/valor";
import { dataPorExtenso, hoje } from "@/lib/calendario";
import { getConfig } from "@/lib/config";
import { dataDeTeste, fixturePagamentosAtiva } from "@/lib/edicao/data-dev";
import { fixturePagamentos } from "@/lib/edicao/fixture-pagamentos";
import type { ItemJornal } from "@/lib/edicao/itens";
import { obterItens } from "@/lib/edicao/obter";
import { montarPagamentos, type TotaisMes } from "@/lib/edicao/pagamentos";
import { dataCurta, haDias } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pagamentos" };

/** Previsto, Pago e A pagar do mês, com a régua de tinta fina (pago ÷ previsto). */
function BlocoMes({ t, pequeno }: { t: TotaisMes; pequeno?: boolean }) {
  if (t.quantidade === 0) return <p className="py-2 text-base text-tinta-2">Nenhum pagamento previsto.</p>;
  const pct = t.previsto > 0 ? Math.min(100, Math.round((t.pago / t.previsto) * 100)) : 0;
  const linhas: [string, number][] = [
    ["Previsto", t.previsto],
    ["Pago", t.pago],
    ["A pagar", t.aPagar],
  ];
  return (
    <div className="mt-2">
      <dl>
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className={cn("flex items-baseline justify-between gap-4 border-b border-borda last:border-b-0", pequeno ? "py-1" : "py-2")}>
            <dt className={cn("text-tinta-2", pequeno ? "text-[0.875rem]" : "text-[0.9375rem]")}>{rotulo}</dt>
            <dd className={cn("whitespace-nowrap font-semibold tabular-nums", pequeno ? "text-[0.9375rem]" : "text-[1.125rem]")}>
              <Valor valor={valor} />
            </dd>
          </div>
        ))}
      </dl>
      <div
        role="progressbar"
        aria-label={`Pago do previsto em ${t.rotulo}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-0.5 w-full bg-borda"
      >
        <div className="h-full bg-tinta" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[0.875rem] tabular-nums text-tinta-2">{pct}% pago</p>
    </div>
  );
}

interface LinhaPag {
  item: ItemJornal;
  /** selo sob a linha do gestor/valor (padrão: status). Fica numa linha própria: no celular não cabe ao lado do valor. */
  selo?: ReactNode;
  /** mostra "venc. dd de mmm" ao lado do selo */
  vencimento?: boolean;
  /** texto acima da linha do gestor (ex.: motivo de um travado) */
  motivo?: string | null;
}

/** Linha de pagamento: nome / "{gestor} · {área} · {valor}" (uma linha) / selo + vencimento. */
const Linhas = ({ itens }: { itens: LinhaPag[] }) => (
  <ul>
    {itens.map(({ item, selo, vencimento, motivo }) => (
      <LinhaItem key={item.id} item={item}>
        <ConteudoLinha
          item={item}
          mostrarTipo={false}
          meta={
            <>
              {motivo !== undefined && (
                <>
                  {motivo ?? "Sem motivo informado"}
                  <br />
                </>
              )}
              <MetaItem item={item} />
              <span className="mt-1.5 flex items-center gap-2 text-[0.9375rem]">
                {selo ?? <PillStatus categoria={item.categoria} status={item.status} />}
                {vencimento && <span className="whitespace-nowrap">venc. {dataCurta(item.data)}</span>}
              </span>
            </>
          }
        />
      </LinhaItem>
    ))}
  </ul>
);

export default async function PaginaPagamentos({ searchParams }: PageProps<"/pagamentos">) {
  const sp = await searchParams;
  const hojeEfetivo = dataDeTeste(sp.data, process.env.NODE_ENV) ?? hoje();
  // ?fixture=pagamentos: dados de exemplo, SÓ fora de produção (o quadro real pode estar vazio).
  const exemplo = fixturePagamentosAtiva(sp.fixture, process.env.NODE_ENV);

  const itens = exemplo
    ? fixturePagamentos(hojeEfetivo)
    : await obterItens().then(
        (d) => d.itens,
        (erro: unknown) => {
          console.error("[pagamentos] itens indisponíveis:", erro instanceof Error ? erro.message : "erro desconhecido");
          return null;
        },
      );
  if (!itens) return <ErroEdicao />;

  const p = montarPagamentos(itens, hojeEfetivo, getConfig());
  const maiorSaida = Math.max(0, ...p.saidasPorData.map((s) => s.total));

  return (
    <>
      {(exemplo || sp.data) && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          {exemplo ? "Dados de exemplo" : "Simulando"} — {dataPorExtenso(hojeEfetivo)} (somente em desenvolvimento).
        </p>
      )}
      <h2 className="titulo-jornal text-[1.75rem]">Pagamentos</h2>
      <p className="mt-1 text-[0.9375rem] text-tinta-2">Pagamentos lançados no quadro</p>

      {p.vazio ? (
        <p className="mt-8 border-t border-borda pt-5 text-base text-tinta-2">Nenhum pagamento lançado ainda.</p>
      ) : (
        <>
          <Secao id="s-mes" titulo={`${p.mesAtual.rotulo} em números`}>
            <BlocoMes t={p.mesAtual} />
          </Secao>
          <Secao id="s-prox" titulo={`${p.proximoMes.rotulo} em números`} pequeno>
            <BlocoMes t={p.proximoMes} pequeno />
          </Secao>

          {p.atrasados.length > 0 && (
            <Secao id="s-atrasados" titulo="Atrasados" alerta>
              <Linhas
                itens={p.atrasados.map(({ item, diasAtraso }) => ({
                  item,
                  vencimento: true,
                  selo: <span className="whitespace-nowrap font-semibold text-alerta">{haDias(diasAtraso)}</span>,
                }))}
              />
            </Secao>
          )}

          <Secao id="s-saidas" titulo="Saídas por data">
            {p.saidasPorData.length === 0 ? (
              <p className="py-3 text-base text-tinta-2">Nenhuma saída prevista nos próximos 45 dias.</p>
            ) : (
              <ul>
                {p.saidasPorData.map((s) => (
                  <li key={s.data} className="border-b border-borda py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className={cn("w-[4.75rem] shrink-0 text-[0.9375rem] font-medium tabular-nums", s.ehDiaUtil ? "text-tinta" : "text-tinta-2")}>{s.rotulo}</span>
                      {/* barra proporcional ao total do dia: só tokens do design, sem biblioteca de gráfico */}
                      <span aria-hidden className="relative h-2 min-w-0 flex-1 rounded-sm bg-papel-alt">
                        <span className="absolute inset-y-0 left-0 rounded-sm bg-tinta" style={{ width: `${Math.max(3, (s.total / maiorSaida) * 100)}%` }} />
                      </span>
                      <span className="w-[6.5rem] shrink-0 whitespace-nowrap text-right text-[0.9375rem] font-semibold tabular-nums">
                        <Valor valor={s.total} />
                      </span>
                    </div>
                    <Linhas itens={s.itens.map((item) => ({ item }))} />
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {p.maioresDoMes.length > 0 && (
            <Secao id="s-maiores" titulo="Maiores do mês">
              <Linhas itens={p.maioresDoMes.map((item) => ({ item, vencimento: true }))} />
            </Secao>
          )}

          {p.travados.length > 0 && (
            <Secao id="s-travados" titulo="Travados">
              <Linhas itens={p.travados.map(({ item, motivo }) => ({ item, motivo, vencimento: true, selo: <PillStatus categoria="travado" status="Travado" /> }))} />
            </Secao>
          )}
        </>
      )}
    </>
  );
}
