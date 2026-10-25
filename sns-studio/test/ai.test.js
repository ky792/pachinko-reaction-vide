'use strict';
// AI（有料）部分のテスト。実際のAPIには接続せず、偽のクライアントで確認する
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../core/ai-adapter');
const { core, rules, product, NOW } = require('./helpers');

function fakeClient(response) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => { calls.push(req); return response; } } }
  };
}

test('費用の確認がないと実行しない（課金の防止）', async () => {
  const client = fakeClient({});
  await assert.rejects(ai.generateWithAI(product, rules, { client }), (e) => {
    assert.equal(e.code, 'COST_NOT_CONFIRMED');
    assert.match(e.message, /有料/);
    return true;
  });
  assert.equal(client.calls.length, 0, 'APIは呼ばれていない');
});

test('APIキーがなければ分かりやすく止まる', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(ai.generateWithAI(product, rules, { confirmCost: true }), (e) => e.code === 'NO_API_KEY');
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('AIの出力も「下書き」になり、PR表記とチェックが適用される', async () => {
  const client = fakeClient({
    stop_reason: 'end_turn',
    usage: { input_tokens: 900, output_tokens: 600 },
    content: [{ type: 'text', text: JSON.stringify({ drafts: [
      { platform: 'x', key: 'summary', angle: '要点まとめ', text: 'ひのきのまな板、軽くて乾きやすい。' },
      { platform: 'threads', key: 'announce', angle: '告知・行動喚起', text: '【PR】絶対に長持ちするまな板です' },
      { platform: 'tiktok', key: 'summary', angle: '要点まとめ', text: '対象外' }
    ] }) }]
  });
  const res = await ai.generateWithAI(product, rules, { client, confirmCost: true, now: NOW, platforms: ['x', 'threads'] });
  assert.equal(res.drafts.length, 2);
  res.drafts.forEach((d) => {
    assert.equal(d.status, core.STATUS.DRAFT);
    assert.equal(d.generator, 'ai:claude-opus-5-5');
    assert.ok(d.text.startsWith('【PR】'));
  });
  assert.match(res.drafts[1].issues, /絶対/);
  const req = client.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.match(req.messages[0].content, /【PR】/);
});

test('AIが辞退した場合はエラーにする', async () => {
  const client = fakeClient({ stop_reason: 'refusal', content: [] });
  await assert.rejects(ai.generateWithAI(product, rules, { client, confirmCost: true }), /辞退/);
});

test('費用の目安を計算できる', () => {
  const e = ai.estimateCost({ items: 10, model: 'claude-opus-5-5' });
  assert.equal(e.inputTokens, 20000);
  assert.equal(e.outputTokens, 30000);
  assert.ok(Math.abs(e.usd - (20000 * 4 + 30000 * 20) / 1e6) < 1e-9);
  assert.match(ai.costNotice({ items: 1 }), /有料/);
  assert.equal(ai.estimateCost({ model: 'unknown-model' }).known, false);
});
