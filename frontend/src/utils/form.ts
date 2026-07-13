// Compara o formulário com seu estado inicial — usado para desabilitar
// o botão de salvar e evitar requisições sem alteração alguma
export function semAlteracoes(inicial: unknown, atual: unknown) {
  return JSON.stringify(inicial) === JSON.stringify(atual);
}
