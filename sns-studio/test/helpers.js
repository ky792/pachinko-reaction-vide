'use strict';
const core = require('../core/sns-core');
const rules = require('../core/templates.json');
const article = require('../samples/article.json');
const product = require('../samples/product.json');

const NOW = '2026-10-25T10:00:00+09:00';

function fixedDrafts() {
  return [article, product].flatMap((s) => core.generateDrafts(s, rules, { now: NOW }));
}

module.exports = { core, rules, article, product, NOW, fixedDrafts };
