import Link from "next/link";

export default function CadernoNaoEncontrado() {
  return (
    <>
      <Link href="/gestores" className="pressionavel -ml-1 inline-flex min-h-11 items-center px-1 text-[0.9375rem] text-tinta-2">
        ‹ Gestores
      </Link>
      <div className="py-10">
        <h2 className="titulo-jornal text-[1.75rem] leading-tight">Gestor não encontrado.</h2>
        <p className="mt-3 text-base text-tinta-2">Este caderno não existe ou o nome mudou na estrutura.</p>
      </div>
    </>
  );
}
