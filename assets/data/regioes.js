/**
 * Polos operacionais e linhas atendidas pela Way Última Milha.
 * Coordenadas geográficas reais (lat/lng) das sedes municipais.
 * Conteúdo espelha o que a empresa publica em "Regiões atendidas".
 */

export const HUBS = [
  {
    id: 'hortolandia',
    unidade: 'Unidade Hortolândia',
    regiao: 'Campinas',
    lng: -47.22,
    lat: -22.858,
    tipo: 'polo',
    lado: 'direita',
    cobertura: 'Região Metropolitana de Campinas e RA de Campinas',
  },
  {
    id: 'votorantim',
    unidade: 'Unidade Votorantim',
    regiao: 'Sorocaba',
    lng: -47.439,
    lat: -23.546,
    tipo: 'polo',
    lado: 'esquerda',
    cobertura: 'Região Metropolitana de Sorocaba',
  },
  {
    id: 'barueri',
    unidade: 'Unidade Barueri',
    regiao: 'São Paulo',
    lng: -46.876,
    lat: -23.511,
    tipo: 'polo',
    lado: 'direita',
    cobertura: 'Capital, Grande São Paulo e Alphaville',
  },
  {
    id: 'praia-grande',
    unidade: 'Unidade Praia Grande',
    regiao: 'Baixada Santista',
    lng: -46.403,
    lat: -24.006,
    tipo: 'polo',
    lado: 'direita',
    cobertura: 'Baixada Santista e Vale da Ribeira',
  },
];

/** Destino de linha diária (ida e volta), não é polo fixo. */
export const LINHAS = [
  {
    id: 'ribeirao',
    unidade: 'Ribeirão Preto',
    regiao: 'Linha diária',
    lng: -47.81,
    lat: -21.177,
    tipo: 'linha',
    lado: 'esquerda',
    cobertura: 'Linhas diárias São Paulo × Ribeirão Preto × São Paulo',
  },
];

/** Centro geográfico de referência: capital. Origem das rotas. */
export const CAPITAL = { id: 'capital', unidade: 'São Paulo', lng: -46.633, lat: -23.55 };

export const NODES = [...HUBS, ...LINHAS];
