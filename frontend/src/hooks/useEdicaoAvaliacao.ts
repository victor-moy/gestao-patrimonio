import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { Contrato, Equipamento, Manutencao, Setor, Unidade } from '../types';

export type CamposAvaliacao = {
  titulo: string;
  descricaoProblema: string;
  unidadeId: string;
  localAfetado: string;
  categoriaCivilId: string;
  setorIds: string[];
  contratoItemId: string;
  orientacoesTerceirizada: string;
  parecerTecnico: string;
};

const doChamado = (m: Manutencao): CamposAvaliacao => ({
  titulo: m.titulo ?? '',
  descricaoProblema: m.descricaoProblema,
  unidadeId: m.unidade.id,
  localAfetado: m.localAfetado ?? '',
  categoriaCivilId: m.categoriaCivilId ?? '',
  setorIds: (m.setores ?? []).map((x) => x.setor.id),
  contratoItemId: m.contratoItem?.id ?? '',
  orientacoesTerceirizada: m.orientacoesTerceirizada ?? '',
  parecerTecnico: m.parecerTecnico ?? '',
});

const LIMPAVEIS = ['localAfetado', 'categoriaCivilId', 'orientacoesTerceirizada', 'parecerTecnico'];

// Estado da avaliação técnica: os campos do próprio chamado (exibidos na tela, editáveis para quem avalia), os dados de
// apoio das listas e o que mudou em relação ao que está salvo.
export function useEdicaoAvaliacao(m: Manutencao, ativo: boolean) {
  const original = useMemo(() => doChamado(m), [m]);
  const [form, setForm] = useState<CamposAvaliacao>(original);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [falhaApoio, setFalhaApoio] = useState<string | null>(null);
  const [buscaEquip, setBuscaEquip] = useState('');
  const [achados, setAchados] = useState<Equipamento[]>([]);
  const [equipamentoId, setEquipamentoId] = useState('');
  const [prestadorId, setPrestadorId] = useState('');

  useEffect(() => {
    setForm(original);
    setEquipamentoId('');
    setAchados([]);
  }, [original]);

  useEffect(() => {
    if (!ativo) return;
    setFalhaApoio(null);
    Promise.all([api.get<Unidade[]>('/unidades'), api.get<Contrato[]>('/contratos')])
      .then(([u, c]) => {
        setUnidades(u);
        setContratos(c);
      })
      .catch((e) => setFalhaApoio(e instanceof Error ? e.message : 'Não foi possível carregar os dados de apoio.'));
  }, [ativo]);

  useEffect(() => {
    if (!ativo || !form.unidadeId) return;
    api
      .get<Setor[]>(`/setores?unidadeId=${encodeURIComponent(form.unidadeId)}`)
      .then((l) => setSetores(l.filter((s) => s.ativo)))
      .catch(() => setSetores([]));
  }, [ativo, form.unidadeId]);

  const mudancas: Record<string, unknown> = {};
  (Object.keys(form) as Array<keyof CamposAvaliacao>).forEach((k) => {
    if (k === 'setorIds') {
      const a = [...form.setorIds].sort().join();
      if (a !== [...original.setorIds].sort().join()) mudancas.setorIds = form.setorIds;
      return;
    }
    if (form[k] === original[k]) return;
    const vazio = (form[k] as string).trim() === '';
    if (LIMPAVEIS.includes(k)) mudancas[k] = vazio ? null : form[k];
    else if (!vazio) mudancas[k] = form[k];
  });
  if (equipamentoId) mudancas.equipamentoId = equipamentoId;

  // O prestador vem do contrato do item; ao carregar os contratos, parte do prestador do item atual
  useEffect(() => {
    const dono = contratos.find((c) => c.itens.some((i) => i.id === original.contratoItemId));
    setPrestadorId(dono?.prestador.id ?? '');
  }, [contratos, original.contratoItemId]);

  const prestadores = Array.from(
    new Map(
      contratos
        .filter((c) => c.status !== 'EXPIRADO' || c.itens.some((i) => i.id === original.contratoItemId))
        .map((c) => [c.prestador.id, c.prestador.nome] as const),
    ),
  ).map(([id, nome]) => ({ id, nome }));

  // Itens de contrato oferecidos: do prestador escolhido, contrato vigente e saldo (o item atual sempre aparece)
  const itensContrato = contratos
    .filter((c) => c.prestador.id === prestadorId)
    .filter((c) => c.status !== 'EXPIRADO' || c.itens.some((i) => i.id === original.contratoItemId))
    .flatMap((c) =>
      c.itens
        .filter((i) => i.saldo > 0 || i.id === original.contratoItemId)
        .map((i) => ({ id: i.id, servico: i.servico.nome, rotulo: `Contrato ${c.numero}`, saldo: i.saldo })),
    );

  const buscarEquipamento = async () => {
    const lista = await api.get<Equipamento[]>(`/equipamentos?status=ATIVO&busca=${encodeURIComponent(buscaEquip.trim())}`);
    setAchados(lista.slice(0, 20));
  };

  return {
    ativo,
    form,
    setForm,
    campo: (k: Exclude<keyof CamposAvaliacao, 'setorIds'>) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
    unidades,
    setores,
    itensContrato,
    falhaApoio,
    buscaEquip,
    setBuscaEquip,
    achados,
    equipamentoId,
    setEquipamentoId,
    buscarEquipamento,
    prestadorId,
    prestadores,
    trocarPrestador: (id: string) => {
      setPrestadorId(id);
      setForm((f) => ({ ...f, contratoItemId: '' }));
    },
    itemEscolhido: form.contratoItemId !== '',
    mudancas,
    semMudanca: Object.keys(mudancas).length === 0,
    salvar: () => api.patch(`/manutencoes/${m.id}/avaliacao`, mudancas),
  };
}

export type EdicaoAvaliacao = ReturnType<typeof useEdicaoAvaliacao>;
