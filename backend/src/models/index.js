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
  Prova.hasMany(EditalProva, { foreignKey: "prova_id", as: "editais" });
};
