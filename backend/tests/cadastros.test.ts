import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Usuários (RF02)', () => {
  it('lista usuários para o Gestor de Patrimônio', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/usuarios').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
  });

  it('cadastra usuário com matrícula funcional e perfil', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.usuario.create.mockResolvedValue({ id: 'u-novo' } as never);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('OPERADOR'))
      .send({
        nome: 'Nova Servidora',
        email: 'nova@joinville.sc.gov.br',
        matricula: '20001',
        perfil: 'UNIDADE',
        unidadeId: UUID,
      });
    expect(res.status).toBe(201);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('cadastro prévio só com e-mail e perfil: nome e matrícula provisórios saem do e-mail', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.usuario.create.mockResolvedValue({ id: 'u-novo' } as never);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('OPERADOR'))
      .send({ email: 'ana.paula@joinville.sc.gov.br', perfil: 'OPERADOR' });
    expect(res.status).toBe(201);
    expect(prismaMock.usuario.create.mock.calls[0][0].data).toMatchObject({
      nome: 'ana.paula',
      matricula: 'ana.paula@joinville.sc.gov.br',
      perfil: 'OPERADOR',
    });
    expect(prismaMock.usuario.create.mock.calls[0][0].data).not.toHaveProperty('senhaHash');
  });

  it('exige unidade para perfis UNIDADE e GALPAO', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('OPERADOR'))
      .send({
        nome: 'Sem Unidade',
        email: 'sem@joinville.sc.gov.br',
        matricula: '20002',
        perfil: 'UNIDADE',
      });
    expect(res.status).toBe(422);
  });

  it('usuário terceirizado exige um prestador existente; os demais perfis não podem ter prestador', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    const base = { nome: 'Técnico Tecnomed', email: 'tec@tecnomed.com.br', matricula: '30001', senha: 'senha-forte' };
    const enviar = (corpo: Record<string, unknown>) =>
      request(app).post('/usuarios').set(auth('OPERADOR')).send({ ...base, ...corpo });

    expect((await enviar({ perfil: 'TERCEIRIZADA' })).status).toBe(422);
    prismaMock.prestadorServico.findUnique.mockResolvedValueOnce(null);
    expect((await enviar({ perfil: 'TERCEIRIZADA', prestadorId: UUID })).status).toBe(422);
    expect((await enviar({ perfil: 'OPERADOR', prestadorId: UUID })).status).toBe(422);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();

    prismaMock.prestadorServico.findUnique.mockResolvedValueOnce({ id: UUID } as never);
    prismaMock.usuario.create.mockResolvedValue({ id: 'u-t' } as never);
    expect((await enviar({ perfil: 'TERCEIRIZADA', prestadorId: UUID })).status).toBe(201);
    expect(prismaMock.usuario.create.mock.calls[0][0].data).toMatchObject({ perfil: 'TERCEIRIZADA', prestadorId: UUID });
  });

  it('ao trocar um terceirizado para outro perfil, o vínculo com o prestador é removido', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'u-1',
      perfil: 'TERCEIRIZADA',
      ativo: true,
      unidadeId: null,
      prestadorId: UUID,
    } as never);
    prismaMock.unidade.findFirst.mockResolvedValue(null);
    prismaMock.usuario.update.mockResolvedValue({ id: 'u-1' } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('OPERADOR'))
      .send({ perfil: 'OPERADOR' });
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update.mock.calls[0][0].data).toMatchObject({ prestadorId: null });
  });

  it('rejeita e-mail ou matrícula duplicados', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue({ id: 'existente' } as never);
    const res = await request(app)
      .post('/usuarios')
      .set(auth('OPERADOR'))
      .send({
        nome: 'Duplicada',
        email: 'nova@joinville.sc.gov.br',
        matricula: '20001',
        perfil: 'OPERADOR',
      });
    expect(res.status).toBe(409);
  });

  it('desativa usuário preservando auditoria (LGPD)', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 'u-1', ativo: true } as never);
    prismaMock.unidade.findFirst.mockResolvedValue(null);
    prismaMock.usuario.update.mockResolvedValue({ id: 'u-1', ativo: false } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('OPERADOR'))
      .send({ ativo: false });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia desativação de usuário responsável por unidade', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: 'u-1', ativo: true } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ nome: 'UBS Centro' } as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
      .send({ nome: 'UBS Oeste', tipo: 'UBSF', responsavelId: UUID });
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
      .set(auth('OPERADOR'))
      .send({ nome: 'UBS Leste', tipo: 'UBSF', emailBase: 'leste@joinville.sc.gov.br' });
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
      tipo: 'UBSF',
      responsavelId: UUID,
    } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('OPERADOR'))
      .send({ nome: 'UBS Leste', tipo: 'UBSF', responsavelId: UUID });
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
      .set(auth('OPERADOR'))
      .send({ nome: 'UBS Leste', tipo: 'UBSF', responsavelId: UUID });
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
      .send({ responsavelId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('usuário ativo');
  });

  it('rejeita nome duplicado', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'existente' } as never);
    const res = await request(app)
      .post('/unidades')
      .set(auth('OPERADOR'))
      .send({ nome: 'UBS Leste', tipo: 'UBSF' });
    expect(res.status).toBe(409);
  });

  it('atualiza unidade com auditoria', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'u-1', nome: 'UBS Leste' } as never);
    prismaMock.unidade.update.mockResolvedValue({ id: 'u-1' } as never);
    const res = await request(app)
      .patch('/unidades/u-1')
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'));
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

  it('cadastra tipo de equipamento com preço de referência (feedback 21/08)', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue(null);
    prismaMock.tipoEquipamento.create.mockResolvedValue({ id: 'tipo-2', preco: 4500.5 } as never);
    const res = await request(app)
      .post('/categorias/tipos')
      .set(auth('OPERADOR'))
      .send({ codigo: 'RX-02', nome: 'Raio-X Fixo', categoriaId: UUID, preco: 4500.5 });
    expect(res.status).toBe(201);
    expect(prismaMock.tipoEquipamento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preco: 4500.5 }) }),
    );
  });

  it('rejeita preço negativo ou zero no tipo de equipamento', async () => {
    const res = await request(app)
      .post('/categorias/tipos')
      .set(auth('OPERADOR'))
      .send({ codigo: 'RX-03', nome: 'Raio-X', categoriaId: UUID, preco: -10 });
    expect(res.status).toBe(422);
    expect(prismaMock.tipoEquipamento.create).not.toHaveBeenCalled();
  });
});

