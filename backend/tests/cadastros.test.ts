import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Usuários (RF02)', () => {
  it('lista usuários para o Gestor de Patrimônio', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/usuarios').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
  });

  it('cadastra usuário com matrícula funcional e perfil', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.usuario.create.mockResolvedValue({ id: 'u-novo' } as never);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        nome: 'Nova Servidora',
        email: 'nova@joinville.sc.gov.br',
        matricula: '20001',
        senha: 'senha-forte',
        perfil: 'UNIDADE',
        unidadeId: UUID,
      });
    expect(res.status).toBe(201);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('exige unidade para perfis UNIDADE e GALPAO', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        nome: 'Sem Unidade',
        email: 'sem@joinville.sc.gov.br',
        matricula: '20002',
        senha: 'senha-forte',
        perfil: 'UNIDADE',
      });
    expect(res.status).toBe(422);
  });

  it('rejeita e-mail ou matrícula duplicados', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue({ id: 'existente' } as never);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        nome: 'Duplicada',
        email: 'nova@joinville.sc.gov.br',
        matricula: '20001',
        senha: 'senha-forte',
        perfil: 'GESTOR_PATRIMONIO',
      });
    expect(res.status).toBe(409);
  });

  it('desativa usuário preservando auditoria (LGPD)', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 'u-1', ativo: true } as never);
    prismaMock.unidade.findFirst.mockResolvedValue(null);
    prismaMock.usuario.update.mockResolvedValue({ id: 'u-1', ativo: false } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ativo: false });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia desativação de usuário responsável por unidade', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 'u-1', ativo: true } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ nome: 'UBS Centro' } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ativo: false });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('responsável pela unidade UBS Centro');
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it('bloqueia transferência de unidade de usuário responsável', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'u-1',
      ativo: true,
      unidadeId: 'unidade-1',
    } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ nome: 'UBS Centro' } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ unidadeId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('transferido de unidade');
  });

  it('permite editar nome de usuário responsável (sem mudar unidade/status)', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'u-1',
      ativo: true,
      unidadeId: 'unidade-1',
    } as never);
    prismaMock.usuario.update.mockResolvedValue({ id: 'u-1' } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'Rodrigo S. Silva' });
    expect(res.status).toBe(200);
    expect(prismaMock.unidade.findFirst).not.toHaveBeenCalled();
  });

  it('bloqueia na criação de unidade responsável que já responde por outra', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findUnique.mockResolvedValue({ id: UUID, ativo: true } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ nome: 'UBS Norte' } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'UBS Oeste', tipo: 'UBS', responsavelId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('já é responsável pela unidade UBS Norte');
    expect(prismaMock.unidade.create).not.toHaveBeenCalled();
  });

  it('somente o Gestor de Patrimônio administra usuários', async () => {
    const res = await request(app).get('/usuarios').set(auth('GALPAO', { unidadeId: 'g-1' }));
    expect(res.status).toBe(403);
  });
});

describe('Unidades (RNF12)', () => {
  it('lista unidades ativas para qualquer perfil autenticado', async () => {
    prismaMock.unidade.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get('/unidades')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }));
    expect(res.status).toBe(200);
  });

  it('cadastra nova unidade sem responsável — definido depois (RNF12)', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue(null);
    prismaMock.unidade.create.mockResolvedValue({ id: 'nova' } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'UBS Leste', tipo: 'UBS', emailBase: 'leste@joinville.sc.gov.br' });
    expect(res.status).toBe(201);
  });

  it('na criação, vincula o responsável automaticamente à nova unidade', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: UUID,
      ativo: true,
      unidadeId: 'outra-unidade',
    } as never);
    prismaMock.unidade.create.mockResolvedValue({
      id: 'nova-unidade',
      nome: 'UBS Leste',
      tipo: 'UBS',
      responsavelId: UUID,
    } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'UBS Leste', tipo: 'UBS', responsavelId: UUID });
    expect(res.status).toBe(201);
    // o usuário selecionado passa a pertencer à unidade criada
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UUID },
      data: { unidadeId: 'nova-unidade' },
    });
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita responsável inativo na criação', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findUnique.mockResolvedValue({ id: UUID, ativo: false } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'UBS Leste', tipo: 'UBS', responsavelId: UUID });
    expect(res.status).toBe(422);
    expect(prismaMock.unidade.create).not.toHaveBeenCalled();
  });

  it('define responsável vinculado à própria unidade na edição', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: UUID,
      ativo: true,
      unidadeId: 'unidade-1',
    } as never);
    prismaMock.unidade.update.mockResolvedValue({ id: 'unidade-1' } as never);
    const res = await request(app)
      .patch('/unidades/unidade-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ responsavelId: UUID });
    expect(res.status).toBe(200);
  });

  it('rejeita responsável de outra unidade', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: UUID,
      ativo: true,
      unidadeId: 'outra-unidade',
    } as never);
    const res = await request(app)
      .patch('/unidades/unidade-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ responsavelId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('vinculado a esta unidade');
  });

  it('rejeita responsável inexistente ou inativo', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: UUID,
      ativo: false,
      unidadeId: 'unidade-1',
    } as never);
    const res = await request(app)
      .patch('/unidades/unidade-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ responsavelId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('usuário ativo');
  });

  it('rejeita nome duplicado', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'existente' } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'UBS Leste', tipo: 'UBS' });
    expect(res.status).toBe(409);
  });

  it('atualiza unidade com auditoria', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'u-1', nome: 'UBS Leste' } as never);
    prismaMock.unidade.update.mockResolvedValue({ id: 'u-1' } as never);
    const res = await request(app)
      .patch('/unidades/u-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ responsavel: 'Novo Responsável' });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });
});

