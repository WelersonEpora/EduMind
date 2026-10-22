"use strict";

// "AAAA-MM-DD" que é uma data de verdade (2025-02-30 não é).
function dataValida(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

module.exports = { dataValida };
