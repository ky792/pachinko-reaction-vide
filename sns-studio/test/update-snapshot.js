#!/usr/bin/env node
// 固定入力（samples/）→ 固定出力（test/fixtures/expected_drafts.json）を作り直す。テンプレートを意図して変えたときだけ使う
'use strict';
const fs = require('fs');
const path = require('path');
const { fixedDrafts } = require('./helpers');

const out = path.join(__dirname, 'fixtures', 'expected_drafts.json');
fs.writeFileSync(out, JSON.stringify(fixedDrafts(), null, 2) + '\n');
console.log('更新: ' + path.relative(process.cwd(), out));
