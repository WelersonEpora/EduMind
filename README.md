# EduMind

Ferramenta local de apoio a orientadores de concursos públicos. O MVP cobre duas etapas:

1. **Análise do edital:** ler o PDF, guardar o texto de cada página, extrair metadados e o conteúdo
   programático como árvore (bloco, disciplina, assunto, subassunto), com revisão do orientador.
2. **Normas de Direito:** obter, de fontes oficiais, o texto das normas citadas no edital e mostrar a
   cobertura de cada item.

Depois do MVP vieram as provas anteriores e as questões ligadas aos artigos, o login com equipes e papéis, o
simulador do aluno, a incidência na Cobertura e a publicação. Fora do escopo agora: tutor e geração de conteúdo.

## Estado atual

Etapa **2b** concluída. O botão "Extrair com IA" da visão geral do edital extrai, com o Gemini, os metadados e a
árvore do conteúdo programático com as normas citadas; cada trecho citado é conferido por busca no texto da página e
os artigos são expandidos pelo parser. Na tela **Revisão**, o orientador aprova, rejeita ou corrige cada item. Na tela **Fontes**, as normas dos itens
aprovados ganham identidade na biblioteca, URL oficial (achada pelo orientador com a busca no Google montada pelo sistema, só domínios oficiais) e o texto por upload manual, que é dividido em artigos na hora (com a data da versão e o
alerta dos artigos alterados depois da publicação do edital).

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1a | Esqueleto, banco, texto por página, parser de artigos | feita |
| 1b-1 | Extração dos metadados com IA (Gemini) e conferência dos trechos | feita |
| 1b-2 | Árvore do conteúdo programático e normas citadas, com IA | feita |
| 1c | Tela de revisão | feita |
| 2a-1 | Biblioteca de normas: identidade, URL oficial e upload manual | feita |
| 2a-2 | Coletor (robots.txt, limite por host, fetch_log): no backend, fora da tela (Planalto e Senado bloqueiam) | feita |
| 2b | Divisão das normas por artigo e alerta de vigência | feita |
| 2c | Ligação itens × artigos e relatório de cobertura | próxima |

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

## Publicação (produção)

Mesmo modelo do FinMind. Em push para `main`, `.github/workflows/deploy.yml` gera as imagens
`ghcr.io/<owner>/edumind-backend` e `edumind-frontend` (só `linux/arm64`, num runner ARM nativo) e faz o deploy
por SSH na VM `servidor02` (Oracle Cloud, Ampere A1): `scripts/github-deploy.sh` + `scripts/deploy.sh`. O
`.github/workflows/ci.yml` roda os testes do backend (com um Postgres 16) e o build do frontend em todo push.

```text
servidor02
  /opt/apps/infra/postgres/   PostgreSQL 16 compartilhado (repositório servidor02-infra), rede Docker "db"
  /opt/apps/edumind/app/      este repositório; o .env de produção fica aqui (fora do git)
  /opt/apps/proxy/            Nginx Proxy Manager: edumind.weslab.com.br -> 127.0.0.1:8084, HTTPS (Let's Encrypt)
```

- **Compose:** `docker/compose.prod.yml`, só com as imagens publicadas (nunca builda na VM). O backend entra na rede
  externa `db` (`POSTGRES_HOST=postgres`); os PDFs e as normas ficam no volume `edumind_data` (`/app/data`). O
  frontend publica a porta só em `127.0.0.1:8084`: o acesso externo é pelo proxy, com HTTPS.
- **Deploy:** baixa as imagens, roda as migrations e o seeder (o administrador inicial só é criado se não houver
  nenhum) e só então sobe os containers, porque o backend consulta as tabelas ao iniciar.
- **Limites:** o nginx do frontend aceita uploads de até 51 MB e espera o backend até 300 s (a busca da URL oficial
  de uma norma leva até 180 s). No Nginx Proxy Manager, o host do EduMind precisa dos mesmos limites (aba Advanced):
  `client_max_body_size 51m; proxy_read_timeout 300s; proxy_send_timeout 300s;`.

### Primeira vez na VM

```bash
# 1. Banco: usuário e database "edumind" (mostra a senha uma única vez)
cd /opt/apps/infra/postgres && ./scripts/criar-app.sh edumind

# 2. Repositório (como o usuário deploy)
sudo -iu deploy
mkdir -p /opt/apps/edumind && cd /opt/apps/edumind && git clone https://github.com/WelersonEpora/EduMind.git app

# 3. .env de produção em /opt/apps/edumind/app/.env (ver .env.example):
#    NODE_ENV=production, TRUST_PROXY=2, FRONTEND_PORT=127.0.0.1:8084,
#    POSTGRES_* do passo 1, JWT_SECRET (aleatório e forte), GEMINI_API_KEY_FREE, GEMINI_API_KEY,
#    ADMIN_NOME, ADMIN_EMAIL e ADMIN_PASSWORD (só para criar o primeiro administrador; depois podem sair)
```

Depois: o host `edumind.weslab.com.br` no Nginx Proxy Manager (encaminhando para `127.0.0.1:8084`, com certificado
Let's Encrypt e os limites acima), o registro DNS apontando para a VM e os secrets do GitHub Actions no repositório
(os mesmos do FinMind): `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`, `GHCR_PAT` e `GHCR_USERNAME`.

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
