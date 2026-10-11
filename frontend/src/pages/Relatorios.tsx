import { Navigate, useParams } from 'react-router-dom';
import './Relatorios.css';
import { RelatorioCessoes } from './relatorios/Cessoes';
import { RelatorioEmprestimos } from './relatorios/Emprestimos';
import { RelatorioItensEstoque } from './relatorios/ItensEstoque';
import { RelatorioVisaoGeral } from './relatorios/VisaoGeral';
import { caminhoRelatorio, RELATORIO_PADRAO, SUBMENUS_RELATORIOS } from '../utils/relatorios';

// Página dos relatórios: cada submenu do menu lateral abre um relatório em pages/relatorios/
export function Relatorios() {
  const { relatorio } = useParams<{ relatorio: string }>();
  const atual = SUBMENUS_RELATORIOS.find((item) => item.valor === relatorio);
  if (!atual) return <Navigate to={caminhoRelatorio(RELATORIO_PADRAO)} replace />;

  return (
    <section
      className={`gestao-page relatorios-page relatorios-page--${atual.valor}`}
      aria-labelledby="relatorios-titulo"
    >
      <div className="page-header">
        <div>
          <h2 id="relatorios-titulo">{atual.rotulo}</h2>
        </div>
      </div>
      {atual.valor === 'visao-geral' && <RelatorioVisaoGeral />}
      {atual.valor === 'emprestimos' && <RelatorioEmprestimos />}
      {atual.valor === 'cessoes' && <RelatorioCessoes />}
      {atual.valor === 'itens-estoque' && <RelatorioItensEstoque />}
    </section>
  );
}

