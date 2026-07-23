import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), text: z.string() }),
  z.object({ kind: z.literal("subheading"), text: z.string() }),
  z.object({ kind: z.literal("paragraph"), text: z.string() }),
  z.object({ kind: z.literal("list"), items: z.array(z.string()) }),
  z.object({ kind: z.literal("quote"), text: z.string() }),
  z.object({ kind: z.literal("callout"), text: z.string() }),
  z.object({ kind: z.literal("signature"), lines: z.array(z.string()) }),
]);

const StructuredDocSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional().default(""),
  eyebrow: z.string().optional().default(""),
  blocks: z.array(BlockSchema),
});

export type StructuredDoc = z.infer<typeof StructuredDocSchema>;
export type DocBlock = z.infer<typeof BlockSchema>;

const SYSTEM_PROMPT = `You are a document FORMATTER for AICD-10, a healthcare AI company.

YOUR JOB IS TO STRUCTURE THE USER'S EXACT TEXT — NOT TO REWRITE IT, SUMMARIZE IT, OR REPLACE IT WITH YOUR OWN WORDING.

ABSOLUTE RULES (violating any of these is a failure):
1. Every word of prose in your output MUST come from the user's input. Do NOT paraphrase. Do NOT summarize. Do NOT invent facts, examples, statistics, names, or sentences.
2. You may ONLY: split text into blocks, fix obvious typos/punctuation, promote a line into a heading, and group bullets that are already in the text.
3. If the user's first line looks like a title, use it verbatim as the TITLE. Otherwise use the first sentence verbatim. Never write a new title from scratch.
4. SUBTITLE: pull a short supporting line from the user's text, verbatim, or leave empty. Never invent one.
5. EYEBROW: a short UPPERCASE category label (max 3 words) like "BRIEFING", "MEMO", "UPDATE", "ANNOUNCEMENT". This is the ONLY field you may write freely.
6. Every paragraph, heading, subheading, list item, quote, and callout MUST be text that appears in the user's input (verbatim, or with only whitespace/punctuation cleanup).
7. Do NOT add a conclusion, intro, CTA, or any block that the source doesn't contain.

Block kinds:
- "heading" — a section heading lifted from the source
- "subheading" — a secondary heading lifted from the source
- "paragraph" — a paragraph of the user's prose. You may use **bold** and *italic* inline markdown.
- "list" — bullet list; items must be lines/phrases from the source
- "quote" — a notable sentence pulled verbatim from the source
- "callout" — a single short key sentence pulled verbatim (use sparingly, max 1-2)

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "subtitle": "string",
  "eyebrow": "string",
  "blocks": [
    { "kind": "heading" | "subheading" | "paragraph" | "quote" | "callout", "text": "string" }
    | { "kind": "list", "items": ["string", ...] }
  ]
}`;

export const structureDocument = createServerFn({ method: "POST" })
  .inputValidator(z.object({ text: z.string().min(1).max(20000) }))
  .handler(async ({ data }): Promise<StructuredDoc> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Format the text below. Use ONLY words from this text — do not invent or rewrite anything.\n\n---BEGIN USER TEXT---\n${data.text}\n---END USER TEXT---`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      if (resp.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error(`AI gateway error (${resp.status}): ${body.slice(0, 200)}`);
    }

    const json = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned invalid JSON. Try again.");
    }

    const result = StructuredDocSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("AI output did not match expected shape. Try again.");
    }
    return result.data;
  });
