import Link from "next/link";

/**
 * 404 no estilo do app (papel branco, cabeçalho compacto com a régua dupla). Serve às rotas inexistentes e ao notFound()
 * das páginas (ex.: aba Pagamentos oculta); fica fora do layout autenticado, por isso traz o próprio cabeçalho.
 */
export default function NaoEncontrada() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="topo-seguro regua-dupla">
        <div className="mx-auto w-full max-w-[640px] px-5 pb-5">
          <p className="titulo-jornal text-[1.5rem]">A Pauta</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-6 pb-10">
        <h1 className="titulo-jornal text-[1.75rem] leading-tight">Página não encontrada</h1>
        <p className="mt-3 text-base text-tinta-2">O endereço não existe ou você não tem acesso a esta página.</p>
        <Link href="/" className="pressionavel mt-6 inline-flex min-h-12 items-center rounded-xl bg-tinta px-5 text-[1.0625rem] font-semibold text-papel">
          Voltar para Hoje
        </Link>
      </main>
    </div>
  );
}
