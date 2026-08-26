// Ícones de traço (20px, stroke 1.67) conforme o header do Figma
import type { SVGProps } from 'react';

function Icone({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconeInicio = () => (
  <Icone>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </Icone>
);

export const IconeInventario = () => (
  <Icone>
    <path d="M16.5 9.4L7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.27 6.96L12 12.01l8.73-5.05" />
    <path d="M12 22.08V12" />
  </Icone>
);

export const IconeManutencoes = () => (
  <Icone>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </Icone>
);

export const IconeSolicitacoes = () => (
  <Icone>
    <path d="M8 3L4 7l4 4" />
    <path d="M4 7h16" />
    <path d="M16 21l4-4-4-4" />
    <path d="M20 17H4" />
  </Icone>
);

export const IconeEstoque = () => (
  <Icone>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Icone>
);

export const IconeRelatorios = () => (
  <Icone>
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </Icone>
);

export const IconeChevron = () => (
  <Icone width="16" height="16">
    <path d="M6 9l6 6 6-6" />
  </Icone>
);

export const IconeMenu = () => (
  <Icone>
    <path d="M3 12h18M3 6h18M3 18h18" />
  </Icone>
);

export const IconeFechar = () => (
  <Icone>
    <path d="M18 6L6 18M6 6l12 12" />
  </Icone>
);

export const IconeUsuarios = () => (
  <Icone>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icone>
);

export const IconeUnidades = () => (
  <Icone>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </Icone>
);

export const IconeAtas = () => (
  <Icone>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8M10 9H8" />
  </Icone>
);

export const IconeContratos = () => (
  <Icone>
    <path d="M20 7h-9M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </Icone>
);

export const IconePin = () => (
  <Icone>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Icone>
);

export const IconeTag = () => (
  <Icone>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <path d="M7 7h.01" />
  </Icone>
);

export const IconeLapis = () => (
  <Icone width="16" height="16">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Icone>
);

export const IconeLixeira = () => (
  <Icone width="16" height="16">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icone>
);

export const IconeDinheiro = () => (
  <Icone width="16" height="16">
    <path d="M12 2v20" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </Icone>
);

export const IconeCalendario = () => (
  <Icone width="16" height="16">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icone>
);

export const IconeAlerta = () => (
  <Icone width="16" height="16">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icone>
);

export const IconeBusca = () => (
  <Icone width="18" height="18">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </Icone>
);

export const IconeEmail = () => (
  <Icone width="16" height="16">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 7l-10 6L2 7" />
  </Icone>
);

export const IconeUsuario = () => (
  <Icone width="16" height="16">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icone>
);

export const IconeEntrada = () => (
  <Icone width="16" height="16">
    <path d="M12 3v12" />
    <path d="M8 11l4 4 4-4" />
    <path d="M3 17v1a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
  </Icone>
);

export const IconeSaida = () => (
  <Icone width="16" height="16">
    <path d="M12 21V9" />
    <path d="M8 13l4-4 4 4" />
    <path d="M3 7V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1" />
  </Icone>
);

export const IconeUpload = () => (
  <Icone width="16" height="16">
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  </Icone>
);

export const IconeCaixa = () => (
  <Icone width="16" height="16">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </Icone>
);

// Catálogo de tipos de Solicitação
export const IconeSubstituicao = () => (
  <Icone>
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </Icone>
);

export const IconeAmpliacao = () => (
  <Icone>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </Icone>
);

export const IconeCessaoExterna = () => (
  <Icone>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14L21 3" />
  </Icone>
);

export const IconeEmprestimo = () => (
  <Icone>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icone>
);

export const IconeRecolha = () => (
  <Icone>
    <path d="M10 17h4V5H2v12h3" />
    <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </Icone>
);

export const IconeDetalhes = () => (
  <Icone>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </Icone>
);

export const IconeEnviar = () => (
  <Icone width="16" height="16">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </Icone>
);
