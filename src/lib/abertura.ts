// Abertura diária ("A Pauta" em tela cheia, uma vez por dia). Puro e sem imports: serve também ao cliente.
export const CHAVE_ABERTURA = "pauta:intro";

/** Dia (YYYY-MM-DD) no fuso informado. */
export function diaNoFuso(agora: Date, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** A abertura aparece só na primeira vez do dia: se o dia guardado não é o de hoje (ou não há nada guardado). */
export function deveMostrarAbertura(guardado: string | null | undefined, hoje: string): boolean {
  return guardado !== hoje;
}

/**
 * Script inline (roda antes da primeira pintura): se for a primeira abertura do dia, marca o html com
 * data-intro="YYYY-MM-DD". O componente da abertura grava o dia no localStorage ao começar, então
 * recarregar a página ou trocar de aba no mesmo dia não mostra de novo. Com o armazenamento bloqueado
 * (modo privado) não há como garantir "uma vez por dia": nesse caso a abertura não aparece.
 */
export function scriptAbertura(fuso: string): string {
  return (
    `try{var d=new Intl.DateTimeFormat("en-CA",{timeZone:${JSON.stringify(fuso)},year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());` +
    `if(localStorage.getItem(${JSON.stringify(CHAVE_ABERTURA)})!==d)document.documentElement.setAttribute("data-intro",d)}catch(e){}`
  );
}
