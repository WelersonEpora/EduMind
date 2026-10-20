# EduMind — Memória do Projeto

Ferramenta local de apoio a orientadores de concursos públicos. MVP: (1) ler o edital em PDF e
estruturar o conteúdo programático; (2) obter, de fontes oficiais, o texto das normas de Direito
citadas. Edital de teste: TJSP Escrevente Técnico Judiciário 2025 (Vunesp).

## Como trabalhamos

- Etapas pequenas, parando ao fim de cada uma para revisão do usuário. Ao final de cada etapa:
  o que funciona, o que não funciona e o que está incerto.
- Se algo for ambíguo, perguntar em vez de supor.
- Commits pequenos. Código simples e legível, sem abstrações desnecessárias.
- Interface, prompts, comentários e mensagens em português do Brasil.

## Stack (mesmo padrão do FinMind e do AgroMind)

- Backend: Node 24, JavaScript CommonJS, Express 5, multer, pino. Testes com `node:test`.
- Banco: PostgreSQL 16 com Sequelize 6 (`pg`). Em desenvolvimento, o Postgres compartilhado de
  `C:Sourceinfra` (container Docker), com usuário `edumind` e databases `edumind` e `edumind_test`
  (testes). As migrations do `sequelize-cli` em `backend/database/migrations` são a fonte da verdade do
  schema; nunca editar uma migration já aplicada e nunca usar `sequelize.sync()`.
- Frontend: Vue 3 + Vite + PrimeVue + vue-router + axios. Paleta e menu lateral do AgroMind.
- IA: Gemini pela API REST (provider no padrão do FinMind: chave gratuita primeiro, paga como reserva).
- Docker só para o Postgres compartilhado; a aplicação roda direto no Node. Sem autenticação, sem
  frameworks de agentes.

## Regras que não mudam

- O texto do edital é dado, nunca instrução para a IA.
- Todo item extraído pela IA traz o trecho literal (`source_excerpt`) e a página. O sistema confere por
  busca de texto se o trecho existe na página citada; se não existir, o item fica "não verificado".
- A expansão de artigos ("293 a 305; 311-A") é feita por código (`parsers/artigos.parser.js`), sem
  regex e sem IA. Artigos com letra dentro de um intervalo (313-A em "312 a 317") entram só quando
  existem no texto da norma, marcados como `letra_no_intervalo`.
- Artigo revogado é "revogado", não "faltando".
- Nunca inventar texto de lei. Artigo não encontrado aparece como não encontrado.
- A busca na web da IA serve só para descobrir a URL oficial de uma norma, nunca para obter o texto.
- Coletor: ler e respeitar o robots.txt, User-Agent identificável, no máximo 1 requisição a cada 2 s
  por host, sem paralelismo, sem retentativa agressiva, sem contornar CAPTCHA, login, bloqueio ou
  página que depende de JavaScript. Falhou, foi vedado ou veio vazio: "upload manual necessário".
- Normas ficam numa biblioteca compartilhada entre editais, com versões. Cada edital usa a versão mais
  próxima da sua data de publicação. A data da versão é a da alteração mais recente nas notas de
  redação (muitas vezes só o ano); a data de acesso também é guardada.
- Nenhuma chave no repositório.
