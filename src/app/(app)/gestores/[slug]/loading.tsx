// Esqueleto discreto do caderno de um gestor.
function Barra({ className }: { className: string }) {
  return <div aria-hidden className={`rounded-md bg-papel-alt ${className}`} />;
}

export default function CarregandoCaderno() {
  return (
    <div role="status" aria-label="Carregando caderno" className="animate-pulse">
      <Barra className="h-4 w-24" />
      <Barra className="mt-4 h-8 w-56" />
      <Barra className="mt-3 h-4 w-64" />
      <Barra className="mt-2 h-4 w-40" />
      <Barra className="mt-7 h-4 w-48" />
      <Barra className="mt-3 h-0.5 w-full" />
      <div className="mt-8 border-t border-borda pt-5">
        <Barra className="h-5 w-28" />
        <Barra className="mt-4 h-12 w-full" />
        <Barra className="mt-3 h-12 w-full" />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
