import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";
import { BotaoItem } from "@/components/pauta/botao-item";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { ConteudoLinha } from "@/components/pauta/linha";
import { Manchete } from "@/components/pauta/manchete";
import { PillStatus } from "@/components/pauta/pill-status";
import { NavegadorDias, type DiaNavegador } from "@/components/pauta/navegador-dias";
import { Valor } from "@/components/pauta/valor";
import { dataPorExtenso, ehDiaUtil } from "@/lib/calendario";
import { getConfig } from "@/lib/config";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import type { ItemEdicao } from "@/lib/edicao/itens";
import type { DiaSemana } from "@/lib/edicao/montar";
import { obterEdicao, obterEdicaoEm } from "@/lib/edicao/obter";
import { contagem, dataCurta, dataTitulo, etapasTexto, haDias, semPrazoTexto, tituloAvisoNaoUtil } from "@/lib/formato";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 border-t border-borda pt-5">
      <h2 id={id} className="titulo-secao mb-1">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const Linha = ({ item, children }: { item: ItemEdicao; children: ReactNode }) => (
  <li className="border-b border-borda last:border-b-0">
    <BotaoItem item={item}>{children}</BotaoItem>
  </li>
);

/** Lista de um dia futuro (mesmas linhas e mesma folha de detalhes da edição). */
function ListaDoDia({ dia }: { dia: DiaSemana }) {
  return (
    <section aria-labelledby="s-dia">
      <h2 id="s-dia" className="titulo-jornal text-[1.625rem] leading-tight">
        {dataTitulo(dia.data)}
      </h2>
      <p className="mt-1 text-base text-tinta-2">
        {dia.itens.length === 0 ? "Nada previsto." : contagem(dia.itens.length, "item", "itens")}
        {!dia.ehDiaUtil && " · dia não útil"}
      </p>
      {dia.itens.length > 0 && (
        <ul className="mt-3 border-t border-borda">
          {dia.itens.map((item) => (
            <Linha key={item.id} item={item}>
              <ConteudoLinha
                item={item}
                meta={
                  <>
                    {item.dono}
                    {typeof item.valor === "number" && (
                      <>
                        {" · "}
                        <Valor valor={item.valor} />
                      </>
                    )}
                  </>
                }
                direita={<PillStatus categoria={item.categoria} status={item.status} />}
              />
            </Linha>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function PaginaHoje({ searchParams }: PageProps<"/">) {
  // ?data=YYYY-MM-DD simula outro dia, só fora de produção (em produção é ignorado).
  const params = await searchParams;
  const simulada = dataDeTeste(params.data, process.env.NODE_ENV);

  const resultado = await (simulada ? obterEdicaoEm(simulada) : obterEdicao()).then(
    (edicao) => ({ edicao }),
    (erro: unknown) => {
      console.error("[hoje] edição indisponível:", erro instanceof Error ? erro.message : "erro desconhecido");
      return { edicao: null };
    },
  );
  if (!resultado.edicao) return <ErroEdicao />;
  const edicao = resultado.edicao;
  const cfg = getConfig();

  // Navegador: "Hoje" + 6 dias seguintes. ?dia= fora dessa janela é ignorado (volta para hoje).
  const proximos = edicao.semana.slice(0, 6);
  const dias: DiaNavegador[] = [
    { data: edicao.data, ehDiaUtil: ehDiaUtil(edicao.data, cfg), itens: edicao.hoje.length },
    ...proximos.map((d) => ({ data: d.data, ehDiaUtil: d.ehDiaUtil, itens: d.itens.length })),
  ];
  const outroDia = proximos.find((d) => d.data === params.dia) ?? null;

  // "Hoje" agrupado por gestor, na ordem do config (donos fora do config vêm por último).
  const gruposHoje = edicao.gestores
    .map((g) => ({ nome: g.nome, itens: edicao.hoje.filter((i) => i.dono === g.nome) }))
    .filter((g) => g.itens.length > 0);

  return (
    <>
      <NavegadorDias dias={dias} selecionado={outroDia?.data ?? edicao.data} />

      {simulada && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}

      {outroDia ? (
        <ListaDoDia dia={outroDia} />
      ) : (
        <>
          <Manchete manchete={edicao.manchete} hoje={edicao.data} />

          <Secao id="s-hoje" titulo="Hoje">
            {gruposHoje.length === 0 ? (
              <p className="py-3 text-base text-tinta-2">Nada vence hoje.</p>
            ) : (
              gruposHoje.map((g) => (
                <div key={g.nome} className="mt-3">
                  <h3 className="rotulo-gestor">{g.nome}</h3>
                  <ul>
                    {g.itens.map((item) => (
                      <Linha key={item.id} item={item}>
                        <ConteudoLinha
                          item={item}
                          meta={
                            typeof item.valor === "number" ? (
                              <>
                                <Valor valor={item.valor} />
                                {item.favorecido && ` · ${item.favorecido}`}
                              </>
                            ) : undefined
                          }
                          direita={<PillStatus categoria={item.categoria} status={item.status} />}
                        />
                      </Linha>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </Secao>

          {edicao.pendencias.length > 0 && (
            <Secao id="s-pendencias" titulo="Pendências">
              <ul>
                {edicao.pendencias.map(({ item, diasAtraso }) => (
                  <Linha key={item.id} item={item}>
                    <ConteudoLinha
                      item={item}
                      mostrarTipo={false}
                      meta={`${item.dono} · prazo ${dataCurta(item.data)}`}
                      direita={<span className="shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold text-alerta">{haDias(diasAtraso)}</span>}
                    />
                  </Linha>
                ))}
              </ul>
            </Secao>
          )}

          {edicao.travados.length > 0 && (
            <Secao id="s-travados" titulo="Travados">
              <ul>
                {edicao.travados.map(({ item, motivo }) => (
                  <Linha key={item.id} item={item}>
                    <ConteudoLinha
                      item={item}
                      mostrarTipo={false}
                      meta={
                        <>
                          {motivo ?? "Sem motivo informado"}
                          {item.etapas && (
                            <>
                              <br />
                              {etapasTexto(item.etapas)}
                            </>
                          )}
                        </>
                      }
                      direita={<PillStatus categoria="travado" status="Travado" />}
                    />
                  </Linha>
                ))}
              </ul>
            </Secao>
          )}

          {edicao.avisoNaoUtil && (
            <section aria-labelledby="s-aviso" className="mt-8 rounded-xl border border-aviso/30 bg-aviso/[0.07] px-4 pt-4 pb-2">
              <h2 id="s-aviso" className="titulo-secao flex items-center gap-2 text-aviso">
                <CalendarClock aria-hidden size={20} strokeWidth={2} />
                {tituloAvisoNaoUtil(edicao.data, edicao.avisoNaoUtil.proximoDiaUtil, cfg)}
              </h2>
              <ul className="mt-1">
                {edicao.avisoNaoUtil.itens.map(({ item, rotulo }) => (
                  <li key={item.id} className="border-b border-aviso/20 last:border-b-0">
                    <BotaoItem item={item} className="-mx-4 w-[calc(100%+2rem)] px-4">
                      <span className="block min-w-0 flex-1 py-3">
                        <span className="block text-[0.9375rem] font-semibold text-aviso">{rotulo}</span>
                        <span className="nome-item">{item.nome}</span>
                        <span className="meta-item">{item.dono}</span>
                      </span>
                    </BotaoItem>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {edicao.semPrazo.length > 0 && <p className="mt-10 text-[0.9375rem] text-tinta-2">{semPrazoTexto(edicao.semPrazo.length)}</p>}
        </>
      )}
    </>
  );
}
