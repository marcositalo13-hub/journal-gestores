// ?data=YYYY-MM-DD: simula outro dia, SOMENTE fora de produção.
import { partes } from "../calendario";

export function dataDeTeste(param: string | string[] | undefined, nodeEnv: string | undefined): string | null {
  if (nodeEnv === "production") return null;
  const v = Array.isArray(param) ? param[0] : param;
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = partes(v);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valida = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return valida ? v : null;
}
