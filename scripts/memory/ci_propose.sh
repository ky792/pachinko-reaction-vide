#!/usr/bin/env bash
# GitHub Actions 用：記憶の候補を集めて正本（main）に照合し、ブランチ memory/<名前> に反映して PR を出す
#   ci_propose.sh issue <番号>            … Issue 本文（ISSUE_BODY）から
#   ci_propose.sh text <名前>             … 手入力（INPUT_TEXT）から
#   ci_propose.sh inbox <memory-inbox/…>  … そのブランチの memory/inbox/ のファイル（.json＝候補、.md/.txt＝メモ）から
# 必要な環境変数：GH_TOKEN, GITHUB_REPOSITORY。main には書かない。
set -euo pipefail
MODE=$1; ARG=$2
BASE=main
git fetch -q --depth 1 origin main
git cat-file -e origin/main:memory/store.json 2>/dev/null || BASE=feat/shared-memory   # 仕組みのPRがマージ前のときだけ
git fetch -q --depth 1 origin "$BASE"
git checkout -q -f -B nbmem-work "origin/$BASE"
rm -rf memory/inbox; mkdir -p memory/inbox

case "$MODE" in
  issue) printf '%s' "${ISSUE_BODY:-}" > /tmp/in.txt
         python scripts/memory/nbmem.py extract /tmp/in.txt --surface "github-issue#$ARG" --name "issue-$ARG"
         BR="memory/issue-$ARG"; ISSUE_NO=$ARG ;;
  text)  printf '%s' "${INPUT_TEXT:-}" > /tmp/in.txt
         python scripts/memory/nbmem.py extract /tmp/in.txt --surface manual --name "manual-$ARG"
         BR="memory/manual-$ARG"; ISSUE_NO= ;;
  inbox) git fetch -q --depth 1 origin "$ARG"
         git checkout "origin/$ARG" -- memory/inbox 2>/dev/null || true
         for f in memory/inbox/*.md memory/inbox/*.txt; do
           [ -f "$f" ] || continue
           python scripts/memory/nbmem.py extract "$f" --surface "memo:$(basename "$f")" --name "memo-$(basename "${f%.*}")"
           rm -f "$f"
         done
         BR="memory/from-${ARG#memory-inbox/}"; ISSUE_NO= ;;
esac
ls memory/inbox || true
python scripts/memory/nbmem.py ingest --clear | tee /tmp/result.txt
python scripts/memory/nbmem.py check
git checkout -q -- memory/inbox/.gitkeep 2>/dev/null || touch memory/inbox/.gitkeep

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A memory
if git diff --cached --quiet; then
  MSG="記憶の候補はありませんでした（すでに同じ内容がある・残す情報ではない・個人情報らしきものを含む のどれか）。"
else
  git checkout -q -b "$BR"
  git commit -q -m "memory: 記憶の候補を反映（要確認）"
  git push -q -f origin "$BR"
  { printf '共有記憶の候補を正本に照合しました。**マージで確定**します。矛盾は上書きせず memory/CONFLICTS.md に載せています。\n\n```\n'
    cat /tmp/result.txt; printf '```\n'
    [ -n "$ISSUE_NO" ] && echo "Issue #$ISSUE_NO から"
    [ "$MODE" = inbox ] && echo "ブランチ $ARG から"; } > /tmp/body.md
  URL=$(gh pr create --base "$BASE" --head "$BR" --title "共有記憶の更新（要確認）" --body-file /tmp/body.md 2>/dev/null \
        || gh pr view "$BR" --json url -q .url 2>/dev/null || true)
  [ -n "$URL" ] || URL="https://github.com/$GITHUB_REPOSITORY/compare/$BASE...$BR?expand=1 （Actions から PR を作れない設定のため、ここから PR を作ってください）"
  MSG="記憶の候補を PR にしました：$URL"
fi
echo "$MSG"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$MSG" >> "$GITHUB_STEP_SUMMARY"
if [ -n "${ISSUE_NO:-}" ]; then gh issue comment "$ISSUE_NO" --body "$MSG"; fi
