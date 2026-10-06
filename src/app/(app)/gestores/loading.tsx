// Esqueleto discreto da lista de gestores (o pulso é desligado pelo prefers-reduced-motion global).
function Barra({ className }: { className: string }) {
  return <div aria-hidden className={`rounded-md bg-papel-alt ${className}`} />;
}

export default function CarregandoGestores() {
  return (
    <div role="status" aria-label="Carregando gestores" className="animate-pulse">
      <Barra className="h-7 w-36" />
      <div className="mt-4 border-t border-borda">
        {[0, 1, 1, 1, 2, 2, 1, 1].map((nivel, i) => (
          <div key={i} className="border-b border-borda py-3.5" style={{ paddingLeft: `${nivel * 1.125}rem` }}>
            <Barra className="h-4 w-40" />
            <Barra className="mt-2 h-3 w-56" />
            <Barra className="mt-2 h-3 w-44" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
