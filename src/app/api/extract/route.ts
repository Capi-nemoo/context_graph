// POST /api/extract — runs the extractor on a piece of text and returns the
// nodes + edges. Used by the demo page to test extraction without Supabase.
//
// In production (the main app's pipeline.ts), use lib/graph/extract-and-store.ts
// directly so it persists.

import { NextResponse } from "next/server";
import { extractEntities } from "@/lib/graph/extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { text?: string; agent?: string };
  try {
    body = (await req.json()) as { text?: string; agent?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  try {
    const out = await extractEntities(body.text, {
      agent: body.agent ?? "demo",
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
