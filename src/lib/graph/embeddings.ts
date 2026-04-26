// OpenAI text-embedding-3-small (1536 dims). Cheapest viable embedding model
// (~$0.00002 per node). Anthropic doesn't ship embeddings yet — when they do,
// swap the body of `embed()` and bump the migration's vector(N) dim.

import "server-only";
import OpenAI from "openai";

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _client = new OpenAI({ apiKey });
  return _client;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

// Single embedding. Use for ad-hoc queries (e.g. findRelevantContext).
export async function embed(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return new Array(EMBEDDING_DIM).fill(0);
  const r = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  return r.data[0].embedding;
}

// Batched embeddings — used during extraction when we just upserted N nodes.
export async function embedMany(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.trim().slice(0, 8000) || " ");
  if (cleaned.length === 0) return [];
  const r = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
  });
  return r.data.map((d) => d.embedding);
}
