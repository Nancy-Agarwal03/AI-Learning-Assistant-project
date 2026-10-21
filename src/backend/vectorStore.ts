import { IVectorStore, Chunk } from './types';
import { memDb, isUsingPostgres, getPgPool } from './db';

// Cosine similarity between two float vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. In-Memory Vector Store (with Hard Filter)
export class InMemoryVectorStore implements IVectorStore {
  async upsertChunks(chunks: Chunk[]): Promise<void> {
    for (const chunk of chunks) {
      memDb.chunks.set(chunk.id, chunk);
    }
  }

  async search(params: {
    queryEmbedding: number[];
    currentVideoSeconds: number;
    allowFuture: boolean;
    materialIds?: string[];
    topK?: number;
  }): Promise<Chunk[]> {
    const { queryEmbedding, currentVideoSeconds, allowFuture, materialIds, topK = 5 } = params;

    const allChunks = Array.from(memDb.chunks.values());

    // 1. Apply Hard Filter
    const filtered = allChunks.filter((chunk) => {
      // Check material ID inclusion
      if (materialIds && materialIds.length > 0 && chunk.material_id) {
        if (!materialIds.includes(chunk.material_id)) {
          return false;
        }
      }

      // Hard filter: for video sources, start_seconds must be <= currentVideoSeconds unless allowFuture is true
      if (chunk.kind === 'video_transcript') {
        const startSec = chunk.start_seconds ?? 0;
        if (!allowFuture && startSec > currentVideoSeconds) {
          return false;
        }
      }

      return true;
    });

    // 2. Score with embeddings or recency
    const scored = filtered.map((chunk) => {
      let score = 0;
      if (chunk.embedding && queryEmbedding && queryEmbedding.length > 0) {
        score = cosineSimilarity(chunk.embedding, queryEmbedding);
      } else {
        // Recency or proximity score for video transcript
        if (chunk.kind === 'video_transcript') {
          const diff = Math.abs((chunk.start_seconds || 0) - currentVideoSeconds);
          score = Math.max(0, 1 - diff / 600);
        } else {
          score = 0.5;
        }
      }
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((item) => item.chunk);
  }
}

// 2. PgVector Store (with PostgreSQL Vector Extension and Hard Filter)
export class PgVectorStore implements IVectorStore {
  async upsertChunks(chunks: Chunk[]): Promise<void> {
    const pool = getPgPool();
    if (!pool) return;

    for (const chunk of chunks) {
      const vectorLiteral = chunk.embedding ? `[${chunk.embedding.join(',')}]` : null;
      await pool.query(
        `INSERT INTO chunks (id, material_id, source_id, kind, content, embedding, start_seconds, end_seconds, page, slide, file_path, line_range, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
        [
          chunk.id,
          chunk.material_id || null,
          chunk.source_id,
          chunk.kind,
          chunk.content,
          vectorLiteral,
          chunk.start_seconds || null,
          chunk.end_seconds || null,
          chunk.page || null,
          chunk.slide || null,
          chunk.file_path || null,
          chunk.line_range || null,
          chunk.created_at,
        ]
      );
    }
  }

  async search(params: {
    queryEmbedding: number[];
    currentVideoSeconds: number;
    allowFuture: boolean;
    materialIds?: string[];
    topK?: number;
  }): Promise<Chunk[]> {
    const pool = getPgPool();
    if (!pool) {
      const fallback = new InMemoryVectorStore();
      return fallback.search(params);
    }

    const { queryEmbedding, currentVideoSeconds, allowFuture, materialIds, topK = 5 } = params;
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    let query = `
      SELECT id, material_id, source_id, kind, content, start_seconds, end_seconds, page, slide, file_path, line_range, created_at,
             embedding <=> $1::vector AS distance
      FROM chunks
      WHERE (kind != 'video_transcript' OR start_seconds <= $2 OR $3 = true)
    `;
    const queryParams: any[] = [vectorLiteral, currentVideoSeconds, allowFuture];

    if (materialIds && materialIds.length > 0) {
      queryParams.push(materialIds);
      query += ` AND (material_id IS NULL OR material_id = ANY($${queryParams.length}))`;
    }

    query += ` ORDER BY distance ASC LIMIT $${queryParams.length + 1}`;
    queryParams.push(topK);

    try {
      const res = await pool.query(query, queryParams);
      return res.rows.map((row) => ({
        id: row.id,
        material_id: row.material_id,
        source_id: row.source_id,
        kind: row.kind,
        content: row.content,
        start_seconds: row.start_seconds,
        end_seconds: row.end_seconds,
        page: row.page,
        slide: row.slide,
        file_path: row.file_path,
        line_range: row.line_range,
        token_count: row.token_count || 0,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.warn('[PgVectorStore] Vector search fallback to in-memory:', err);
      const fallback = new InMemoryVectorStore();
      return fallback.search(params);
    }
  }
}

// 3. OpenSearch Vector Store (Documented Adapter)
export class OpenSearchVectorStore implements IVectorStore {
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.OPENSEARCH_URL || 'http://localhost:9200';
  }

  async upsertChunks(chunks: Chunk[]): Promise<void> {
    // OpenSearch bulk index implementation stub
    const memory = new InMemoryVectorStore();
    await memory.upsertChunks(chunks);
  }

  async search(params: {
    queryEmbedding: number[];
    currentVideoSeconds: number;
    allowFuture: boolean;
    materialIds?: string[];
    topK?: number;
  }): Promise<Chunk[]> {
    // OpenSearch k-NN search implementation stub
    const memory = new InMemoryVectorStore();
    return memory.search(params);
  }
}

export function getVectorStore(): IVectorStore {
  const storeType = (process.env.VECTOR_STORE || '').toLowerCase();
  if (storeType === 'opensearch') {
    return new OpenSearchVectorStore();
  }
  if (isUsingPostgres()) {
    return new PgVectorStore();
  }
  return new InMemoryVectorStore();
}
