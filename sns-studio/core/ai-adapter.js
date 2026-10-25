/*
 * 任意：AI（Claude API）で投稿案を作るアダプタ。Node（CLI）専用。
 * - 既定では使われない。CLI で --ai と --confirm-cost を両方付けたときだけ動く
 * - 有料（従量課金）。APIキーは利用者が自分で発行し、環境変数 ANTHROPIC_API_KEY に入れる
 * - AIの出力も必ず「下書き」になり、人の承認なしには出力されない
 */
'use strict';

const core = require('./sns-core');

// 料金は 2026-10 時点の公表値（1M トークンあたり USD）。利用前に公式の料金ページで再確認すること
const PRICING = {
  'claude-opus-5-5': { input: 4.0, output: 20.0 },
  'claude-sonnet-5-5': { input: 2.0, output: 10.0 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 }
};
const DEFAULT_MODEL = 'claude-opus-5-5';
const PRICING_CHECKED = '2026-10';
const USD_JPY = 150; // 概算用の固定レート

// 1件（記事・商品1つ → 3SNS×3案）あたりの目安トークン数
const TYPICAL_TOKENS = { input: 2000, output: 3000 };

function estimateCost(opts) {
  const o = opts || {};
  const model = o.model || DEFAULT_MODEL;
  const price = PRICING[model];
  if (!price) return { model, known: false, usd: null, jpy: null };
  const inTok = (o.items || 1) * (o.inputTokens || TYPICAL_TOKENS.input);
  const outTok = (o.items || 1) * (o.outputTokens || TYPICAL_TOKENS.output);
  const usd = (inTok * price.input + outTok * price.output) / 1e6;
  return { model, known: true, inputTokens: inTok, outputTokens: outTok, usd, jpy: Math.ceil(usd * USD_JPY) };
}

function costNotice(opts) {
  const e = estimateCost(opts);
  const lines = [
    '【AI生成は有料です】Claude API（Anthropic）の従量課金が発生します。',
    `モデル: ${e.model}` + (e.known ? `（入力 $${PRICING[e.model].input} / 出力 $${PRICING[e.model].output} ／100万トークン、${PRICING_CHECKED}時点）` : '（料金表未登録：公式サイトで確認してください）')
  ];
  if (e.known) lines.push(`目安: ${opts && opts.items ? opts.items : 1}件で 約$${e.usd.toFixed(3)}（約${e.jpy}円、1ドル=${USD_JPY}円換算）。実際の金額は文章量で変わります。`);
  lines.push('APIキーの発行・支払い設定は利用者ご自身のAnthropicアカウントで行います。このデモが勝手に課金することはありません。');
  lines.push('無料で試す場合は --ai を付けずに実行してください（テンプレート生成）。');
  return lines.join('\n');
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['drafts'],
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'key', 'angle', 'text'],
        properties: {
          platform: { type: 'string', enum: Object.keys(core.PLATFORMS) },
          key: { type: 'string', enum: ['summary', 'question', 'announce'] },
          angle: { type: 'string' },
          text: { type: 'string' }
        }
      }
    }
  }
};

function buildPrompt(src, platforms, rules) {
  const specs = platforms.map((p) => {
    const c = core.PLATFORMS[p];
    return `- ${p}（${c.label}）: ${c.limit}字以内${c.weighted ? '（全角は2字・URLは23字として数える）' : ''}、ハッシュタグ${c.maxHashtags}個まで`;
  }).join('\n');
  const system = [
    'あなたは日本語のSNS運用担当者です。入力された記事・商品情報だけを根拠に、投稿の下書きを作ります。',
    '入力にない事実・数字・効果を足さないでください。誇大・断定表現は使わないでください。',
    `次の言葉は使わないでください: ${(rules.ng_words || []).join('、')}`,
    '各SNSについて 3 つの切り口で1案ずつ作ります: summary=要点まとめ、question=共感・問いかけ、announce=告知・行動喚起。',
    'angle には切り口の日本語名（要点まとめ／共感・問いかけ／告知・行動喚起）を入れてください。'
  ].join('\n');
  const user = [
    '## SNSごとの条件', specs,
    src.is_pr ? `\n## 広告表記\nこれは広告案件です。本文の先頭に必ず「${core.PR_LABEL}」を付けてください。` : '',
    '\n## 入力', JSON.stringify(src, null, 2)
  ].join('\n');
  return { system, user };
}

/**
 * @param {object} input 記事・商品情報
 * @param {object} rules templates.json
 * @param {object} opts { platforms, now, model, confirmCost, client }
 *   client はテスト用に差し替え可能（未指定時は @anthropic-ai/sdk を読み込む）
 */
async function generateWithAI(input, rules, opts) {
  const o = opts || {};
  if (o.confirmCost !== true) {
    const err = new Error(costNotice({ model: o.model }) + '\n\n費用を確認したうえで --confirm-cost を付けて再実行してください。');
    err.code = 'COST_NOT_CONFIRMED';
    throw err;
  }
  const src = core.normalizeSource(input);
  const platforms = o.platforms && o.platforms.length ? o.platforms : Object.keys(core.PLATFORMS);
  const model = o.model || DEFAULT_MODEL;
  let client = o.client;
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      const err = new Error('ANTHROPIC_API_KEY が設定されていません。AI生成を使わない場合は --ai を外してください（無料のテンプレート生成）。');
      err.code = 'NO_API_KEY';
      throw err;
    }
    let Anthropic;
    try {
      Anthropic = require('@anthropic-ai/sdk');
    } catch (e) {
      const err = new Error('AI生成には公式SDKが必要です: npm install @anthropic-ai/sdk');
      err.code = 'NO_SDK';
      throw err;
    }
    client = new (Anthropic.default || Anthropic)();
  }
  const prompt = buildPrompt(src, platforms, rules);
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }]
  });
  if (response.stop_reason === 'refusal') throw new Error('AIが生成を辞退しました。入力内容を見直すか、テンプレート生成を使ってください。');
  if (response.stop_reason === 'max_tokens') throw new Error('AIの出力が途中で切れました。もう一度実行してください。');
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  let parsed;
  try {
    parsed = JSON.parse(textBlock ? textBlock.text : '');
  } catch (e) {
    throw new Error('AIの出力を読み取れませんでした（JSON形式ではありません）。');
  }
  const drafts = (parsed.drafts || [])
    .filter((d) => platforms.includes(d.platform))
    .map((d) => {
      let text = String(d.text).trim();
      if (src.is_pr && !text.startsWith(core.PR_LABEL)) text = core.PR_LABEL + text;
      return core.makeDraft(src, { platform: d.platform, key: d.key, angle: d.angle }, text, 'ai:' + model, rules, o.now || '');
    });
  return { drafts, usage: response.usage || null, estimate: estimateCost({ model }) };
}

module.exports = { PRICING, DEFAULT_MODEL, PRICING_CHECKED, estimateCost, costNotice, buildPrompt, generateWithAI, OUTPUT_SCHEMA };
