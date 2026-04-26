// Entity + relation extractor. Calls OpenAI gpt-5-mini with a strict JSON
// schema, gets back a small set of nodes and edges, then upserts via
// upsertGraph(). Designed to be called fire-and-forget after every pipeline
// agent finishes — failures must NOT take down the main pipeline.

import "server-only";
import OpenAI from "openai";
import { NODE_TYPES, type ExtractionResult, type NodeType } from "./types";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _client = new OpenAI({ apiKey });
  return _client;
}

// gpt-5-mini at low reasoning effort: structured output + cheap.
// Bump to "medium" if extraction quality dips on long agent outputs.
const EXTRACTOR_MODEL = "gpt-5-mini";

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

// OpenAI strict mode requires every property to be in `required` and no
// minItems/maxItems. The "cap at 12" guidance lives in the system prompt and
// is enforced post-parse below.
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
        required: [
          "from_label",
          "from_type",
          "to_label",
          "to_type",
          "relation",
          "weight",
        ],
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

  const userPrompt = agentContext
    ? `Source agent: ${agentContext.agent}\n${
        agentContext.hypothesis ? `Hypothesis: ${agentContext.hypothesis}\n` : ""
      }\nText:\n${text.slice(0, 12000)}`
    : `Text:\n${text.slice(0, 12000)}`;

  const res = await client().responses.create({
    model: EXTRACTOR_MODEL,
    instructions: SYSTEM,
    input: userPrompt,
    reasoning: { effort: "low" },
    max_output_tokens: 1500,
    text: {
      format: {
        type: "json_schema",
        name: "graph_extraction",
        strict: true,
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const raw = res.output_text?.trim() ?? "";
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
