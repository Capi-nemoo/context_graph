// Public surface for consumers (the main SCSP-Hackathon-2026 app).
//
// Server (in pipeline.ts):
//   import { extractAndStore, findRelevantContext, getNeighborhood,
//            buildContextBlock } from "@/lib/graph";
//
// Client (in research/[id]/page.tsx):
//   import { fetchGraph, subscribeToGraph } from "@/lib/graph/client";

export * from "./types";
export * from "./colors";
export { extractEntities } from "./extractor";
export { extractAndStore } from "./extract-and-store";
export {
  upsertGraph,
  findRelevantContext,
  getNeighborhood,
  type UpsertContext,
} from "./queries";
export { buildContextBlock } from "./prompt-injection";
export { embed, embedMany, EMBEDDING_DIM, EMBEDDING_MODEL } from "./embeddings";
