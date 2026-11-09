// Núcleo do envio de push: sem rede nem banco aqui (tudo entra por `deps`), para poder testar.
export interface Inscricao {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DepsEnvio {
  listar(email: string): Promise<Inscricao[]>;
  /** deve lançar um erro com `statusCode` quando o serviço de push recusar */
  enviar(inscricao: Inscricao, payload: string): Promise<void>;
  desativar(id: string): Promise<void>;
  marcarEnvio(id: string): Promise<void>;
}

export interface ResultadoEnvio {
  enviados: number;
  desativadas: number;
  falhas: number;
}

/** O serviço de push diz que a inscrição não existe mais (aparelho desinstalou, permissão revogada). */
export const inscricaoExpirou = (e: unknown) => {
  const c = (e as { statusCode?: number } | null)?.statusCode;
  return c === 404 || c === 410;
};

/** Envia a todas as inscrições ativas do e-mail. 404/410 desativam a inscrição; outras falhas só contam. */
export async function enviarParaEmail(email: string, payload: string, deps: DepsEnvio): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: 0, desativadas: 0, falhas: 0 };
  for (const i of await deps.listar(email)) {
    try {
      await deps.enviar(i, payload);
      r.enviados++;
      await deps.marcarEnvio(i.id);
    } catch (e) {
      if (inscricaoExpirou(e)) {
        r.desativadas++;
        await deps.desativar(i.id).catch(() => undefined);
      } else {
        r.falhas++;
        console.error("[push] falha ao enviar:", (e as { statusCode?: number } | null)?.statusCode ?? (e instanceof Error ? e.message : "erro desconhecido"));
      }
    }
  }
  return r;
}
