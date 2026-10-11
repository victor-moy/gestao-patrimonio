import { useAuth } from '../auth/AuthContext';
import { useAtendimento } from '../hooks/useAtendimento';

// "Não encontrou o item?": leva ao WhatsApp do atendimento com a mensagem já escrita, para que a
// equipe regularize o cadastro, em vez de a pessoa inventar um equipamento para prosseguir.
export function ItemAusente() {
  const { usuario } = useAuth();
  const whatsapp = useAtendimento();
  if (!whatsapp) return null;

  const mensagem =
    'Olá! Não encontrei o equipamento na lista ao abrir um chamado no sistema de patrimônio.' +
    `\nUnidade: ${usuario?.unidadeNome ?? '—'}\nSolicitante: ${usuario?.nome ?? '—'}`;
  const endereco = `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`;

  return (
    <p className="item-ausente">
      Não encontrou o item?{' '}
      <a href={endereco} target="_blank" rel="noreferrer">
        Fale com o atendimento
      </a>
    </p>
  );
}
