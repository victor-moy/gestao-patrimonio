import type { Usuario } from '../types';

// Os ids são os de backend/src/lib/permissoes.ts (um teste do backend confere que são os mesmos); aqui ficam também grupos e rótulos.
export const GRUPOS_PERMISSOES = [
  {
    grupo: 'Manutenções',
    permissoes: [
      { id: 'MANUTENCAO_CONSULTAR', rotulo: 'Consultar chamados' },
      { id: 'MANUTENCAO_ESCREVER', rotulo: 'Escrever chamados' },
      { id: 'MANUTENCAO_TRIAR', rotulo: 'Triar chamados' },
      { id: 'MANUTENCAO_AVALIAR', rotulo: 'Realizar avaliação técnica' },
      { id: 'MANUTENCAO_VISTORIAR', rotulo: 'Registrar vistorias' },
      { id: 'MANUTENCAO_MEDICAO_PREPARAR', rotulo: 'Preparar medições' },
      { id: 'MANUTENCAO_MEDICAO_CONFERIR', rotulo: 'Conferir medições' },
      { id: 'MANUTENCAO_FISCALIZAR', rotulo: 'Fiscalizar' },
    ],
  },
  { grupo: 'Contratos', permissoes: [{ id: 'CONTRATOS_GERENCIAR', rotulo: 'Gerenciar contratos' }] },
  { grupo: 'Atas', permissoes: [{ id: 'ATAS_GERENCIAR', rotulo: 'Gerenciar atas' }] },
  { grupo: 'Estoque', permissoes: [{ id: 'ESTOQUE_GERENCIAR', rotulo: 'Gerenciar estoque' }] },
  { grupo: 'Relatórios', permissoes: [{ id: 'RELATORIOS_VISUALIZAR', rotulo: 'Visualizar relatórios' }] },
  { grupo: 'Solicitações', permissoes: [{ id: 'SOLICITACOES_GERENCIAR', rotulo: 'Gerenciar solicitações' }] },
  { grupo: 'Inventário', permissoes: [{ id: 'INVENTARIO_GERENCIAR', rotulo: 'Gerenciar inventário' }] },
  { grupo: 'Configurações', permissoes: [{ id: 'CONFIGURACOES_GERENCIAR', rotulo: 'Gerenciar configurações' }] },
  { grupo: 'Usuários', permissoes: [{ id: 'USUARIOS_ADMINISTRAR', rotulo: 'Administrar usuários e permissões' }] },
] as const;

export type Permissao = (typeof GRUPOS_PERMISSOES)[number]['permissoes'][number]['id'];

// Só o Operador tem permissões (o backend é quem decide; aqui só se escondem controles). Vale uma das informadas.
export function pode(usuario: Pick<Usuario, 'perfil' | 'permissoes'> | null | undefined, ...permissoes: Permissao[]) {
  return usuario?.perfil === 'OPERADOR' && permissoes.some((p) => usuario.permissoes?.includes(p));
}