describe('Categorias e tipos (taxonomia e-Pública)', () => {
  it('lista categorias com tipos', async () => {
    prismaMock.categoria.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get('/categorias')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }));
    expect(res.status).toBe(200);
  });

  it('lista tipos de equipamento', async () => {
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get('/categorias/tipos')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
  });

  it('cadastra categoria e tipo', async () => {
    prismaMock.categoria.findUnique.mockResolvedValue(null);
    prismaMock.categoria.create.mockResolvedValue({ id: 'cat-1' } as never);
    let res = await request(app)
      .post('/categorias')
      .set(auth('GALPAO', { unidadeId: 'g-1' }))
      .send({ nome: 'Imagem' });
    expect(res.status).toBe(201);

    prismaMock.tipoEquipamento.findUnique.mockResolvedValue(null);
    prismaMock.tipoEquipamento.create.mockResolvedValue({ id: 'tipo-1' } as never);
    res = await request(app)
      .post('/categorias/tipos')
      .set(auth('GALPAO', { unidadeId: 'g-1' }))
      .send({ codigo: 'RX-01', nome: 'Raio-X Portátil', categoriaId: UUID });
    expect(res.status).toBe(201);
  });
});

describe('Contratos de terceirizadas', () => {
  it('cadastra contrato com número, tipo e status', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue(null);
    prismaMock.contrato.create.mockResolvedValue({ id: 'c-1' } as never);
    const res = await request(app)
      .post('/contratos')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({
        numero: 'CONT-2026-010',
        empresa: 'TecSaúde Ltda.',
        cnpj: '12345678000190',
        tipo: 'Manutenção Preventiva',
        objeto: 'Manutenção de equipamentos',
        valorTotal: 45000,
        condicoesPagamento: 'Mensal',
        vigenciaInicio: '2026-01-01',
        vigenciaFim: '2026-12-31',
      });
    expect(res.status).toBe(201);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita número de contrato duplicado', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({ id: 'c-1' } as never);
    const res = await request(app)
      .post('/contratos')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({
        numero: 'CONT-2026-010',
        empresa: 'Duplicada',
        tipo: 'Calibração',
        objeto: 'Manutenção',
        vigenciaInicio: '2026-01-01',
        vigenciaFim: '2026-12-31',
      });
    expect(res.status).toBe(409);
  });

  it('bloqueia exclusão de contrato com manutenções vinculadas', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      _count: { manutencoes: 3 },
    } as never);
    const res = await request(app)
      .delete('/contratos/c-1')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
  });

  it('exclui contrato sem vínculos', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      empresa: 'TecSaúde',
      _count: { manutencoes: 0 },
    } as never);
    const res = await request(app)
      .delete('/contratos/c-1')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(204);
    expect(prismaMock.contrato.delete).toHaveBeenCalled();
  });

  it('lista contratos para os gestores', async () => {
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/contratos').set(auth('GESTOR_MANUTENCAO'));
    expect(res.status).toBe(200);
  });

  it('unidade não acessa contratos', async () => {
    const res = await request(app)
      .get('/contratos')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }));
    expect(res.status).toBe(403);
  });
});

