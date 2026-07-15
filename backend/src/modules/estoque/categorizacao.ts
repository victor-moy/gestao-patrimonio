interface RegraCategoria {
  nome: string;
  cor: string;
  palavras: string[];
}

// Heurística por palavra-chave para classificar mercadorias importadas que
// ainda não têm Tipo de Equipamento cadastrado (relatório de estoque do
// Branet não traz categoria). A primeira regra que casar vence; o resultado
// pode ser reclassificado manualmente em Configurações > Tipos de Equipamento.
const REGRAS: RegraCategoria[] = [
  {
    nome: 'Odontologia',
    cor: '#d97706',
    palavras: [
      'ODONT', 'ENDODONT', 'PERIO', 'APICAL', 'GRACEY', 'DENTINA', 'ISOLAMENTO',
      'GRAMPO', 'IONOMERO', 'BRACKET', 'TOFFLEMIRE', 'CARPULE', 'DAPPEN',
      'AMALGAMADOR', 'FOTOPOLIMERIZ', 'FOTOPOLIMEZ', 'MICRO MOTOR', 'CALCADOR',
      'ESCAVADOR', 'SINDESM', 'ALVEOL', 'BRUNIDOR', 'RCEPS',
      'CURETA', 'ALAVANCA', 'ESPATUL', 'EXTRATOR', 'DESCOLADOR',
      'CINZEL', 'RASPADOR', 'LIMA', 'PRENDEDOR TIPO JACARE', 'ALICATE',
      'HIDROXIDO', 'ARCO DE OSTBY', 'ESCULPIDOR', 'HOLLEMBACK',
      'FIO RETRATOR', 'FILTRO DE PAPEL',
    ],
  },
  {
    nome: 'Reabilitação e Estimulação',
    cor: '#db2777',
    palavras: [
      'SENSORIAL', 'ESPUMAD', 'PSCICOMOTOR', 'PISCINA DE BOLINHAS',
      'RAMPA ESCALADA', 'CAIXA TATO', 'COBRA SENSORIAL', 'RELOGIO EDUCATIVO',
      'TUNEL ESPUMADO', 'BARRA PARALELA', 'CUBO TERAPEUTICO', 'TATAME',
      'CIRCUITO', 'ESCORREGADOR',
    ],
  },
  {
    nome: 'Informática e Eletrônicos',
    cor: '#0d9488',
    palavras: ['COMPUTADOR', 'PROJETOR', 'SERVIDOR', 'SMART TV', 'POLEGADAS'],
  },
  {
    nome: 'Climatização',
    cor: '#9333ea',
    palavras: ['AR-CONDICIONADO', 'CONDICIONADOR DE AR', 'CORTINA DE AR'],
  },
  {
    nome: 'Instrumentais Cirúrgicos',
    cor: '#4f46e5',
    palavras: ['TESOURA', 'PINCA', 'PINÇA', 'PORTA AGULHA', 'BISTURI', 'AFASTADOR', 'CUBA RIM', 'FOICE'],
  },
  {
    nome: 'Equipamentos Médicos',
    cor: '#dc2626',
    palavras: [
      'APARELHO', 'AUTOCLAVE', 'BALANCA', 'BOMBA', 'CARDIOVERSOR', 'CARRO',
      'COLAR CERVICAL', 'COLCHAO HOSPITALAR', 'CAMA HOSPITALAR', 'DESFIBRILADOR',
      'DETECTOR FETAL', 'DOPPLER', 'ELETROCARDIOGRAFO', 'ESFIGMOMANOMETRO',
      'ESTETOSCOPIO', 'IMOBILIZADOR', 'MACA', 'MULTIPARAMETRO', 'NEBULIZADOR',
      'OFTALMOSCOPIO', 'OTOSCOPIO', 'OXIMETRO', 'TERMOHIGROMETRO', 'TERMOMETRO',
      'ULTRASSOM', 'VENTILADOR', 'REANIMADOR', 'SORO', 'DERMATOSCOPIO', 'LASER',
      'SELADORA', 'ESCADA CLINICA', 'NEGATOSCOPIO', 'CADEIRA DE RODAS',
      'CADEIRA DE BANHO', 'MESA CLINICA', 'MESA GINECOLOGICA', 'MESA DE MAYO',
      'ANTROPOMETRIC', 'CINTO TIRANTE', 'BRACADEIRA', 'FOTOFORO', 'ESPECULO',
      'AUDIOM', 'VALVULA REGULADORA', 'FLUXOMETRO', 'CONSERVADORA',
      'FOCO CLINICO', 'LANTERNA CLINICA',
    ],
  },
  {
    nome: 'Eletrodomésticos',
    cor: '#0891b2',
    palavras: [
      'FOGAO', 'FREEZER', 'FRIGOBAR', 'GELADEIRA', 'REFRIGERADOR', 'FORNO',
      'BATEDEIRA', 'LAVADORA', 'MULTIPROCESSADOR', 'JARRA ELETRICA', 'BEBEDOURO',
      'PURIFICADOR',
    ],
  },
  {
    nome: 'Utensílios de Cozinha',
    cor: '#ea580c',
    palavras: [
      'PANELA', 'ASSADEIRA', 'PANQUEQUEIRA', 'BULE', 'BACIA', 'PRATO', 'COPO',
      'COMADRE', 'PAPAGAIO', 'LIXEIRA', 'BANDEJA', 'ABRIDOR', 'CAIXA TERMICA',
      'POTE',
    ],
  },
  {
    nome: 'Mobiliário',
    cor: '#64748b',
    palavras: [
      'ARMARIO', 'BALCAO', 'BANQUETA', 'CADEIRA', 'ESTANTE', 'GAVETEIRO',
      'LONGARINA', 'MESA', 'POLTRONA', 'SOFA', 'BIOMBO', 'CONJUNTO',
      'SAPATEIRA', 'HAMPER',
    ],
  },
];

const CATEGORIA_PADRAO = { nome: 'Outros', cor: '#78716c' };

// Remove acentos antes de comparar — o relatório às vezes chega com
// encoding inconsistente (ex.: "ANTROPOMÉTRICA" vs "ANTROPOMETRICA")
function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function inferirCategoria(nomeMercadoria: string): { nome: string; cor: string } {
  const alvo = normalizar(nomeMercadoria);
  for (const regra of REGRAS) {
    if (regra.palavras.some((p) => alvo.includes(normalizar(p)))) {
      return { nome: regra.nome, cor: regra.cor };
    }
  }
  return CATEGORIA_PADRAO;
}
