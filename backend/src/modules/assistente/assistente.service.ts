import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { assistenteTools } from './assistente.tools';

export interface MensagemAssistente {
  role: 'user' | 'assistant';
  content: string;
}

function aData(d: Date) {
  return d.toISOString().slice(0, 10);
}

function montarSystemPrompt() {
  return (
    'Você é o assistente de dados do Sistema de Gestão de Patrimônio (SGP) da Secretaria da ' +
    'Saúde de Joinville. Responda perguntas do Gestor de Patrimônio sobre solicitações ' +
    '(Substituição, Ampliação, Cessão de Uso, Empréstimo, Recolha), unidades e itens ' +
    'aguardando estoque, usando SEMPRE as ferramentas disponíveis pra buscar os dados reais — ' +
    'nunca invente números. Se a pergunta citar um item específico e você não souber o ID, use ' +
    'buscar_tipo_equipamento primeiro. Responda em português, de forma direta e objetiva, ' +
    'citando os números relevantes. A interface exibe texto puro, sem renderizar Markdown — ' +
    'não use tabelas, **negrito**, listas com "-"/"*" nem cabeçalhos com "#"; para listar ' +
    'vários itens, use frases ou linhas simples separadas por quebra de linha. ' +
    `Hoje é ${aData(new Date())}.`
  );
}

// Instanciado sob demanda (não no import do módulo) pra não quebrar o
// processo inteiro se ANTHROPIC_API_KEY não estiver configurada — só essa
// funcionalidade fica indisponível.
let client: Anthropic | null = null;
function getClient() {
  if (!env.anthropicApiKey) {
    throw new AppError('Assistente de IA não configurado (ANTHROPIC_API_KEY ausente).', 503);
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export async function responder(mensagens: MensagemAssistente[]): Promise<string> {
  const finalMessage = await getClient().beta.messages.toolRunner({
    model: 'claude-opus-5',
    // Respostas curtas e objetivas — não é um caso de uso que precise de
    // muito espaço de saída.
    max_tokens: 2048,
    system: montarSystemPrompt(),
    tools: assistenteTools,
    messages: mensagens.map((m) => ({ role: m.role, content: m.content })),
  });

  const textos = finalMessage.content.filter((bloco) => bloco.type === 'text').map((bloco) => bloco.text);
  return textos.join('\n\n').trim() || 'Não consegui formular uma resposta pra essa pergunta.';
}
