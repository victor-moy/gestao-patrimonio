import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { IconeQrCode } from './icons';

interface QrCodeEquipamentoProps {
  equipamentoId: string;
  tombamento: string;
  descricao: string;
  unidade: string;
}

// Ícone ao lado do tombamento: ao clicar, gera o QR Code do equipamento e abre a impressão da
// etiqueta (QR + tombamento + descrição + unidade). O QR é gerado no navegador e codifica só o
// endereço do detalhe: quem ler precisa estar autenticado e ter permissão para ver o equipamento.
export function QrCodeEquipamento({ equipamentoId, tombamento, descricao, unidade }: QrCodeEquipamentoProps) {
  const [imagem, setImagem] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [falha, setFalha] = useState(false);

  async function aoClicar() {
    setFalha(false);
    if (imagem) {
      setImprimir(true);
      return;
    }
    setGerando(true);
    try {
      const endereco = `${window.location.origin}/inventario/${equipamentoId}`;
      setImagem(await QRCode.toDataURL(endereco, { width: 640, margin: 2, errorCorrectionLevel: 'M' }));
      setImprimir(true);
    } catch {
      setFalha(true);
    } finally {
      setGerando(false);
    }
  }

  // A etiqueta precisa estar renderizada e a imagem do QR decodificada antes de abrir o diálogo de
  // impressão; sem isso o navegador imprime o espaço do QR em branco.
  useEffect(() => {
    if (!imprimir || !imagem) return;
    let ativo = true;
    const el = document.querySelector<HTMLImageElement>('.qr-etiqueta-impressao img');
    Promise.resolve(el?.decode?.())
      .catch(() => undefined)
      .then(() => {
        if (!ativo) return;
        window.print();
        setImprimir(false);
      });
    return () => {
      ativo = false;
    };
  }, [imprimir, imagem]);

  return (
    <>
      <button
        type="button"
        className="qr-botao"
        onClick={aoClicar}
        disabled={gerando}
        aria-label="Imprimir etiqueta com QR Code"
        title="Imprimir etiqueta com QR Code"
      >
        <IconeQrCode />
      </button>
      {falha && <span className="qr-erro" role="alert">Não foi possível gerar o QR Code.</span>}
      {imagem && (
        <div className="qr-etiqueta-impressao" aria-hidden>
          <img src={imagem} alt="" />
          <strong>{tombamento}</strong>
          <span>{descricao}</span>
          <span>{unidade}</span>
        </div>
      )}
    </>
  );
}
