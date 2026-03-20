# vector-db-showdown

Chroma・pgvector・Pineconeに同じデータを入れて、同じクエリで検索して、結果を比べる実験リポジトリ。

**結果: 3つとも検索順位が完全一致した。**

ベクトルDBの仕組み、セットアップ、検索の書き方を3つ並べて比較できる。どれか1つだけ試すのもOK。

## 技術スタック

- **Runtime**: Node.js 18+
- **Embeddings**: [Voyage AI](https://voyageai.com/) `voyage-3-lite`（512次元）
- **ベクトルDB**: [Chroma](https://www.trychroma.com/) / [pgvector](https://github.com/pgvector/pgvector) / [Pinecone](https://www.pinecone.io/)
- **コンテナ**: Docker（Chroma・pgvector）

## やってみる

```bash
git clone https://github.com/shumatsumonobu/vector-db-showdown.git
cd vector-db-showdown
```

### 必要なもの

- Node.js 18+
- Docker（Chroma・pgvector用）
- [Voyage AI](https://dash.voyageai.com/) のAPIキー（Embeddings生成用、全DB共通）
- [Pinecone](https://www.pinecone.io/) のアカウント（Pineconeを試す場合のみ。無料枠あり）

### Chroma（一番簡単）

```bash
# 1. DockerでベクトルDBを起動
docker run -d -p 8000:8000 chromadb/chroma

# 2. セットアップ
cd chroma
cp .env.example .env   # Voyage AIのAPIキーを設定
npm install

# 3. データ投入 → 検索
node ingest.js
node search.js "無料でサイトを公開したい"

cd ..
```

### pgvector

```bash
# 1. PostgreSQL + pgvectorをDockerで起動
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17

# 2. セットアップ
cd pgvector
cp .env.example .env   # Voyage AIのAPIキーとDB接続情報を設定
npm install

# 3. データ投入 → 検索
node ingest.js
node search.js "無料でサイトを公開したい"

cd ..
```

### Pinecone

```bash
# 1. セットアップ（Dockerは不要、クラウドに接続）
cd pinecone
cp .env.example .env   # Voyage AIとPineconeのAPIキーを設定
npm install

# 2. データ投入 → 検索（初回はIndex作成に15秒ほど待つ）
node ingest.js
node search.js "無料でサイトを公開したい"

cd ..
```

### 3DB比較

3つとも起動した状態で:

```bash
# ルートディレクトリで
cp .env.example .env   # Voyage AI・Pinecone・PostgreSQLの接続情報を設定
npm install
node compare.js
```

5つのクエリを3DBに投げて、結果を `results/comparison.txt` に保存する。

## ディレクトリ構成

```
chroma/            Chroma（ローカルベクトルDB）
  ingest.js          データ投入
  search.js          検索
  documents.json     サンプルデータ（16件）
  .env.example       APIキーのテンプレート

pgvector/          PostgreSQL + pgvector（RDB拡張）
  ingest.js          データ投入（テーブル作成含む）
  search.js          SQL検索
  documents.json     サンプルデータ（16件）
  .env.example       APIキー・DB接続情報のテンプレート

pinecone/          Pinecone（クラウドベクトルDB）
  ingest.js          データ投入（Index作成含む）
  search.js          検索
  documents.json     サンプルデータ（16件）
  .env.example       APIキーのテンプレート

compare.js         3DB横並び比較スクリプト
.env.example       compare.js用のテンプレート
results/           検索結果・比較結果
```

## サンプルデータ

ホスティングサービスの選定ナレッジ16件（Vercel、Cloudflare Pages、Fly.io、Supabaseなど）。各DBフォルダの `documents.json` に同じデータが入ってる。

## おまけ: Claude Codeのスキルにする

`.claude/skills/rag-search/` にスキルが入ってる。Claude Codeで `/rag-search 無料でサイトを公開したい` と打つと、Chromaで検索した結果をもとにClaudeが回答してくれる。

## Author

**shumatsumonobu** — [GitHub](https://github.com/shumatsumonobu) / [X](https://x.com/shumatsumonobu) / [Facebook](https://www.facebook.com/takuya.motoshima.7)

## License

[MIT](LICENSE)
