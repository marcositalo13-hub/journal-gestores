import { iniciais } from "@/lib/fotos";
import { cn } from "@/lib/utils";

/**
 * Foto circular com anel fino (--borda); sem foto, iniciais em Newsreader sobre --papel-alt.
 * `url` é uma URL assinada de curta duração (bucket privado). Decorativa: o nome vem sempre ao lado.
 */
export function Avatar({ nome, url, tamanho, className }: { nome: string; url: string | null; tamanho: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-papel-alt ring-1 ring-borda", className)}
      style={{ width: tamanho, height: tamanho }}
    >
      {url ? (
        // <img> de propósito: a URL é assinada, externa e muda a cada requisição (next/image não ajuda aqui)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span className="font-jornal font-semibold text-tinta-2" style={{ fontSize: Math.round(tamanho * 0.36) }}>
          {iniciais(nome)}
        </span>
      )}
    </span>
  );
}
