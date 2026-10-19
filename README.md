# EduMind

Ferramenta local de apoio a orientadores de concursos públicos. O MVP cobre duas etapas:

1. **Análise do edital:** ler o PDF, guardar o texto de cada página, extrair metadados e o conteúdo
   programático como árvore (bloco, disciplina, assunto, subassunto), com revisão do orientador.
2. **Normas de Direito:** obter, de fontes oficiais, o texto das normas citadas no edital e mostrar a
   cobertura de cada item.

Fora do escopo agora: provas e questões, alunos, tutor, geração de conteúdo, login e deploy.

## Estado atual

Etapa **1a** concluída: esqueleto, banco, upload do PDF com texto por página e parser de artigos.

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1a | Esqueleto, banco, texto por página, parser de artigos | feita |
| 1b | Extração com IA (Gemini) e verificação dos trechos | próxima |
| 1c | Tela de revisão | — |
| 2a | Coletor (robots.txt, limite por host, fetch_log) e upload manual | — |
| 2b | Divisão das normas por artigo e alerta de vigência | — |
| 2c | Ligação itens × artigos e relatório de cobertura | — |

## Requisitos

- Node.js 24 ou mais novo (o banco usa o SQLite embutido no Node, `node:sqlite`).
- npm 11.

## Como rodar

```bash
# 1. Configuração (na raiz do projeto)
cp .env.example .env        # preencha as chaves do Gemini quando for usar a etapa 1b

# 2. Backend (porta 3000)
cd backend
npm install
npm run dev

# 3. Frontend (outro terminal, porta 5173)
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173. O Vite repassa `/api` para o backend na porta 3000.

O banco (`data/edumind.db`) e os PDFs enviados (`data/uploads/`) são criados na primeira execução.
As migrations em `backend/src/db/migrations/` são aplicadas automaticamente ao subir o backend.

## Testes

```bash
cd backend
npm test
```

O teste com o edital real do TJSP só roda quando o arquivo está em
`tests/fixtures/edital_tjsp_escrevente_2025.pdf`; sem ele, aparece como pulado.

## Estrutura

```text
backend/src/
  config/env.js            variáveis de ambiente (.env na raiz)
  db/                      abertura do SQLite e migrations (fonte da verdade do schema)
  parsers/artigos.parser.js  expansão de "artigos 293 a 305; 307; 311-A" (código, sem regex, sem IA)
  services/                regras: edital (upload e páginas), leitura do PDF
  routes/                  rotas HTTP em /api/v1
  shared/                  logger, erros, middlewares
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
