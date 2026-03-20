// PostgreSQLクライアント（DBサーバーに接続するためのライブラリ）
const { Client } = require("pg");
// .envファイルからAPIキーとDB接続情報を読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";

/**
 * テキスト1件をベクトルに変換する
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

  // 1. 検索クエリをベクトルに変換（投入時と同じVoyage AIを使う）
  console.log(`クエリ: "${query}"`);
  console.log("Voyage AI でembedding生成中...\n");
  const queryEmbedding = await getEmbedding(query);

  // 2. PostgreSQLに接続
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 3. ベクトルの近さで検索（上位5件）
  //    <=> はpgvectorの「コサイン距離」演算子
  //    ORDER BY embedding <=> query で「近い順」にソートできる — これがpgvectorの核
  const result = await client.query(
    `SELECT id, text, metadata, embedding <=> $1 AS distance
     FROM documents
     ORDER BY embedding <=> $1
     LIMIT 5`,
    [`[${queryEmbedding.join(",")}]`]
  );

  // 4. 結果を表示
  console.log("--- 検索結果 ---\n");
  result.rows.forEach((row, i) => {
    // distanceが小さい = 近い = 関連度が高い。1から引いてスコアにする
    const score = (1 - row.distance).toFixed(4);
    console.log(`#${i + 1} [スコア: ${score}] ${row.id}`);
    console.log(`   ${row.text.slice(0, 100)}...`);
    console.log(`   メタデータ: ${JSON.stringify(row.metadata)}`);
    console.log();
  });

  await client.end();
}

main().catch(console.error);
