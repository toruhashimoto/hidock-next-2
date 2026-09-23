// 名前空間をまたぐ訳語のブレを検出する。
//
// Phase 1 で、settings の説明文が「『低価値』または『ゴミ』のバッジが付く」と
// 書いているのに library の実バッジ名が「不要」だった、という実害のある
// 不一致が出た。個々の翻訳が正しくても、利用者は画面をまたいで使うため
// 揃っていないと困る。並行作業で名前空間を分けた以上、機械的に突き合わせる。
//
// 使い方: node term-audit.mjs [localesDir]

import fs from 'node:fs'
import path from 'node:path'

const base = process.argv[2] ?? 'D:/ClaudeCode/HiDock-NEXT2/apps/electron/src/i18n/locales'

/** 同じ概念に別の訳語が当たっていないか調べる語の組。 */
const SYNONYM_GROUPS = [
  ['文字起こし', '書き起こし', 'トランスクリプト'],
  ['録音', 'レコーディング'],
  ['会議', 'ミーティング'],
  ['項目', 'ソース', '素材'],
  ['話者', 'スピーカー', '発言者'],
  ['ゴミ箱', 'ごみ箱', 'トラッシュ'],
  ['削除', '消去', '除去'],
  ['成果物', 'アーティファクト', '生成物'],
  ['発言', 'ターン', '発話'],
  ['キャプチャ', '取り込み', 'キャプチャー'],
  ['ドッキング', 'ドック', '固定'],
  ['アクションアイテム', '対応事項', 'アクション項目'],
  ['デバイスのみ', 'デバイス上', 'デバイス内'],
  ['非表示', '閉じる', '却下'],
  ['長さ', '再生時間', '時間'],
  ['統合', 'マージ', '結合'],
  ['候補', 'サジェスト', '提案'],
  ['コンテキストグラフ', 'コンテキスト グラフ', '文脈グラフ'],
  ['引用', 'サイテーション', '出典'],
  ['担当者', 'オーナー', '所有者'],
  ['期限', '締切', '期日'],
]

/** 半角/全角の混在を調べる対。 */
const WIDTH_PAIRS = [
  ['（', '('],
  ['）', ')'],
  ['：', ':'],
  ['、', ', '],
]

function loadCatalogues(lang) {
  const dir = path.join(base, lang)
  const out = {}
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    out[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
  return out
}

const ja = loadCatalogues('ja')
const namespaces = Object.keys(ja).sort()

console.log(`名前空間 ${namespaces.length} 個: ${namespaces.join(', ')}`)
console.log(`合計キー数: ${namespaces.reduce((s, ns) => s + Object.keys(ja[ns]).length, 0)}`)
console.log()

// --- 同義語のブレ ---
console.log('=== 同義語のブレ（同じ概念に別の訳語） ===')
let drift = 0
for (const group of SYNONYM_GROUPS) {
  const hits = {}
  for (const term of group) {
    const where = namespaces.filter((ns) =>
      Object.values(ja[ns]).some((v) => typeof v === 'string' && v.includes(term))
    )
    if (where.length) hits[term] = where
  }
  const used = Object.keys(hits)
  if (used.length > 1) {
    drift++
    console.log(`  [${used.join(' / ')}]`)
    for (const [term, where] of Object.entries(hits)) {
      console.log(`      ${term.padEnd(14)} → ${where.join(', ')}`)
    }
  }
}
if (!drift) console.log('  ブレなし')
console.log()

// --- 半角/全角の混在 ---
console.log('=== 半角/全角の混在 ===')
for (const [full, half] of WIDTH_PAIRS) {
  const f = namespaces.filter((ns) => Object.values(ja[ns]).some((v) => typeof v === 'string' && v.includes(full)))
  const h = namespaces.filter((ns) => Object.values(ja[ns]).some((v) => typeof v === 'string' && v.includes(half)))
  if (f.length && h.length) {
    console.log(`  ${full} と ${half.trim() || half} が混在`)
    console.log(`      ${full} → ${f.join(', ')}`)
    console.log(`      ${half.trim() || half} → ${h.join(', ')}`)
  }
}
console.log()

// --- 文体の混在（敬体と常体） ---
console.log('=== 文体の混在（同一名前空間内に「です・ます」と断定形） ===')
for (const ns of namespaces) {
  const vals = Object.entries(ja[ns]).filter(([, v]) => typeof v === 'string' && v.length > 12)
  const polite = vals.filter(([, v]) => /(です|ます)[。、]?$/.test(v)).length
  const plain = vals.filter(([, v]) => /(である|だ|する|した)。$/.test(v)).length
  if (polite && plain) console.log(`  ${ns}: 敬体 ${polite} / 常体 ${plain} — 要確認`)
}
console.log()

// --- 未訳の疑い（値が英語のまま） ---
console.log('=== 日本語カタログに英語だけの値（固有名詞以外は要確認） ===')
const PROPER = /^(Gemini|Ollama|HiDock|Microsoft 365|Slack|Outlook|JSON|PDF|Markdown|English|ASR|RAG|USB|ICS|Claude Code|Codex|Kiro|v?\{\{[^}]+\}\}|[\s\-–—·•/|:]+)$/
for (const ns of namespaces) {
  const suspects = Object.entries(ja[ns])
    .filter(([, v]) => typeof v === 'string' && v.trim() && !/[ぁ-んァ-ヶ一-龯]/.test(v) && !PROPER.test(v.trim()))
  if (suspects.length) {
    console.log(`  ${ns}: ${suspects.length} 件`)
    for (const [k, v] of suspects.slice(0, 6)) console.log(`      ${k} = ${JSON.stringify(v)}`)
    if (suspects.length > 6) console.log(`      … 他 ${suspects.length - 6} 件`)
  }
}
