import { CalendarClock } from "lucide-react";
import { redirect } from "next/navigation";
import { AbrirItem } from "@/components/pauta/abrir-item";
import type { ReactNode } from "react";
import { BotaoItem } from "@/components/pauta/botao-item";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { CartaoNotificacoes, TesteNotificacao } from "@/components/pauta/notificacoes";
import { LegendaNiveis } from "@/components/pauta/legenda-niveis";
import { ConteudoLinha } from "@/components/pauta/linha";
import { Manchete } from "@/components/pauta/manchete";
import { RotuloNivel } from "@/components/pauta/nivel";
import { LinhaItem, LinhaSemPrazo, MetaItem, RotuloItem } from "@/components/pauta/secao";
import { NavegadorDias, type DiaNavegador } from "@/components/pauta/navegador-dias";
import { dataPorExtenso, diasEntre, ehDiaUtil, tituloAvisoNaoUtil, type DataISO } from "@/lib/calendario";
import { areaCurta, getConfig } from "@/lib/config";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import { itemDaUrl } from "@/lib/edicao/item-da-url";
import { secoesDeHoje, type DiaSemana } from "@/lib/edicao/montar";
import { obterEdicao, obterEdicaoEm } from "@/lib/edicao/obter";
import { nivelUrgencia, textosLegenda } from "@/lib/edicao/urgencia";
import { contagem, dataTitulo, etapasTexto, haDias } from "@/lib/formato";

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

