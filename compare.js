const { ChromaClient } = require("chromadb");
const { Client: PgClient } = require("pg");
const { Pinecone } = require("@pinecone-database/pinecone");
const fs = require("fs");

// .envから読み込む（ルートの.envにVOYAGE_API_KEY, PINECONE_API_KEY, DATABASE_URLを設定）
require("dotenv").config();
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3-lite";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/postgres";

const QUERIES = [
  "無料でサイトを公開したい",
  "Dockerコンテナをデプロイしたい",
  "認証機能が欲しい",
  "Next.jsアプリを本番運用したい",
  "お金をかけたくない",
];

async function getEmbedding(text, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [text], model: VOYAGE_MODEL }),
    });
    if (res.status === 429) {
      const wait = 30;
      console.log(`  レート制限。${wait}秒待機中... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Voyage AI error: ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding;
  }
  throw new Error("Voyage AI: リトライ上限");
}

// --- Chroma ---
async function searchChroma(queryEmbedding) {
  const client = new ChromaClient();
  const collection = await client.getOrCreateCollection({ name: "hosting-knowledge" });
  const results = await collection.query({ queryEmbeddings: [queryEmbedding], nResults: 3 });
  return results.ids[0].map((id, i) => ({
    rank: i + 1,
    id,
    score: (1 - results.distances[0][i]).toFixed(4),
  }));
}

// --- pgvector ---
async function searchPgvector(queryEmbedding) {
  const client = new PgClient({ connectionString: DATABASE_URL });
  await client.connect();
  const result = await client.query(
    `SELECT id, embedding <=> $1 AS distance FROM documents ORDER BY embedding <=> $1 LIMIT 3`,
    [`[${queryEmbedding.join(",")}]`]
  );
  await client.end();
  return result.rows.map((row, i) => ({
    rank: i + 1,
    id: row.id,
    score: (1 - row.distance).toFixed(4),
  }));
}

// --- Pinecone ---
async function searchPinecone(queryEmbedding) {
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index("hosting-knowledge");
  const results = await index.query({ vector: queryEmbedding, topK: 3, includeMetadata: false });
  return results.matches.map((match, i) => ({
    rank: i + 1,
    id: match.id,
    score: match.score.toFixed(4),
  }));
}

async function main() {
  let output = "# 3DB比較結果（2026-03-19）\n\n";
  output += "同じデータ（ホスティング選定ナレッジ16件）・同じEmbedding（Voyage AI voyage-3-lite）・同じクエリで検索\n\n";

  for (let qi = 0; qi < QUERIES.length; qi++) {
    const query = QUERIES[qi];
    if (qi > 0) await new Promise((r) => setTimeout(r, 5000));
    console.log(`\nクエリ: "${query}"`);
    const embedding = await getEmbedding(query);

    const [chroma, pgvector, pinecone] = await Promise.all([
      searchChroma(embedding),
      searchPgvector(embedding),
      searchPinecone(embedding),
    ]);

    output += `## クエリ: 「${query}」\n\n`;
    output += "| 順位 | Chroma | pgvector | Pinecone |\n";
    output += "|------|--------|----------|----------|\n";
    for (let i = 0; i < 3; i++) {
      output += `| ${i + 1} | ${chroma[i].id} (${chroma[i].score}) | ${pgvector[i].id} (${pgvector[i].score}) | ${pinecone[i].id} (${pinecone[i].score}) |\n`;
    }
    output += "\n";

    console.log("  Chroma:", chroma.map((r) => r.id).join(", "));
    console.log("  pgvector:", pgvector.map((r) => r.id).join(", "));
    console.log("  Pinecone:", pinecone.map((r) => r.id).join(", "));
  }

  fs.writeFileSync("results/comparison.txt", output, "utf-8");
  console.log("\n結果を results/comparison.txt に保存しました");
}

main().catch(console.error);
