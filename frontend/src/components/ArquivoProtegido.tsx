import { useEffect, useState } from 'react';
import { baixarArquivoProtegido } from '../api/client';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

// Link que abre um arquivo protegido (anexo/laudo) em outra aba, já autenticado.
export function LinkArquivoProtegido({ caminho, children }: { caminho: string; children: React.ReactNode }) {
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));
  const [abrindo, setAbrindo] = useState(false);

  async function abrir() {
    setErro(null);
    setAbrindo(true);
    try {
      const url = await baixarArquivoProtegido(caminho);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-link" onClick={abrir} disabled={abrindo}>
        {abrindo ? 'Abrindo…' : children}
      </button>
    </>
  );
}

// Imagem de arquivo protegido: busca com o token e exibe a partir de uma URL temporária.
export function ImagemProtegida({ caminho, alt, className }: { caminho: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [falha, setFalha] = useState(false);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;
    baixarArquivoProtegido(caminho)
      .then((u) => {
        criada = u;
        if (ativo) setUrl(u);
      })
      .catch(() => ativo && setFalha(true));
    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [caminho]);

  if (falha) return <span className="equipamento-historico-vazio" role="status">Não foi possível carregar a imagem.</span>;
  if (!url) return <span className="equipamento-historico-vazio" role="status">Carregando imagem…</span>;
  return <img src={url} alt={alt} className={className} />;
}
