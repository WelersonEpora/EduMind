"use strict";

// Só as tabelas que o código já usa têm model. As demais ganham o seu na etapa que as usar.
// Depois de chamar, os models ficam em sequelize.models.
module.exports = function definirModelos(sequelize) {
  const Edital = require("./edital")(sequelize);
  const EditalPagina = require("./editalPagina")(sequelize);
  const EditalItem = require("./editalItem")(sequelize);
  const ItemNorma = require("./itemNorma")(sequelize);
  const Norma = require("./norma")(sequelize);
  const NormaVersao = require("./normaVersao")(sequelize);
  const NormaArtigo = require("./normaArtigo")(sequelize);
  const Prova = require("./prova")(sequelize);
  const ProvaArquivo = require("./provaArquivo")(sequelize);
  require("./provaPagina")(sequelize);
  const EditalProva = require("./editalProva")(sequelize);
  const ProvaQuestao = require("./provaQuestao")(sequelize);
  const QuestaoArtigo = require("./questaoArtigo")(sequelize);
  const Usuario = require("./usuario")(sequelize);
  const Equipe = require("./equipe")(sequelize);
  const Membro = require("./membro")(sequelize);
  const EditalAluno = require("./editalAluno")(sequelize);
  require("./resposta")(sequelize);
  require("./simulado")(sequelize);

  Membro.belongsTo(Usuario, { foreignKey: "usuario_id", as: "usuario" });
  Membro.belongsTo(Equipe, { foreignKey: "equipe_id", as: "equipe" });
  Usuario.hasMany(Membro, { foreignKey: "usuario_id", as: "vinculos" });

  EditalAluno.belongsTo(Edital, { foreignKey: "edital_id", as: "edital" });

  Edital.hasMany(EditalPagina, { foreignKey: "edital_id", as: "paginas" });
  EditalPagina.belongsTo(Edital, { foreignKey: "edital_id" });
  Edital.hasMany(EditalItem, { foreignKey: "edital_id", as: "itens" });
  EditalItem.hasMany(ItemNorma, { foreignKey: "item_id", as: "normas" });
  ItemNorma.belongsTo(EditalItem, { foreignKey: "item_id", as: "item" });
  EditalItem.belongsTo(Edital, { foreignKey: "edital_id", as: "edital" });
  ItemNorma.belongsTo(Norma, { foreignKey: "norma_id", as: "norma" });
  Norma.hasMany(NormaVersao, { foreignKey: "norma_id", as: "versoes" });
  NormaVersao.hasMany(NormaArtigo, { foreignKey: "versao_id", as: "artigos" });
  Prova.hasMany(ProvaArquivo, { foreignKey: "prova_id", as: "arquivos" });
  ProvaArquivo.belongsTo(Prova, { foreignKey: "prova_id", as: "daProva" });
  Prova.hasMany(EditalProva, { foreignKey: "prova_id", as: "editais" });
  Prova.hasMany(ProvaQuestao, { foreignKey: "prova_id", as: "questoes" });
  ProvaQuestao.hasMany(QuestaoArtigo, { foreignKey: "questao_id", as: "referencias" });
  QuestaoArtigo.belongsTo(Norma, { foreignKey: "norma_id", as: "norma" });
  QuestaoArtigo.belongsTo(ProvaQuestao, { foreignKey: "questao_id", as: "questao" });
};
