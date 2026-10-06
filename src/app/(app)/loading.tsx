// Esqueleto discreto: mesmos blocos da edição (manchete, seções), sem cores fortes nem movimento brusco.
// O pulso é suave e o prefers-reduced-motion global o desliga.
function Barra({ className }: { className: string }) {
  return <div aria-hidden className={`rounded-md bg-papel-alt ${className}`} />;
}

export default function Carregando() {
  return (
    <div role="status" aria-label="Carregando a edição" className="animate-pulse">
      <Barra className="h-3.5 w-32" />
      <Barra className="mt-3 h-8 w-11/12" />
      <Barra className="mt-2 h-8 w-2/3" />
      <Barra className="mt-4 h-4 w-3/4" />
      <div className="mt-8 border-t border-borda pt-5">
        <Barra className="h-5 w-16" />
        <Barra className="mt-4 h-4 w-24" />
        <Barra className="mt-4 h-12 w-full" />
        <Barra className="mt-3 h-12 w-full" />
      </div>
      <div className="mt-8 border-t border-borda pt-5">
        <Barra className="h-5 w-40" />
        <div className="mt-4 grid grid-cols-7 gap-0.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Barra key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
