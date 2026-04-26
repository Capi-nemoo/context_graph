// One-shot helper used from the main app's pipeline.ts. Fire-and-forget:
// extraction failures must never break the agent pipeline.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractEntities } from "./extractor";
import { upsertGraph, type UpsertContext } from "./queries";

export async function extractAndStore(
  admin: SupabaseClient,
  agentOutput: string,
  ctx: UpsertContext & { hypothesisTitle?: string },
): Promise<{ nodeCount: number; edgeCount: number }> {
  try {
    const extraction = await extractEntities(agentOutput, {
      agent: ctx.sourceAgent ?? "unknown",
      hypothesis: ctx.hypothesisTitle,
    });
    if (extraction.nodes.length === 0) {
      return { nodeCount: 0, edgeCount: 0 };
    }
    const { insertedNodes, insertedEdges } = await upsertGraph(admin, extraction, ctx);
    return {
      nodeCount: insertedNodes.length,
      edgeCount: insertedEdges.length,
    };
  } catch (e) {
    console.error(
      `[graph] extractAndStore failed (agent=${ctx.sourceAgent}):`,
      (e as Error).message,
    );
    return { nodeCount: 0, edgeCount: 0 };
  }
}
