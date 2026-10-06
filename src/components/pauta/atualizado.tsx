import { formatarHoraMinuto, horaMinuto } from "@/lib/calendario";
import { obterEdicao } from "@/lib/edicao/obter";
import { AtualizadoBotao } from "./atualizar";

/** Horário da última leitura do monday. Se o monday falhar, avisa em vez de mostrar uma hora falsa. */
export async function Atualizado() {
  const hora = await obterEdicao()
    .then((e) => formatarHoraMinuto(horaMinuto(new Date(e.geradoEm))))
    .catch(() => null);
  return <AtualizadoBotao texto={hora ? `atualizado às ${hora}` : "atualização indisponível"} />;
}
