---
name: rag-search
description: ベクトルDBでホスティング知識を検索して回答する
allowed-tools: Bash(node *)
---

ChromaベクトルDBを検索して、結果をもとにユーザーの質問に回答してください。

検索コマンド:
```bash
cd "$(git rev-parse --show-toplevel)/chroma" && node search.js "$ARGUMENTS"
```

- 検索結果に含まれる情報だけをもとに回答すること
- 検索結果にない情報は「この知識ベースにはありません」と答えること
- どのドキュメントを参照したか明示すること
