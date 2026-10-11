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

export const IconeConfiguracoes = () => (
  <Icone>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.08A1.65 1.65 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
  </Icone>
);

export const IconeFiltros = () => (
  <Icone width="18" height="18">
    <path d="M4 7h10" />
    <path d="M18 7h2" />
    <circle cx="16" cy="7" r="2" />
    <path d="M4 17h2" />
    <path d="M10 17h10" />
    <circle cx="8" cy="17" r="2" />
  </Icone>
);

export const IconeLogout = () => (
  <Icone width="16" height="16">
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
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

export const IconeCategorias = () => (
  <Icone>
    <path d="M12 2 2 7l10 5 10-5z" />
    <path d="m2 17 10 5 10-5" />
    <path d="m2 12 10 5 10-5" />
  </Icone>
);

export const IconeSetaCima = () => (
  <Icone>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Icone>
);

export const IconeQrCode = () => (
  <Icone>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" />
  </Icone>
);

export const IconeEntrarComo = () => (
  <Icone>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="m10 17 5-5-5-5" />
    <path d="M15 12H3" />
  </Icone>
);

export const IconeConversas = () => (
  <Icone>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
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

export const IconeBusca = () => (
  <Icone width="18" height="18">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
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
export const IconeCheck = () => (
  <Icone width="20" height="20">
    <path d="M20 6 9 17l-5-5" />
  </Icone>
);

