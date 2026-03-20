// Pineconeクライアント（クラウドのベクトルDBに接続するライブラリ）
const { Pinecone } = require("@pinecone-database/pinecone");
// .envファイルからAPIキーを読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";
const INDEX_NAME = "hosting-knowledge";

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

  // 2. PineconeにAPIキーだけで接続
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index(INDEX_NAME);

  // 3. ベクトルの近さで検索（上位5件）
  //    includeMetadata: true でメタデータも一緒に返してもらう
  const results = await index.query({
    vector: queryEmbedding,
    topK: 5,
    includeMetadata: true,
  });

  // 4. 結果を表示
  console.log("--- 検索結果 ---\n");
  results.matches.forEach((match, i) => {
    // Pineconeはscoreを直接返してくれる（1に近いほど関連度が高い）
    const score = match.score.toFixed(4);
    console.log(`#${i + 1} [スコア: ${score}] ${match.id}`);
    console.log(`   ${match.metadata.text.slice(0, 100)}...`);
    const { text, ...meta } = match.metadata;
    console.log(`   メタデータ: ${JSON.stringify(meta)}`);
    console.log();
  });
}

main().catch(console.error);
