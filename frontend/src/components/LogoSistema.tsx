/** Ícone do sistema (cubo em três tons) para uso sobre superfícies escuras, como o cabeçalho e o login. */
export function LogoSistema({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg
      className="logo-sistema"
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16.41 17.63 32 8.48l15.59 9.15L32 26.78Z" fill="#8dbcf8" stroke="#8dbcf8" strokeWidth="6" strokeLinejoin="round" />
      <path d="M12 25.48l15.5 9.1v18.3L12 43.78Z" fill="#3d8bf0" stroke="#3d8bf0" strokeWidth="6" strokeLinejoin="round" />
      <path d="M36.5 34.58 52 25.48v18.3L36.5 52.88Z" fill="#1e63c9" stroke="#1e63c9" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}