describe('Prestadores de serviço', () => {
  it('Gestor de Patrimônio cadastra prestador e a ação é auditada', async () => {
    prismaMock.prestadorServico.findUnique.mockResolvedValue(null);
    prismaMock.prestadorServico.create.mockResolvedValue({ id: 'p-1', nome: 'TecSaúde' } as never);
    const res = await request(app)
      .post('/prestadores')
      .set(auth('OPERADOR'))
      .send({ nome: 'TecSaúde', cnpj: '12345678000190', email: 'contato@tecsaude.com.br' });
    expect(res.status).toBe(201);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita nome duplicado e e-mail inválido', async () => {
    prismaMock.prestadorServico.findUnique.mockResolvedValue({ id: 'p-9' } as never);
    const duplicado = await request(app).post('/prestadores').set(auth('OPERADOR')).send({ nome: 'TecSaúde' });
    expect(duplicado.status).toBe(409);
    const email = await request(app)
      .post('/prestadores')
      .set(auth('OPERADOR'))
      .send({ nome: 'Outra', email: 'invalido' });
    expect(email.status).toBe(422);
  });

  it('Administrador lista; Unidade e Galpão não acessam', async () => {
    prismaMock.prestadorServico.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/prestadores').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).get('/prestadores').set(auth('UNIDADE', { unidadeId: 'u-1' }))).status).toBe(403);
    expect((await request(app).post('/prestadores').set(auth('GALPAO', { unidadeId: 'g-1' })).send({ nome: 'X Ltda' })).status).toBe(403);
  });

  it('bloqueia exclusão de prestador com contratos', async () => {
    prismaMock.prestadorServico.findUnique.mockResolvedValue({ id: 'p-1', nome: 'TecSaúde', _count: { contratos: 2 } } as never);
    const res = await request(app).delete('/prestadores/p-1').set(auth('OPERADOR'));
    expect(res.status).toBe(422);
    expect(prismaMock.prestadorServico.delete).not.toHaveBeenCalled();
  });

  it('exclui prestador sem contratos', async () => {
    prismaMock.prestadorServico.findUnique.mockResolvedValue({ id: 'p-1', nome: 'TecSaúde', _count: { contratos: 0 } } as never);
    const res = await request(app).delete('/prestadores/p-1').set(auth('OPERADOR'));
    expect(res.status).toBe(204);
  });
});

