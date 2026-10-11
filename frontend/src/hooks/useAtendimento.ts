import { useEffect, useState } from 'react';
import { api } from '../api/client';

// WhatsApp do atendimento (só dígitos, com 55) configurado pelo Gestor de Patrimônio, ou null
export function useAtendimento() {
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    api
      .get<{ whatsapp: string | null }>('/configuracoes/atendimento')
      // Sem o contato o link simplesmente não aparece: não é motivo para interromper o formulário
      .then((r) => ativo && setWhatsapp(r.whatsapp))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  return whatsapp;
}
