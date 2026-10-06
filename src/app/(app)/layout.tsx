import { redirect } from "next/navigation";
import { dataPorExtenso, formatarHoraMinuto, hoje, horaMinuto, saudacao } from "@/lib/calendario";
import { leitorPorEmail } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "../entrar/actions";
import { BarraAbas } from "./barra-abas";

// Defesa em profundidade: o proxy já barra, mas a página também verifica.
async function exigirLeitor() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!email) redirect("/entrar");
  const leitor = leitorPorEmail(email);
  if (!leitor) redirect("/entrar?erro=nao-autorizado");
  return leitor;
}

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const leitor = await exigirLeitor();
  const agora = new Date();
  const hora = horaMinuto(agora);
  const dia = hoje(agora);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="topo-seguro border-b border-borda">
        <div className="mx-auto w-full max-w-[640px] px-5 pb-4">
          <div className="flex justify-end">
            <form action={sair}>
              <button type="submit" className="pressionavel -mr-3 min-h-11 min-w-11 px-3 text-[0.9375rem] text-tinta-2">
                Sair
              </button>
            </form>
          </div>
          <h1 className="titulo-jornal text-[2.1rem] sm:text-[2.55rem]">A Pauta</h1>
          <p className="mt-3 text-base text-tinta">
            {saudacao(hora.h)}, {leitor.nome}. Estas são as prioridades de hoje.
          </p>
          {/* TODO: mostrar o horário da última coleta dos dados quando houver dados ao vivo (hoje é a hora da renderização). */}
          <p className="mt-1 text-base text-tinta-2">
            <time dateTime={dia}>{dataPorExtenso(dia)}</time> · atualizado às {formatarHoraMinuto(hora)}
          </p>
        </div>
      </header>

      {/* espaço para a barra de abas fixa + área segura inferior */}
      <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-6 pb-[calc(var(--altura-abas)+env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>

      <BarraAbas />
    </div>
  );
}
