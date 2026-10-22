# EduMind

Ferramenta local de apoio a orientadores de concursos públicos. O MVP cobre duas etapas:

1. **Análise do edital:** ler o PDF, guardar o texto de cada página, extrair metadados e o conteúdo
   programático como árvore (bloco, disciplina, assunto, subassunto), com revisão do orientador.
2. **Normas de Direito:** obter, de fontes oficiais, o texto das normas citadas no edital e mostrar a
   cobertura de cada item.

Fora do escopo agora: provas e questões, alunos, tutor, geração de conteúdo, login e deploy.

## Estado atual

Etapa **1b-1** concluída: extração dos metadados do edital com o Gemini (botão "Extrair com IA" na visão geral do
edital), com a conferência de cada trecho citado por busca no texto da página.

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1a | Esqueleto, banco, texto por página, parser de artigos | feita |
| 1b-1 | Extração dos metadados com IA (Gemini) e conferência dos trechos | feita |
| 1b-2 | Árvore do conteúdo programático com IA | próxima |
| 1c | Tela de revisão | — |
| 2a | Coletor (robots.txt, limite por host, fetch_log) e upload manual | — |
| 2b | Divisão das normas por artigo e alerta de vigência | — |
| 2c | Ligação itens × artigos e relatório de cobertura | — |

## Requisitos

- Node.js 24 ou mais novo.
- npm 11.
- PostgreSQL 16: o Postgres compartilhado desta máquina, de `C:Sourceinfra` (`docker compose up -d` lá).
  O usuário `edumind` e os databases `edumind` e `edumind_test` já existem nele; a senha está em
  `C:Sourceinfraapps.env` (`POSTGRES_EDUMIND_PASSWORD`).

## Como rodar

```bash
# 1. Configuração (na raiz do projeto)
cp .env.example .env        # preencha POSTGRES_PASSWORD e, na etapa 1b, as chaves do Gemini

# 2. Backend (porta 3000)
cd backend
npm install
npm run db:migrate
npm run dev

# 3. Frontend (outro terminal, porta 5173)
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173. O Vite repassa `/api` para o backend na porta 3000.

Os PDFs enviados ficam em `data/uploads/`, criada na primeira execução. O schema do banco vem das migrations em
`backend/database/migrations/` (Sequelize), aplicadas com `npm run db:migrate`; rode de novo sempre que
entrar uma migration nova.

## Testes

```bash
cd backend
npm test
```

Os testes usam o database `edumind_test`: o `npm test` aplica as migrations nele antes e cada teste apaga os
dados ao começar. Por isso o Postgres precisa estar no ar.

O teste com o edital real do TJSP só roda quando o arquivo está em
`tests/fixtures/edital_tjsp_escrevente_2025.pdf`; sem ele, aparece como pulado.

## Estrutura

```text
backend/src/
  config/env.js            variáveis de ambiente (.env na raiz)
  db/                      conexão com o PostgreSQL (Sequelize)
  models/                  models do Sequelize (só das tabelas que o código já usa)
  parsers/artigos.parser.js  expansão de "artigos 293 a 305; 307; 311-A" (código, sem regex, sem IA)
  ai/                      provider do Gemini (chave gratuita primeiro, paga como reserva) e prompts versionados
  services/                regras: edital (upload e páginas), leitura do PDF, extração com IA, conferência dos trechos
  routes/                  rotas HTTP em /api/v1
  shared/                  logger, erros, middlewares
backend/database/migrations/  migrations do sequelize-cli (fonte da verdade do schema)
frontend/src/
  components/layout/AppShell.vue  topbar e menu lateral (padrão do AgroMind)
  views/                   telas
  services/                chamadas à API
  assets/edumind-tokens.css  paleta (mesmos valores do AgroMind)
tests/fixtures/            edital de teste (fora do git)
```

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | verifica se o backend está no ar |
| GET | `/api/v1/editais` | lista os editais |
| POST | `/api/v1/editais` | envia o PDF (campo `arquivo`, multipart). O mesmo PDF de novo devolve o existente |
| GET | `/api/v1/editais/:id` | detalhe do edital |
| GET | `/api/v1/editais/:id/paginas/:numero` | texto de uma página |
| GET | `/api/v1/editais/:id/arquivo` | PDF original |