describe('Serviços de contrato', () => {
  it('cadastra serviço, rejeita nome repetido e bloqueia exclusão em uso', async () => {
    prismaMock.servicoContrato.findUnique.mockResolvedValueOnce(null);
    prismaMock.servicoContrato.create.mockResolvedValue({ id: 's-1', nome: 'Manutenção' } as never);
    const ok = await request(app)
      .post('/servicos-contrato')
      .set(auth('OPERADOR'))
      .send({ nome: 'Serviço de manutenção preventiva e corretiva' });
    expect(ok.status).toBe(201);

    prismaMock.servicoContrato.findUnique.mockResolvedValueOnce({ id: 's-9' } as never);
    const dup = await request(app).post('/servicos-contrato').set(auth('OPERADOR')).send({ nome: 'Repetido' });
    expect(dup.status).toBe(409);

    prismaMock.servicoContrato.findUnique.mockResolvedValueOnce({ id: 's-1', nome: 'X', _count: { itens: 1 } } as never);
    const emUso = await request(app).delete('/servicos-contrato/s-1').set(auth('OPERADOR'));
    expect(emUso.status).toBe(422);
  });

  it('só o Administrador acessa', async () => {
    prismaMock.servicoContrato.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/servicos-contrato').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).post('/servicos-contrato').set(auth('UNIDADE', { unidadeId: 'u-1' })).send({ nome: 'Novo' })).status).toBe(403);
  });
});

describe('Regras de manutenção nos cadastros', () => {
  const CAT = '77777777-7777-4777-8777-777777777777';
  it('tipo de item grava os tipos de manutenção aceitos', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue(null);
    prismaMock.tipoEquipamento.create.mockResolvedValue({ id: 't-1' } as never);
    const res = await request(app)
      .post('/categorias/tipos')
      .set(auth('OPERADOR'))
      .send({ codigo: 'RX-9', nome: 'Raio-X', categoriaId: CAT, permitePreventiva: false, permiteCorretiva: true });
    expect(res.status).toBe(201);
    expect(prismaMock.tipoEquipamento.create.mock.calls[0][0].data).toMatchObject({
      permitePreventiva: false,
      permiteCorretiva: true,
    });
  });

  it('tipo de item pode não permitir nenhuma manutenção', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({ id: 't-1', codigo: 'RX', permitePreventiva: true, permiteCorretiva: false } as never);
    prismaMock.tipoEquipamento.update.mockResolvedValue({ id: 't-1' } as never);
    const res = await request(app)
      .patch('/categorias/tipos/t-1')
      .set(auth('OPERADOR'))
      .send({ permitePreventiva: false });
    expect(res.status).toBe(200);
    expect(prismaMock.tipoEquipamento.update.mock.calls[0][0].data).toMatchObject({ permitePreventiva: false });
  });

  it('escopo precisa cobrir ao menos um tipo de manutenção', async () => {
    const res = await request(app)
      .post('/escopos-servico')
      .set(auth('OPERADOR'))
      .send({ nome: 'Nenhuma', cobrePreventiva: false, cobreCorretiva: false });
    expect(res.status).toBe(422);
  });
});

describe('Escopos de serviço', () => {
  it('cadastra escopo, rejeita nome repetido e bloqueia exclusão em uso', async () => {
    prismaMock.escopoServico.findUnique.mockResolvedValueOnce(null);
    prismaMock.escopoServico.create.mockResolvedValue({ id: 'e-1', nome: 'Preventiva' } as never);
    const ok = await request(app).post('/escopos-servico').set(auth('OPERADOR')).send({ nome: 'Preventiva' });
    expect(ok.status).toBe(201);

    prismaMock.escopoServico.findUnique.mockResolvedValueOnce({ id: 'e-9' } as never);
    const dup = await request(app).post('/escopos-servico').set(auth('OPERADOR')).send({ nome: 'Preventiva' });
    expect(dup.status).toBe(409);

    prismaMock.escopoServico.findUnique.mockResolvedValueOnce({ id: 'e-1', nome: 'X', _count: { itens: 2 } } as never);
    const emUso = await request(app).delete('/escopos-servico/e-1').set(auth('OPERADOR'));
    expect(emUso.status).toBe(422);
  });

  it('só o Administrador acessa', async () => {
    prismaMock.escopoServico.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/escopos-servico').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).post('/escopos-servico').set(auth('UNIDADE', { unidadeId: 'u-1' })).send({ nome: 'Novo' })).status).toBe(403);
  });
});

