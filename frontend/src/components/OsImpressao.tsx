import { createPortal } from 'react-dom';
import type { Manutencao, OrdemServico } from '../types';
import { codigoManutencao, formatarData } from '../utils/format';
import './OsImpressao.css';

// Imprime só a OS: marca o body enquanto o diálogo de impressão está aberto (sem isso, outras impressões, como a etiqueta
// do QR Code, herdariam as regras da OS)
export function imprimirOs() {
  const classe = 'imprimindo-os';
  const fim = () => {
    document.body.classList.remove(classe);
    window.removeEventListener('afterprint', fim);
  };
  document.body.classList.add(classe);
  window.addEventListener('afterprint', fim);
  window.print();
}

const LINHAS_ITENS = 6;
const LINHAS_OBSERVACOES = 4;

// Versão de papel da OS (só aparece ao imprimir): a equipe preenche à mão o que falta e a assinatura é física.
// Vai direto no <body>, fora do app, para a impressão não herdar a altura da tela (que geraria páginas em branco).
export function OsImpressao({ m, os, codigo }: { m: Manutencao; os: OrdemServico; codigo: string }) {
  return createPortal(<OsPapel m={m} os={os} codigo={codigo} />, document.body);
}

export function OsPapel({ m, os, codigo }: { m: Manutencao; os: OrdemServico; codigo: string }) {
  const local = [m.localAfetado, m.categoriaCivil?.nome].filter(Boolean);
  return (
    <div className="os-papel" aria-hidden>
      <header className="os-papel-topo">
        <div className="os-papel-marca">
          <img src="/favicon.svg" alt="" />
          <div>
            <strong>Gestão Patrimonial</strong>
            <span>Secretaria Municipal da Saúde de Joinville</span>
          </div>
        </div>
        <div className="os-papel-titulo">
          <span>Ordem de serviço</span>
          <strong>{codigo}</strong>
        </div>
      </header>

      <section>
        <h2>Atendimento</h2>
        <table className="os-papel-tabela">
          <tbody>
            <tr>
              <th>Unidade</th>
              <td>{m.unidade.nome}</td>
              <th>Chamado</th>
              <td>{codigoManutencao(m.numero)}</td>
            </tr>
            <tr>
              <th>Local e tipo</th>
              <td>{local.length > 0 ? local.join(' · ') : '—'}</td>
              <th>Prestador</th>
              <td>{m.contrato?.prestador.nome ?? '—'}</td>
            </tr>
            <tr>
              <th>Equipe</th>
              <td>{os.equipe}</td>
              <th>Dia da visita</th>
              <td>{formatarData(os.dataPrevista)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Problema relatado</h2>
        <div className="os-papel-texto">{m.descricaoProblema}</div>
      </section>

      <section>
        <h2>Escopo do serviço</h2>
        <div className="os-papel-texto">{os.escopo}</div>
      </section>

      <section>
        <h2>Execução</h2>
        <table className="os-papel-tabela os-papel-preencher">
          <tbody>
            <tr>
              <th>Entrada</th>
              <td>
                <span className="os-papel-lacuna">Data</span>
                <span className="os-papel-lacuna">Hora</span>
              </td>
              <th>Saída</th>
              <td>
                <span className="os-papel-lacuna">Data</span>
                <span className="os-papel-lacuna">Hora</span>
              </td>
            </tr>
            <tr>
              <th>Resultado</th>
              <td colSpan={3}>
                <span className="os-papel-opcao">
                  <i /> Total
                </span>
                <span className="os-papel-opcao">
                  <i /> Parcial
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Serviços e materiais executados</h2>
        <table className="os-papel-tabela os-papel-itens">
          <thead>
            <tr>
              <th className="os-papel-n">Nº</th>
              <th>Descrição</th>
              <th className="os-papel-q">Qtd.</th>
              <th className="os-papel-q">Un.</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: LINHAS_ITENS }, (_, i) => (
              <tr key={i}>
                <td className="os-papel-n">{i + 1}</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Observações</h2>
        <div className="os-papel-linhas">
          {Array.from({ length: LINHAS_OBSERVACOES }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      </section>

      <div className="os-papel-assinaturas">
        <div>
          <span>Responsável da unidade</span>
          <small>Nome, assinatura e data</small>
        </div>
        <div>
          <span>Responsável da equipe</span>
          <small>Nome, assinatura e data</small>
        </div>
      </div>

      <footer className="os-papel-rodape">
        {codigo} · {codigoManutencao(m.numero)} · Emitida em {new Date().toLocaleDateString('pt-BR')}
      </footer>
    </div>
  );
}