/** Lista de um dia futuro (mesmas linhas e mesma folha de detalhes da edição). */
function ListaDoDia({ dia, hoje }: { dia: DiaSemana; hoje: DataISO }) {
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
            <LinhaItem key={item.id} item={item} hoje={hoje}>
              <ConteudoLinha
                item={item}
                meta={<MetaItem item={item} />}
                direita={<RotuloItem item={item} hoje={hoje} />}
              />
            </LinhaItem>
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
  // ?item=ID: aberto por uma notificação. Pagamentos abrem na aba deles.
  const itemAberto = await itemDaUrl(params.item);
  if (itemAberto?.tipoQuadro === "pagamentos" && getConfig().abas.pagamentos) redirect(`/pagamentos?item=${itemAberto.id}`);

  const resultado = await (simulada ? obterEdicaoEm(simulada) : obterEdicao()).then(
    (edicao) => ({ edicao }),
    (erro: unknown) => {
      console.error("[hoje] edição indisponível:", erro instanceof Error ? erro.message : "erro desconhecido");
      return { edicao: null };
    },
  );
  if (!resultado.edicao) return <ErroEdicao />;
  const edicao = resultado.edicao;
  const hoje = edicao.data;
  const cfg = getConfig();

  // Navegador: "Hoje" + 6 dias seguintes. ?dia= fora dessa janela é ignorado (volta para hoje).
  const proximos = edicao.semana.slice(0, 6);
  const dias: DiaNavegador[] = [
    { data: edicao.data, ehDiaUtil: ehDiaUtil(edicao.data, cfg), itens: edicao.hoje.length },
    ...proximos.map((d) => ({ data: d.data, ehDiaUtil: d.ehDiaUtil, itens: d.itens.length })),
  ];
  const outroDia = proximos.find((d) => d.data === params.dia) ?? null;

  // "Hoje" agrupado por gestor, na ordem do config (donos fora do config vêm por último).
  // Nenhum item aparece em duas seções (veja secoesDeHoje).
  const { atrasados, contratos, hoje: hojeSemManchete, travados, semPrazo, hojeSoManchete } = secoesDeHoje(edicao);
  const gruposHoje = edicao.gestores
    .map((g) => ({ nome: g.nome, itens: hojeSemManchete.filter((i) => i.dono === g.nome) }))
    .filter((g) => g.itens.length > 0);

  return (
    <>
      {itemAberto && <AbrirItem item={itemAberto} />}
      <CartaoNotificacoes />
      <NavegadorDias dias={dias} selecionado={outroDia?.data ?? edicao.data} />

      {simulada && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}

      {outroDia ? (
        <ListaDoDia dia={outroDia} hoje={edicao.data} />
      ) : (
        <>
          <Manchete manchete={edicao.manchete} hoje={edicao.data} />

          {atrasados.length > 0 && (
            <Secao id="s-atrasados" titulo="Atrasados">
              <ul>
                {atrasados.map(({ item, diasAtraso }) => (
                  <LinhaItem key={item.id} item={item} hoje={hoje}>
                    <ConteudoLinha
                      item={item}
                      mostrarTipo={false}
                      meta={<MetaItem item={item} />}
                      direita={<RotuloNivel nivel="preto" rotulo={haDias(diasAtraso)} />}
                    />
                  </LinhaItem>
                ))}
              </ul>
            </Secao>
          )}

          {contratos.length > 0 && (
            <Secao id="s-contratos" titulo="Contratos para análise">
              <ul>
                {contratos.map((item) => {
                  const dias = diasEntre(hoje, item.data);
                  return (
                    <LinhaItem key={item.id} item={item} hoje={hoje}>
                      <ConteudoLinha
                        item={item}
                        mostrarTipo={false}
                        meta={<MetaItem item={item} />}
                        direita={<RotuloNivel nivel={nivelUrgencia(item, hoje, cfg)} rotulo={dias <= 0 ? "Vence hoje" : dias === 1 ? "Amanhã" : `Em ${dias} dias`} />}
                      />
                    </LinhaItem>
                  );
                })}
              </ul>
            </Secao>
          )}

          {(gruposHoje.length > 0 || !hojeSoManchete) && (
          <Secao id="s-hoje" titulo="Hoje">
            {gruposHoje.length === 0 ? (
              <p className="py-3 text-base text-tinta-2">Nada vence hoje.</p>
            ) : (
              gruposHoje.map((g) => (
                <div key={g.nome} className="mt-3">
                  <h3 className="rotulo-gestor">
                    {g.nome}
                    {areaCurta(g.nome) && ` · ${areaCurta(g.nome)}`}
                  </h3>
                  <ul>
                    {g.itens.map((item) => (
                      <LinhaItem key={item.id} item={item} hoje={hoje}>
                        <ConteudoLinha
                          item={item}
                          meta={<MetaItem item={item} />}
                          direita={<RotuloItem item={item} hoje={hoje} />}
                        />
                      </LinhaItem>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </Secao>
          )}

          {travados.length > 0 && (
            <Secao id="s-travados" titulo="Travados">
              <ul>
                {travados.map(({ item, motivo }) => (
                  <LinhaItem key={item.id} item={item} hoje={hoje}>
                    <ConteudoLinha
                      item={item}
                      mostrarTipo={false}
                      meta={
                        <>
                          {motivo ?? "Sem motivo informado"}
                          <br />
                          <MetaItem item={item} extras={item.etapas ? [etapasTexto(item.etapas)] : []} />
                        </>
                      }
                      direita={<RotuloItem item={item} hoje={hoje} />}
                    />
                  </LinhaItem>
                ))}
              </ul>
            </Secao>
          )}

          {semPrazo.length > 0 && (
            <Secao id="s-sem-prazo" titulo="Sem prazo">
              <ul>
                {semPrazo.map((item) => (
                  <LinhaSemPrazo key={item.id} item={item} hoje={hoje} />
                ))}
              </ul>
            </Secao>
          )}

          {edicao.avisoNaoUtil && (
            <section aria-labelledby="s-aviso" className="mt-8 overflow-hidden rounded-xl border border-aviso/30 bg-aviso/[0.07] px-4 pt-4 pb-2">
              <h2 id="s-aviso" className="titulo-secao flex items-center gap-2 text-aviso">
                <CalendarClock aria-hidden size={20} strokeWidth={2} />
                {tituloAvisoNaoUtil(edicao.data, edicao.avisoNaoUtil.proximoDiaUtil, cfg)}
              </h2>
              <ul className="mt-1">
                {edicao.avisoNaoUtil.itens.map(({ item, rotulo }) => (
                  <li key={item.id} className="border-b border-aviso/20 last:border-b-0">
                    <BotaoItem item={item} nivel={nivelUrgencia(item, hoje, cfg)} className="-mx-4 w-[calc(100%+2rem)] px-4">
                      <span className="block min-w-0 flex-1 py-3">
                        <span className="block text-[0.9375rem] font-semibold text-aviso">{rotulo}</span>
                        <span className="nome-item">{item.nome}</span>
                        <span className="meta-item">
                      <MetaItem item={item} />
                    </span>
                      </span>
                    </BotaoItem>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </>
      )}

      <LegendaNiveis regras={textosLegenda(cfg)} />
      <TesteNotificacao />
    </>
  );
}
