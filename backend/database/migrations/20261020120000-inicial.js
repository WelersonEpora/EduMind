"use strict";

// Schema inicial do EduMind (etapas 1 e 2 do MVP).
// Convenções: ids uuid gerados na aplicação (crypto.randomUUID), snake_case, datas em timestamptz (UTC),
// JSON em jsonb, created_at/updated_at em toda tabela, exceto edital_pagina (texto bruto, nunca alterado).

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

// Restrição CHECK com a lista de valores aceitos numa coluna.
function valoresAceitos(queryInterface, tabela, coluna, valores, transaction) {
  return queryInterface.addConstraint(tabela, {
    type: "check",
    name: `ck_${tabela}_${coluna}`,
    fields: [coluna],
    where: { [coluna]: valores },
    transaction
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const fk = (tabela, onDelete) => ({ references: { model: tabela, key: "id" }, ...(onDelete && { onDelete }) });

      // Etapa 1: edital ---------------------------------------------------------------

      await queryInterface.createTable(
        "edital",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          arquivo_nome: { type: Sequelize.TEXT, allowNull: false },
          arquivo_sha256: { type: Sequelize.STRING(64), allowNull: false, unique: true },
          arquivo_bytes: { type: Sequelize.INTEGER, allowNull: false },
          total_paginas: { type: Sequelize.INTEGER, allowNull: false },
          // Preenchidos pela extração (etapa 1b). Nulos até lá.
          banca: { type: Sequelize.TEXT },
          orgao: { type: Sequelize.TEXT },
          cargo: { type: Sequelize.TEXT },
          data_publicacao: { type: Sequelize.DATEONLY },
          // Blocos, quantidades por disciplina, regras de corte e discursiva, cada item com página e trecho.
          metadados: { type: Sequelize.JSONB },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "texto_extraido" },
          erro: { type: Sequelize.TEXT },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await valoresAceitos(queryInterface, "edital", "status", ["texto_extraido", "extraindo", "extraido", "erro_extracao"], transaction);

      await queryInterface.createTable(
        "edital_pagina",
        {
          edital_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true, ...fk("edital", "CASCADE") },
          numero: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
          texto: { type: Sequelize.TEXT, allowNull: false }
        },
        opcoes
      );

      // Árvore do conteúdo programático: bloco > disciplina > assunto > subassunto.
      await queryInterface.createTable(
        "edital_item",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          edital_id: { type: Sequelize.UUID, allowNull: false, ...fk("edital", "CASCADE") },
          parent_id: { type: Sequelize.UUID, ...fk("edital_item", "CASCADE") },
          nivel: { type: Sequelize.STRING(20), allowNull: false },
          ordem: { type: Sequelize.INTEGER, allowNull: false },
          texto: { type: Sequelize.TEXT, allowNull: false },
          // Trecho literal do edital devolvido pela IA e a página que ela citou.
          source_excerpt: { type: Sequelize.TEXT, allowNull: false },
          pagina: { type: Sequelize.INTEGER, allowNull: false },
          // Resultado da busca do trecho na página citada (não depende da IA).
          verificado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          // Quando o trecho não está na página citada mas aparece em outra.
          pagina_encontrada: { type: Sequelize.INTEGER },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "rascunho" },
          status_em: { type: Sequelize.DATE },
          editado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await valoresAceitos(queryInterface, "edital_item", "nivel", ["bloco", "disciplina", "assunto", "subassunto"], transaction);
      await valoresAceitos(queryInterface, "edital_item", "status", ["rascunho", "aprovado", "rejeitado"], transaction);
      await queryInterface.addIndex("edital_item", ["edital_id", "parent_id", "ordem"], { name: "idx_edital_item_edital", transaction });

      // Etapa 2: normas (biblioteca compartilhada entre editais) -------------------------

      await queryInterface.createTable(
        "norma",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          // Identidade estável da norma: "lei:9099:1995", "decreto-lei:2848:1940".
          chave: { type: Sequelize.TEXT, allowNull: false, unique: true },
          tipo: { type: Sequelize.TEXT, allowNull: false },
          numero: { type: Sequelize.TEXT },
          ano: { type: Sequelize.TEXT },
          nome: { type: Sequelize.TEXT, allowNull: false },
          esfera: { type: Sequelize.STRING(20) },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await valoresAceitos(queryInterface, "norma", "esfera", ["federal", "estadual", "tribunal"], transaction);

      // Norma citada por um item de legislação. A expansão dos artigos é feita por código
      // (parsers/artigos.parser.js), nunca pela IA.
      await queryInterface.createTable(
        "item_norma",
        {
          item_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true, ...fk("edital_item", "CASCADE") },
          tipo: { type: Sequelize.TEXT },
          numero: { type: Sequelize.TEXT },
          ano: { type: Sequelize.TEXT },
          nome: { type: Sequelize.TEXT },
          // Trecho dos artigos como está no edital ("artigos 293 a 305; 307; ...").
          artigos_texto: { type: Sequelize.TEXT },
          // Saída do parser: { artigos, intervalos, avisos }.
          artigos: { type: Sequelize.JSONB },
          norma_id: { type: Sequelize.UUID, ...fk("norma") },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );

      // Cada coleta ou upload com conteúdo diferente vira uma versão nova. Cada edital usa a versão mais
      // próxima da sua data de publicação.
      await queryInterface.createTable(
        "norma_versao",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          norma_id: { type: Sequelize.UUID, allowNull: false, ...fk("norma", "CASCADE") },
          url: { type: Sequelize.TEXT },
          origem: { type: Sequelize.STRING(20), allowNull: false },
          status: { type: Sequelize.STRING(30), allowNull: false },
          // Data da alteração mais recente encontrada nas notas de redação, e com que precisão ela é conhecida
          // (com precisão "ano", a data é 1º de janeiro daquele ano).
          data_versao: { type: Sequelize.DATEONLY },
          data_versao_precisao: { type: Sequelize.STRING(10) },
          acessado_em: { type: Sequelize.DATE },
          sha256: { type: Sequelize.STRING(64) },
          arquivo_caminho: { type: Sequelize.TEXT },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await valoresAceitos(queryInterface, "norma_versao", "origem", ["coleta", "upload"], transaction);
      await valoresAceitos(
        queryInterface,
        "norma_versao",
        "status",
        ["pendente", "obtido", "vazio", "vedado_robots", "falhou", "upload_manual_necessario", "upload_recebido"],
        transaction
      );
      await valoresAceitos(queryInterface, "norma_versao", "data_versao_precisao", ["dia", "ano"], transaction);
      await queryInterface.addIndex("norma_versao", ["norma_id", "created_at"], { name: "idx_norma_versao_norma", transaction });

      await queryInterface.createTable(
        "norma_artigo",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          versao_id: { type: Sequelize.UUID, allowNull: false, ...fk("norma_versao", "CASCADE") },
          // "313-A"
          numero: { type: Sequelize.TEXT, allowNull: false },
          ordem: { type: Sequelize.INTEGER, allowNull: false },
          caput: { type: Sequelize.TEXT },
          paragrafos: { type: Sequelize.JSONB },
          incisos: { type: Sequelize.JSONB },
          // Notas de redação mantidas como vieram ("Redação dada pela Lei nº ...").
          notas: { type: Sequelize.JSONB },
          revogado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          texto_bruto: { type: Sequelize.TEXT, allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addConstraint("norma_artigo", { type: "unique", name: "uq_norma_artigo_versao_numero", fields: ["versao_id", "numero"], transaction });

      // Ligação de cada artigo pedido pelo edital com o artigo encontrado no texto da norma.
      await queryInterface.createTable(
        "item_artigo",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          item_id: { type: Sequelize.UUID, allowNull: false, ...fk("edital_item", "CASCADE") },
          artigo_pedido: { type: Sequelize.TEXT, allowNull: false },
          origem: { type: Sequelize.STRING(20), allowNull: false },
          norma_artigo_id: { type: Sequelize.UUID, ...fk("norma_artigo") },
          situacao: { type: Sequelize.STRING(20), allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await valoresAceitos(queryInterface, "item_artigo", "origem", ["explicito", "intervalo", "letra_no_intervalo"], transaction);
      await valoresAceitos(queryInterface, "item_artigo", "situacao", ["encontrado", "revogado", "faltando"], transaction);
      await queryInterface.addConstraint("item_artigo", { type: "unique", name: "uq_item_artigo_item_pedido", fields: ["item_id", "artigo_pedido"], transaction });

      // Todo acesso do coletor, inclusive a leitura do robots.txt e os acessos não feitos por vedação.
      await queryInterface.createTable(
        "fetch_log",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          url: { type: Sequelize.TEXT, allowNull: false },
          host: { type: Sequelize.TEXT, allowNull: false },
          acessado_em: { type: Sequelize.DATE, allowNull: false },
          robots_permitido: { type: Sequelize.BOOLEAN },
          http_status: { type: Sequelize.INTEGER },
          sha256: { type: Sequelize.STRING(64) },
          bytes: { type: Sequelize.INTEGER },
          status: { type: Sequelize.STRING(30), allowNull: false },
          erro: { type: Sequelize.TEXT },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("fetch_log", ["host", "acessado_em"], { name: "idx_fetch_log_host", transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const tabela of ["fetch_log", "item_artigo", "norma_artigo", "norma_versao", "item_norma", "norma", "edital_item", "edital_pagina", "edital"]) {
        await queryInterface.dropTable(tabela, { transaction });
      }
    });
  }
};
