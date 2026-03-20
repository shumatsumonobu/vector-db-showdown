// PostgreSQLクライアント（DBサーバーに接続するためのライブラリ）
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
// .envファイルからAPIキーとDB接続情報を読み込む
require("dotenv").config();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";

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

  // 3. PostgreSQLに接続
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("\nPostgreSQLに接続しました");

  // 4. pgvector拡張を有効化（CREATE EXTENSION）
  //    Chromaと違って、PostgreSQLに「ベクトル型を追加する」ステップが必要
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("pgvector拡張を有効化しました");

  // 5. テーブル作成（RDBなので、テーブル定義が必要）
  //    embedding列に vector(512) 型を指定 — これがpgvectorの核
  await client.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      text TEXT,
      metadata JSONB,
      embedding vector(512)
    )
  `);
  console.log("documentsテーブルを作成しました");

  // 6. データ投入（INSERT）
  //    Chromaはcollection.add()だったけど、pgvectorは普通のSQL
  for (let i = 0; i < documents.length; i++) {
    await client.query(
      `INSERT INTO documents (id, text, metadata, embedding)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET text = $2, metadata = $3, embedding = $4`,
      [
        documents[i].id,
        documents[i].text,
        JSON.stringify(documents[i].metadata),
        `[${embeddings[i].join(",")}]`, // ベクトルは文字列 "[0.1,0.2,...]" として渡す
      ]
    );
  }

  console.log(`${documents.length} 件を documentsテーブルに投入しました`);

  await client.end();
}

main().catch(console.error);
