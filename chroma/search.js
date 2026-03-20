// Chromaクライアント（DBサーバーに接続するためのライブラリ）
const { ChromaClient } = require("chromadb");
// .envファイルからAPIキーを読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";
const COLLECTION_NAME = "hosting-knowledge";

/**
 * テキスト1件をベクトルに変換する
 * ingest.jsのgetEmbeddingsは複数件まとめて変換、こっちは1件だけ
 */
async function getEmbedding(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Voyage AI API error: ${res.status} ${error}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  // コマンドライン引数から検索クエリを取得
  const query = process.argv[2];
  if (!query) {
    console.log("使い方: node search.js \"検索クエリ\"");
    process.exit(1);
  }

  // 1. Chromaサーバーに接続してコレクションを取得
  const client = new ChromaClient();
  const collection = await client.getOrCreateCollection({ name: COLLECTION_NAME });

  // 2. 検索クエリをベクトルに変換（投入時と同じVoyage AIを使う）
  console.log(`クエリ: "${query}"`);
  console.log("Voyage AI でembedding生成中...\n");
  const queryEmbedding = await getEmbedding(query);

  // 3. ベクトルの近さで検索（上位5件）
  //    クエリのベクトルに近いドキュメントが返ってくる
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 5,
  });

  // 4. 結果を表示
  console.log("--- 検索結果 ---\n");
  for (let i = 0; i < results.ids[0].length; i++) {
    const distance = results.distances[0][i];
    // distanceが小さい = 近い = 関連度が高い。1から引いてスコアにする
    const score = (1 - distance).toFixed(4);
    console.log(`#${i + 1} [スコア: ${score}] ${results.ids[0][i]}`);
    console.log(`   ${results.documents[0][i].slice(0, 100)}...`);
    console.log(`   メタデータ: ${JSON.stringify(results.metadatas[0][i])}`);
    console.log();
  }
}

main().catch(console.error);
