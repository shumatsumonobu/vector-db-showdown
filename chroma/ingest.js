// Chromaクライアント（DBサーバーに接続するためのライブラリ）
const { ChromaClient } = require("chromadb");
const fs = require("fs");
const path = require("path");
// .envファイルからAPIキーを読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";
// コレクション = データの入れ物（RDBでいうテーブル）
const COLLECTION_NAME = "hosting-knowledge";

/**
 * テキストをベクトル（数値の配列）に変換する
 * Voyage AI のAPIにテキストを送ると、512次元のベクトルが返ってくる
 */
async function getEmbeddings(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Voyage AI API error: ${res.status} ${error}`);
  }

  // レスポンスからベクトル部分だけ取り出す
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function main() {
  // 1. サンプルデータ（JSON）を読み込む
  const documents = JSON.parse(
    fs.readFileSync(path.join(__dirname, "documents.json"), "utf-8")
  );

  console.log(`${documents.length} 件のドキュメントを読み込みました`);

  // 2. テキストをベクトルに変換（Voyage AI API）
  console.log("Voyage AI でembedding生成中...");
  const texts = documents.map((d) => d.text);
  const embeddings = await getEmbeddings(texts);

  // 最初のembeddingを表示（記事用の素材）
  console.log("\n--- Embeddingサンプル（最初の10次元） ---");
  console.log(`テキスト: "${documents[0].text.slice(0, 50)}..."`);
  console.log(`次元数: ${embeddings[0].length}`);
  console.log(`値: [${embeddings[0].slice(0, 10).map((v) => v.toFixed(6)).join(", ")}, ...]`);

  // 3. ChromaサーバーにHTTP接続（デフォルト: localhost:8000）
  const client = new ChromaClient();
  // コレクションがなければ作る、あればそのまま使う
  const collection = await client.getOrCreateCollection({ name: COLLECTION_NAME });

  // 4. ベクトル・テキスト・メタデータをまとめてChromaに投入
  await collection.add({
    ids: documents.map((d) => d.id),             // 各ドキュメントのID
    embeddings: embeddings,                       // ベクトル（検索に使う）
    documents: texts,                             // 元のテキスト（結果表示用）
    metadatas: documents.map((d) => d.metadata),  // 付加情報（フィルタに使える）
  });

  console.log(`\n${documents.length} 件を "${COLLECTION_NAME}" に投入しました`);
}

main().catch(console.error);