describe('Exclusões e edições das Configurações do Sistema', () => {
  it('bloqueia exclusão de unidade com vínculos', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({
      id: 'u-1',
      nome: 'UBS Centro',
      _count: { equipamentos: 3, usuarios: 1, solicitacoesOrigem: 0, manutencoes: 0 },
    } as never);
    const res = await request(app).delete('/unidades/u-1').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
    expect(prismaMock.unidade.delete).not.toHaveBeenCalled();
  });

  it('exclui unidade sem vínculos com auditoria', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({
      id: 'u-1',
      nome: 'UBS Nova',
      tipo: 'UBS',
      _count: { equipamentos: 0, usuarios: 0, solicitacoesOrigem: 0, manutencoes: 0 },
    } as never);
    const res = await request(app).delete('/unidades/u-1').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(204);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('edita categoria com cor de identificação', async () => {
    prismaMock.categoria.findUnique.mockResolvedValueOnce({ id: 'cat-1', nome: 'Esterilização' } as never);
    prismaMock.categoria.update.mockResolvedValue({ id: 'cat-1' } as never);
    const res = await request(app)
      .patch('/categorias/cat-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ descricao: 'Equipamentos de esterilização', cor: '#0d4f7e' });
    expect(res.status).toBe(200);
  });

  it('rejeita cor fora do formato #rrggbb', async () => {
    const res = await request(app)
      .post('/categorias')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ nome: 'Imagem', cor: 'azul' });
    expect(res.status).toBe(422);
  });

  it('bloqueia exclusão de categoria com tipos vinculados', async () => {
    prismaMock.categoria.findUnique.mockResolvedValue({
      id: 'cat-1',
      nome: 'Esterilização',
      _count: { tipos: 4 },
    } as never);
    const res = await request(app).delete('/categorias/cat-1').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
  });

  it('exclui tipo de equipamento sem vínculos', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({
      id: 'tipo-1',
      codigo: 'RX-01',
      nome: 'Raio-X',
      _count: { equipamentos: 0, solicitacoes: 0 },
    } as never);
    const res = await request(app).delete('/categorias/tipos/tipo-1').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(204);
    expect(prismaMock.estoqueGalpao.deleteMany).toHaveBeenCalled();
  });

  it('bloqueia exclusão de tipo com equipamentos', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({
      id: 'tipo-1',
      codigo: 'AUT-V21',
      nome: 'Autoclave',
      _count: { equipamentos: 12, solicitacoes: 0 },
    } as never);
    const res = await request(app).delete('/categorias/tipos/tipo-1').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
  });

  it('edita tipo de equipamento', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValueOnce({
      id: 'tipo-1',
      codigo: 'AUT-V21',
    } as never);
    prismaMock.tipoEquipamento.update.mockResolvedValue({ id: 'tipo-1' } as never);
    const res = await request(app)
      .patch('/categorias/tipos/tipo-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ descricao: 'Autoclave de pequeno porte' });
    expect(res.status).toBe(200);
  });

  it('cadastra ata com fornecedor e unidade específica', async () => {
    prismaMock.ata.findUnique.mockResolvedValue(null);
    prismaMock.ata.create.mockResolvedValue({ id: 'ata-nova' } as never);
    const res = await request(app)
      .post('/atas')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numero: '070/2026',
        fornecedor: 'MedSupply',
        descricao: 'Ata específica',
        valorTotal: 90000,
        vencimento: '2027-01-01',
        unidadeEspecificaId: UUID,
      });
    expect(res.status).toBe(201);
    expect(prismaMock.ata.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fornecedor: 'MedSupply', unidadeEspecificaId: UUID }),
      }),
    );
  });
});

describe('Fluxos complementares de solicitação (UC11/UC12, recolha)', () => {
  const cessaoAprovada = {
    id: 'sol-1',
    tipo: 'CESSAO_USO',
    status: 'AGUARDANDO_SAIDA',
    unidadeOrigemId: 'unidade-1',
    unidadeDestinoId: 'unidade-2',
    equipamentoId: 'eq-1',
    justificativa: 'x',
    dataRetornoPrevista: null,
    unidadeOrigem: { id: 'unidade-1', nome: 'UBS Sul', emailBase: 'sul@jlle.gov' },
    unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
    equipamento: { id: 'eq-1', tombamento: '12348/2023', descricao: 'Autoclave', status: 'ATIVO' },
    tipoEquipamento: null,
    ata: null,
    criadoPor: null,
    decididoPor: null,
  };

  it('aprova cessão de uso: AGUARDANDO_SAIDA (UC11)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...cessaoAprovada,
      status: 'PENDENTE_APROVACAO',
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue(cessaoAprovada as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_SAIDA');
  });

  it('origem confirma a saída da cessão (RF22)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(cessaoAprovada as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...cessaoAprovada,
      status: 'AGUARDANDO_RECEBIMENTO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-saida')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_RECEBIMENTO');
  });

  it('outra unidade não confirma a saída', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(cessaoAprovada as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-saida')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }));
    expect(res.status).toBe(403);
  });

  it('recolha aprovada é concluída pelo galpão', async () => {
    const recolha = {
      ...cessaoAprovada,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: null,
      unidadeDestino: null,
    };
    prismaMock.solicitacao.findUnique.mockResolvedValue(recolha as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ id: 'galpao-1', tipo: 'GALPAO' } as never);
    prismaMock.solicitacao.update.mockResolvedValue({ ...recolha, status: 'CONCLUIDA' } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recolha')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unidadeId: 'galpao-1' } }),
    );
    expect(prismaMock.movimentacao.create).toHaveBeenCalled();
  });

  it('lista solicitações filtrando por unidade do usuário', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ unidadeOrigemId: 'unidade-1' }, { unidadeDestinoId: 'unidade-1' }],
        }),
      }),
    );
  });

  it('lista manutenções com filtro de status', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get('/manutencoes?status=PENDENTE_APROVACAO')
      .set(auth('GESTOR_MANUTENCAO'));
    expect(res.status).toBe(200);
  });
});
