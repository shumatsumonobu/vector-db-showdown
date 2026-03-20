// Pineconeクライアント（クラウドのベクトルDBに接続するライブラリ）
const { Pinecone } = require("@pinecone-database/pinecone");
const fs = require("fs");
const path = require("path");
// .envファイルからAPIキーを読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";
// Index = データの入れ物（Chromaのcollection、pgvectorのテーブルに相当）
const INDEX_NAME = "hosting-knowledge";

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

  // 3. PineconeにAPIキーだけで接続（DockerもSQLも不要）
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

  // 4. Indexを作成（既にあればスキップ）
  //    Pineconeではdimension（ベクトルの次元数）とmetric（距離の計算方法）を指定する
  const existingIndexes = await pc.listIndexes();
  const indexExists = existingIndexes.indexes?.some((i) => i.name === INDEX_NAME);

  if (!indexExists) {
    console.log(`\nIndex "${INDEX_NAME}" を作成中...`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: 512,        // Voyage AI voyage-3-lite の次元数
      metric: "cosine",      // コサイン距離（Chroma・pgvectorと同じ）
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
    });
    // Indexが使えるようになるまで少し待つ
    console.log("Indexの準備を待っています...");
    await new Promise((resolve) => setTimeout(resolve, 15000));
  } else {
    console.log(`\nIndex "${INDEX_NAME}" は既に存在します`);
  }

  const index = pc.index(INDEX_NAME);

  // 5. ベクトル・メタデータをまとめてPineconeに投入（upsert）
  //    upsert = insert + update。同じIDがあれば上書き、なければ新規作成
  const vectors = documents.map((doc, i) => ({
    id: doc.id,
    values: embeddings[i],                          // ベクトル
    metadata: { ...doc.metadata, text: doc.text },  // メタデータに元テキストも含める
  }));

  await index.upsert({ records: vectors });

  console.log(`${documents.length} 件を "${INDEX_NAME}" に投入しました`);
}

main().catch(console.error);
