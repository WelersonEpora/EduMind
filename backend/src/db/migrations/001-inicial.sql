-- Schema inicial do EduMind (etapas 1 e 2 do MVP).
-- Convenções: ids TEXT com UUID gerado na aplicação (crypto.randomUUID), snake_case,
-- datas em TEXT ISO 8601 (UTC), JSON em TEXT, created_at/updated_at em toda tabela.

-- Etapa 1: edital ---------------------------------------------------------------

CREATE TABLE edital (
  id TEXT PRIMARY KEY,
  arquivo_nome TEXT NOT NULL,
  arquivo_sha256 TEXT NOT NULL UNIQUE,
  arquivo_bytes INTEGER NOT NULL,
  total_paginas INTEGER NOT NULL,
  -- Preenchidos pela extração (etapa 1b). Nulos até lá.
  banca TEXT,
  orgao TEXT,
  cargo TEXT,
  data_publicacao TEXT,
  -- Blocos, quantidades por disciplina, regras de corte e discursiva, cada item com página e trecho.
  metadados_json TEXT,
  status TEXT NOT NULL DEFAULT 'texto_extraido'
    CHECK (status IN ('texto_extraido', 'extraindo', 'extraido', 'erro_extracao')),
  erro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE edital_pagina (
  edital_id TEXT NOT NULL REFERENCES edital(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  texto TEXT NOT NULL,
  PRIMARY KEY (edital_id, numero)
);

-- Árvore do conteúdo programático: bloco > disciplina > assunto > subassunto.
CREATE TABLE edital_item (
  id TEXT PRIMARY KEY,
  edital_id TEXT NOT NULL REFERENCES edital(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES edital_item(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('bloco', 'disciplina', 'assunto', 'subassunto')),
  ordem INTEGER NOT NULL,
  texto TEXT NOT NULL,
  -- Trecho literal do edital devolvido pela IA e a página que ela citou.
  source_excerpt TEXT NOT NULL,
  pagina INTEGER NOT NULL,
  -- Resultado da busca do trecho na página citada (não depende da IA).
  verificado INTEGER NOT NULL DEFAULT 0 CHECK (verificado IN (0, 1)),
  -- Quando o trecho não está na página citada mas aparece em outra.
  pagina_encontrada INTEGER,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'rejeitado')),
  status_em TEXT,
  editado INTEGER NOT NULL DEFAULT 0 CHECK (editado IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_edital_item_edital ON edital_item (edital_id, parent_id, ordem);

-- Norma citada por um item de legislação. A expansão dos artigos é feita por código
-- (parsers/artigos.parser.js), nunca pela IA.
CREATE TABLE item_norma (
  item_id TEXT PRIMARY KEY REFERENCES edital_item(id) ON DELETE CASCADE,
  tipo TEXT,
  numero TEXT,
  ano TEXT,
  nome TEXT,
  -- Trecho dos artigos como está no edital ("artigos 293 a 305; 307; ...").
  artigos_texto TEXT,
  -- Saída do parser: { artigos, intervalos, avisos }.
  artigos_json TEXT,
  norma_id TEXT REFERENCES norma(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Etapa 2: normas (biblioteca compartilhada entre editais) -------------------------

CREATE TABLE norma (
  id TEXT PRIMARY KEY,
  -- Identidade estável da norma: "lei:9099:1995", "decreto-lei:2848:1940".
  chave TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  numero TEXT,
  ano TEXT,
  nome TEXT NOT NULL,
  esfera TEXT CHECK (esfera IN ('federal', 'estadual', 'tribunal')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Cada coleta ou upload com conteúdo diferente vira uma versão nova. Cada edital usa a versão mais
-- próxima da sua data de publicação.
CREATE TABLE norma_versao (
  id TEXT PRIMARY KEY,
  norma_id TEXT NOT NULL REFERENCES norma(id) ON DELETE CASCADE,
  url TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('coleta', 'upload')),
  status TEXT NOT NULL CHECK (status IN (
    'pendente', 'obtido', 'vazio', 'vedado_robots', 'falhou', 'upload_manual_necessario', 'upload_recebido'
  )),
  -- Data da alteração mais recente encontrada nas notas de redação, e com que precisão ela é conhecida.
  data_versao TEXT,
  data_versao_precisao TEXT CHECK (data_versao_precisao IN ('dia', 'ano')),
  acessado_em TEXT,
  sha256 TEXT,
  arquivo_caminho TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_norma_versao_norma ON norma_versao (norma_id, created_at);

CREATE TABLE norma_artigo (
  id TEXT PRIMARY KEY,
  versao_id TEXT NOT NULL REFERENCES norma_versao(id) ON DELETE CASCADE,
  -- "313-A"
  numero TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  caput TEXT,
  paragrafos_json TEXT,
  incisos_json TEXT,
  -- Notas de redação mantidas como vieram ("Redação dada pela Lei nº ...").
  notas_json TEXT,
  revogado INTEGER NOT NULL DEFAULT 0 CHECK (revogado IN (0, 1)),
  texto_bruto TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (versao_id, numero)
);

-- Ligação de cada artigo pedido pelo edital com o artigo encontrado no texto da norma.
CREATE TABLE item_artigo (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES edital_item(id) ON DELETE CASCADE,
  artigo_pedido TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('explicito', 'intervalo', 'letra_no_intervalo')),
  norma_artigo_id TEXT REFERENCES norma_artigo(id),
  situacao TEXT NOT NULL CHECK (situacao IN ('encontrado', 'revogado', 'faltando')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (item_id, artigo_pedido)
);

-- Todo acesso do coletor, inclusive a leitura do robots.txt e os acessos não feitos por vedação.
CREATE TABLE fetch_log (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  acessado_em TEXT NOT NULL,
  robots_permitido INTEGER CHECK (robots_permitido IN (0, 1)),
  http_status INTEGER,
  sha256 TEXT,
  bytes INTEGER,
  status TEXT NOT NULL,
  erro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_fetch_log_host ON fetch_log (host, acessado_em);