describe('Contratos de terceirizadas', () => {
  const PREST = '33333333-3333-4333-8333-333333333333';
  const S1 = '11111111-1111-4111-8111-111111111111';
  const S2 = '22222222-2222-4222-8222-222222222222';
  const E1 = '44444444-4444-4444-8444-444444444444';
  const E2 = '55555555-5555-4555-8555-555555555555';
  const base = {
    numero: 'CONT-2026-010',
    prestadorId: PREST,
    objeto: 'Manutenção de equipamentos',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2026-12-31',
  };
  const itens = [
    { servicoId: S1, valor: 10000.1, escopoId: E1 },
    { servicoId: S2, valor: 20000.2, escopoId: E2 },
  ];

  function referenciasValidas() {
    prismaMock.prestadorServico.findUnique.mockResolvedValue({ id: PREST } as never);
    prismaMock.servicoContrato.count.mockResolvedValue(2 as never);
    prismaMock.escopoServico.count.mockResolvedValue(2 as never);
  }

  it('cadastra contrato com itens e calcula o valor total pela soma', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue(null);
    referenciasValidas();
    prismaMock.contrato.create.mockResolvedValue({ id: 'c-1', itens: [] } as never);
    const res = await request(app)
      .post('/contratos')
      .set(auth('OPERADOR'))
      .send({ ...base, valorTotal: 1, itens });
    expect(res.status).toBe(201);
    const data = prismaMock.contrato.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.valorTotal).toBe(30000.3);
    for (const removido of ['tipo', 'tipoManutencao', 'condicoesPagamento', 'observacoes', 'empresa', 'cnpj']) {
      expect(data).not.toHaveProperty(removido);
    }
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('exige ao menos um item', async () => {
    const res = await request(app).post('/contratos').set(auth('OPERADOR')).send({ ...base, itens: [] });
    expect(res.status).toBe(422);
    expect(prismaMock.contrato.create).not.toHaveBeenCalled();
  });

  it('rejeita serviço repetido, valor negativo e escopo inválido', async () => {
    const enviar = (lista: unknown[]) =>
      request(app).post('/contratos').set(auth('OPERADOR')).send({ ...base, itens: lista });
    expect((await enviar([itens[0], itens[0]])).status).toBe(422);
    expect((await enviar([{ ...itens[0], valor: -1 }])).status).toBe(422);
    expect((await enviar([{ ...itens[0], escopoId: 'nao-e-uuid' }])).status).toBe(422);
    expect(prismaMock.contrato.create).not.toHaveBeenCalled();
  });

  it('rejeita prestador, serviço ou escopo inexistente', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue(null);
    prismaMock.prestadorServico.findUnique.mockResolvedValue(null);
    const semPrestador = await request(app).post('/contratos').set(auth('OPERADOR')).send({ ...base, itens });
    expect(semPrestador.status).toBe(422);
    prismaMock.prestadorServico.findUnique.mockResolvedValue({ id: PREST } as never);
    prismaMock.servicoContrato.count.mockResolvedValue(1 as never);
    const semServico = await request(app).post('/contratos').set(auth('OPERADOR')).send({ ...base, itens });
    expect(semServico.status).toBe(422);
    prismaMock.servicoContrato.count.mockResolvedValue(2 as never);
    prismaMock.escopoServico.count.mockResolvedValue(1 as never);
    const semEscopo = await request(app).post('/contratos').set(auth('OPERADOR')).send({ ...base, itens });
    expect(semEscopo.status).toBe(422);
    expect(prismaMock.contrato.create).not.toHaveBeenCalled();
  });

  it('rejeita número de contrato duplicado', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({ id: 'c-1' } as never);
    const res = await request(app)
      .post('/contratos')
      .set(auth('OPERADOR'))
      .send({ ...base, itens });
    expect(res.status).toBe(409);
  });

  it('grava o desconto SINAPI por item e recusa percentual fora de 0 a 100', async () => {
    referenciasValidas();
    prismaMock.contrato.findUnique.mockResolvedValue(null as never);
    prismaMock.contrato.create.mockResolvedValue({ id: 'c-1', numero: base.numero, itens: [] } as never);
    const ok = await request(app)
      .post('/contratos')
      .set(auth('OPERADOR'))
      .send({ ...base, itens: itens.map((i) => ({ ...i, descontoPercentual: 12.5 })) });
    expect(ok.status).toBe(201);
    expect(prismaMock.contrato.create.mock.calls[0][0].data.itens).toEqual({
      create: expect.arrayContaining([expect.objectContaining({ descontoPercentual: 12.5 })]),
    });
    for (const descontoPercentual of [-1, 100.5]) {
      const res = await request(app)
        .post('/contratos')
        .set(auth('OPERADOR'))
        .send({ ...base, itens: itens.map((i) => ({ ...i, descontoPercentual })) });
      expect(res.status).toBe(422);
    }
  });

  it('edita itens no lugar: atualiza o mantido, cria o novo e remove o que saiu', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      status: 'ATIVO',
      valorTotal: 1,
      itens: [
        { id: 'it-1', servicoId: S1 },
        { id: 'it-3', servicoId: '99999999-9999-4999-8999-999999999999' },
      ],
    } as never);
    referenciasValidas();
    prismaMock.manutencao.count.mockResolvedValue(0 as never);
    prismaMock.contrato.update.mockResolvedValue({ id: 'c-1', itens: [] } as never);
    const res = await request(app).patch('/contratos/c-1').set(auth('OPERADOR')).send({ itens });
    expect(res.status).toBe(200);
    expect(prismaMock.contratoItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['it-3'] } } });
    expect(prismaMock.contratoItem.update).toHaveBeenCalledWith({
      where: { id: 'it-1' },
      data: { valor: 10000.1, escopoId: E1, descontoPercentual: 0 },
    });
    expect(prismaMock.contratoItem.create).toHaveBeenCalledTimes(1);
    // os itens mantidos são travados antes de conferir o saldo comprometido
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.contrato.update.mock.calls[0][0].data).toMatchObject({ valorTotal: 30000.3 });
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('não altera o desconto SINAPI enquanto houver chamado em andamento no item', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      status: 'ATIVO',
      valorTotal: 1,
      itens: [{ id: 'it-1', servicoId: S1, escopoId: E1, descontoPercentual: 0 }],
    } as never);
    referenciasValidas();
    prismaMock.manutencao.count.mockResolvedValue(1 as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    const res = await request(app)
      .patch('/contratos/c-1')
      .set(auth('OPERADOR'))
      .send({ itens: itens.map((i) => ({ ...i, descontoPercentual: 15 })) });
    expect(res.status).toBe(422);
    expect(prismaMock.contratoItem.update).not.toHaveBeenCalled();
  });

  it('não permite baixar o valor de um item abaixo do já comprometido por manutenções', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      status: 'ATIVO',
      itens: [{ id: 'it-1', servicoId: S1 }],
    } as never);
    referenciasValidas();
    prismaMock.manutencao.count.mockResolvedValue(0 as never);
    prismaMock.$queryRaw.mockResolvedValue([{ item: 'it-1', total: 12000 }] as never);
    const res = await request(app).patch('/contratos/c-1').set(auth('OPERADOR')).send({ itens });
    expect(res.status).toBe(422);
    expect(prismaMock.contratoItem.update).not.toHaveBeenCalled();
    expect(prismaMock.contrato.update).not.toHaveBeenCalled();
  });

  it('não troca o prestador nem o escopo quando já há manutenção vinculada', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      prestadorId: PREST,
      status: 'ATIVO',
      itens: [{ id: 'it-1', servicoId: S1, escopoId: E1 }],
    } as never);
    prismaMock.manutencao.count.mockResolvedValue(1 as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    const prestador = await request(app)
      .patch('/contratos/c-1')
      .set(auth('OPERADOR'))
      .send({ prestadorId: '88888888-8888-4888-8888-888888888888' });
    expect(prestador.status).toBe(422);
    expect(prismaMock.contrato.update).not.toHaveBeenCalled();

    referenciasValidas();
    const escopo = await request(app)
      .patch('/contratos/c-1')
      .set(auth('OPERADOR'))
      .send({ itens: [{ servicoId: S1, valor: 10000.1, escopoId: E2 }] });
    expect(escopo.status).toBe(422);
    expect(prismaMock.contratoItem.update).not.toHaveBeenCalled();
  });

  it('não remove item vinculado a manutenção', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      status: 'ATIVO',
      itens: [{ id: 'it-3', servicoId: '99999999-9999-4999-8999-999999999999' }],
    } as never);
    referenciasValidas();
    prismaMock.manutencao.count.mockResolvedValue(1 as never);
    const res = await request(app).patch('/contratos/c-1').set(auth('OPERADOR')).send({ itens });
    expect(res.status).toBe(422);
    expect(prismaMock.contratoItem.deleteMany).not.toHaveBeenCalled();
  });

  it('não permite esvaziar os itens de um contrato que já os tem', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      itens: [{ servicoId: S1 }],
    } as never);
    const res = await request(app).patch('/contratos/c-1').set(auth('OPERADOR')).send({ itens: [] });
    expect(res.status).toBe(422);
    expect(prismaMock.contrato.update).not.toHaveBeenCalled();
  });

  it('contrato antigo sem itens mantém o valor total ao mudar só o status', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2024-045',
      status: 'ATIVO',
      valorTotal: 18500,
      itens: [],
    } as never);
    prismaMock.contrato.update.mockResolvedValue({ id: 'c-1', itens: [] } as never);
    const res = await request(app)
      .patch('/contratos/c-1')
      .set(auth('OPERADOR'))
      .send({ status: 'EXPIRADO', itens: [] });
    expect(res.status).toBe(200);
    expect(prismaMock.contratoItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.contrato.update.mock.calls[0][0].data).not.toHaveProperty('valorTotal');
  });

  it('bloqueia exclusão de contrato com manutenções vinculadas', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      _count: { manutencoes: 3 },
    } as never);
    const res = await request(app)
      .delete('/contratos/c-1')
      .set(auth('OPERADOR'));
    expect(res.status).toBe(422);
  });

  it('exclui contrato sem vínculos', async () => {
    prismaMock.contrato.findUnique.mockResolvedValue({
      id: 'c-1',
      numero: 'CONT-2026-010',
      prestadorId: 'p-1',
      _count: { manutencoes: 0 },
    } as never);
    const res = await request(app)
      .delete('/contratos/c-1')
      .set(auth('OPERADOR'));
    expect(res.status).toBe(204);
    expect(prismaMock.contrato.delete).toHaveBeenCalled();
  });

  it('lista contratos para os gestores', async () => {
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/contratos').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
  });

  it('terceirizada consulta só os contratos do próprio prestador e não altera nada', async () => {
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    const lista = await request(app).get('/contratos').set(auth('TERCEIRIZADA', { prestadorId: 'prest-1' }));
    expect(lista.status).toBe(200);
    expect(prismaMock.contrato.findMany.mock.calls[0][0]?.where).toMatchObject({ prestadorId: 'prest-1' });
    const comBusca = await request(app).get('/contratos?busca=CONT').set(auth('TERCEIRIZADA', { prestadorId: 'prest-1' }));
    expect(comBusca.status).toBe(200);
    expect(prismaMock.contrato.findMany.mock.calls[1][0]?.where).toMatchObject({
      prestadorId: 'prest-1',
      numero: { contains: 'CONT' },
    });
    const t = auth('TERCEIRIZADA', { prestadorId: 'prest-1' });
    expect((await request(app).post('/contratos').set(t).send({})).status).toBe(403);
    expect((await request(app).patch('/contratos/c-1').set(t).send({ status: 'EXPIRADO' })).status).toBe(403);
    expect((await request(app).delete('/contratos/c-1').set(t)).status).toBe(403);
    expect((await request(app).get('/prestadores').set(t)).status).toBe(403);
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
    const res = await request(app).delete('/unidades/u-1').set(auth('OPERADOR'));
    expect(res.status).toBe(422);
    expect(prismaMock.unidade.delete).not.toHaveBeenCalled();
  });

  it('exclui unidade sem vínculos com auditoria', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({
      id: 'u-1',
      nome: 'UBS Nova',
      tipo: 'UBSF',
      _count: { equipamentos: 0, usuarios: 0, solicitacoesOrigem: 0, manutencoes: 0 },
    } as never);
    const res = await request(app).delete('/unidades/u-1').set(auth('OPERADOR'));
    expect(res.status).toBe(204);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('edita categoria com cor de identificação', async () => {
    prismaMock.categoria.findUnique.mockResolvedValueOnce({ id: 'cat-1', nome: 'Esterilização' } as never);
    prismaMock.categoria.update.mockResolvedValue({ id: 'cat-1' } as never);
    const res = await request(app)
      .patch('/categorias/cat-1')
      .set(auth('OPERADOR'))
      .send({ descricao: 'Equipamentos de esterilização', cor: '#0d4f7e' });
    expect(res.status).toBe(200);
  });

  it('rejeita cor fora do formato #rrggbb', async () => {
    const res = await request(app)
      .post('/categorias')
      .set(auth('OPERADOR'))
      .send({ nome: 'Imagem', cor: 'azul' });
    expect(res.status).toBe(422);
  });

  it('bloqueia exclusão de categoria com tipos vinculados', async () => {
    prismaMock.categoria.findUnique.mockResolvedValue({
      id: 'cat-1',
      nome: 'Esterilização',
      _count: { tipos: 4 },
    } as never);
    const res = await request(app).delete('/categorias/cat-1').set(auth('OPERADOR'));
    expect(res.status).toBe(422);
  });

  it('exclui tipo de equipamento sem vínculos', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({
      id: 'tipo-1',
      codigo: 'RX-01',
      nome: 'Raio-X',
      _count: { equipamentos: 0, solicitacoes: 0 },
    } as never);
    const res = await request(app).delete('/categorias/tipos/tipo-1').set(auth('OPERADOR'));
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
    const res = await request(app).delete('/categorias/tipos/tipo-1').set(auth('OPERADOR'));
    expect(res.status).toBe(422);
  });

  it('edita tipo de equipamento', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValueOnce({
      id: 'tipo-1',
      codigo: 'AUT-V21',
      permitePreventiva: true,
      permiteCorretiva: true,
    } as never);
    prismaMock.tipoEquipamento.update.mockResolvedValue({ id: 'tipo-1' } as never);
    const res = await request(app)
      .patch('/categorias/tipos/tipo-1')
      .set(auth('OPERADOR'))
      .send({ descricao: 'Autoclave de pequeno porte' });
    expect(res.status).toBe(200);
  });

  it('cadastra ata com fornecedor e unidade específica', async () => {
    prismaMock.ata.findUnique.mockResolvedValue(null);
    prismaMock.ata.create.mockResolvedValue({ id: 'ata-nova' } as never);
    const res = await request(app)
      .post('/atas')
      .set(auth('OPERADOR'))
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
    status: 'RESERVADO',
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

  it('aprova empréstimo: AGUARDANDO_SAIDA (UC11)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...cessaoAprovada,
      tipo: 'EMPRESTIMO',
      status: 'PENDENTE_APROVACAO',
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...cessaoAprovada,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_SAIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('OPERADOR'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_SAIDA');
  });

  it('cessão de uso não passa mais por aprovação — só o Gestor abre, já nasce RESERVADO (estoque já reservado na criação)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...cessaoAprovada,
      status: 'RESERVADO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('OPERADOR'))
      .send({});
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });

  it('Gestor marca cessão de uso reservada como lançada no Branet: conclui direto, sem gerar tombamento (RF22)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(cessaoAprovada as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...cessaoAprovada,
      status: 'CONCLUIDA',
      numeroPedidoBranet: '12345',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('OPERADOR'))
      .send({ numeroPedidoBranet: '12345' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONCLUIDA');
    expect(prismaMock.equipamento.create).not.toHaveBeenCalled();
  });

  it('recolha aprovada, já lançada no Branet, é confirmada pela unidade de origem (feedback 26/08)', async () => {
    const recolha = {
      ...cessaoAprovada,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: 'galpao-1',
      unidadeDestino: { id: 'galpao-1', nome: 'Galpão CIAD/Branet' },
      pedidoEntregaRegistradoEm: new Date(),
    };
    prismaMock.solicitacao.findUnique.mockResolvedValue(recolha as never);
    prismaMock.solicitacao.update.mockResolvedValue({ ...recolha, status: 'AGUARDANDO_VALIDACAO' } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recolha')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_VALIDACAO');
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
      .set(auth('OPERADOR'));
    expect(res.status).toBe(200);
  });
});
