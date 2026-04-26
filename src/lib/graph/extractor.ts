// Entity + relation extractor. Calls Claude Haiku 4.5 with a strict JSON
// schema, gets back a small set of nodes and edges, then upserts via
// upsertGraph(). Designed to be called fire-and-forget after every pipeline
// agent finishes — failures must NOT take down the main pipeline.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { NODE_TYPES, type ExtractionResult, type NodeType } from "./types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

// Use Haiku for extraction — it's structured + cheap. ~$0.001 per agent output.
const EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You extract scientific entities and their relationships from agent-generated text.

Allowed node types: ${NODE_TYPES.join(", ")}.

Allowed relations: treats, inhibits, activates, expresses, correlates_with, causes, contradicts, supports, cites, derived_from, measured_by, associated_with.

Rules:
- Return ONLY canonical labels. "metformin" not "Metformin (Glucophage)".
- Do not invent entities. Only extract what the text states.
- Each node needs a one-sentence summary in the context of THIS text.
- Each edge connects two nodes you list. from/to labels must match a node label exactly.
- Cap at 12 nodes and 12 edges. Drop anything weak.
- If the text is short or vague, return fewer (or zero) nodes.

Return ONLY JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: [...NODE_TYPES] },
          label: { type: "string" },
          summary: { type: "string" },
        },
        required: ["type", "label", "summary"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from_label: { type: "string" },
          from_type: { type: "string", enum: [...NODE_TYPES] },
          to_label: { type: "string" },
          to_type: { type: "string", enum: [...NODE_TYPES] },
          relation: { type: "string" },
          weight: { type: "number" },
        },
        required: ["from_label", "from_type", "to_label", "to_type", "relation"],
      },
    },
  },
  required: ["nodes", "edges"],
} as const;

type RawExtraction = {
  nodes: Array<{ type: NodeType; label: string; summary: string }>;
  edges: Array<{
    from_label: string;
    from_type: NodeType;
    to_label: string;
    to_type: NodeType;
    relation: string;
    weight?: number;
  }>;
};

export async function extractEntities(
  agentOutput: string,
  agentContext?: { agent: string; hypothesis?: string },
): Promise<ExtractionResult> {
  const text = agentOutput.trim();
  if (text.length < 50) return { nodes: [], edges: [] };

  const c = client();
  const userPrompt = agentContext
    ? `Source agent: ${agentContext.agent}\n${
        agentContext.hypothesis ? `Hypothesis: ${agentContext.hypothesis}\n` : ""
      }\nText:\n${text.slice(0, 12000)}`
    : `Text:\n${text.slice(0, 12000)}`;

  const messages: MessageParam[] = [{ role: "user", content: userPrompt }];

  const response = await c.messages.create({
    model: EXTRACTOR_MODEL,
    max_tokens: 1500,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: {
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    messages,
  });

  const raw = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!raw) return { nodes: [], edges: [] };

  const parsed = JSON.parse(raw) as RawExtraction;

  // Sanitize: clamp counts, dedupe by lowercased label, drop edges that
  // reference an unknown label.
  const nodes = (parsed.nodes ?? [])
    .slice(0, 12)
    .filter((n) => n.label && n.type)
    .map((n) => ({
      type: n.type,
      label: n.label.trim(),
      summary: n.summary?.trim() ?? "",
    }));

  const knownLabels = new Set(nodes.map((n) => n.label.toLowerCase()));
  const edges = (parsed.edges ?? [])
    .slice(0, 12)
    .filter(
      (e) =>
        e.from_label &&
        e.to_label &&
        e.from_label.toLowerCase() !== e.to_label.toLowerCase() &&
        knownLabels.has(e.from_label.toLowerCase()) &&
        knownLabels.has(e.to_label.toLowerCase()),
    )
    .map((e) => ({
      fromLabel: e.from_label.trim(),
      fromType: e.from_type,
      toLabel: e.to_label.trim(),
      toType: e.to_type,
      relation: e.relation,
      weight: e.weight ?? 1,
    }));

  return { nodes, edges };
}
