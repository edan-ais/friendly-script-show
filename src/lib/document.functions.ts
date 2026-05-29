import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), text: z.string() }),
  z.object({ kind: z.literal("subheading"), text: z.string() }),
  z.object({ kind: z.literal("paragraph"), text: z.string() }),
  z.object({ kind: z.literal("list"), items: z.array(z.string()) }),
  z.object({ kind: z.literal("quote"), text: z.string() }),
  z.object({ kind: z.literal("callout"), text: z.string() }),
]);

const StructuredDocSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional().default(""),
  eyebrow: z.string().optional().default(""),
  blocks: z.array(BlockSchema),
});

export type StructuredDoc = z.infer<typeof StructuredDocSchema>;
export type DocBlock = z.infer<typeof BlockSchema>;

const SYSTEM_PROMPT = `You are a document designer for AICD-10, a healthcare AI company.
You take raw pasted text from a user and structure it into a beautiful one-page document.

Rules:
- Pick a strong, concise TITLE (max ~70 chars). If the text has an obvious title, use it; otherwise create one that captures the gist.
- Pick a SUBTITLE that adds context (max ~120 chars). Optional — leave empty if nothing fits.
- Pick an EYEBROW: a short category label in UPPERCASE (e.g. "BRIEFING", "INTERNAL MEMO", "PRODUCT UPDATE", "ANNOUNCEMENT"). Max 3 words.
- Break the body into BLOCKS:
  - "heading" — major section heading
  - "subheading" — secondary heading within a section
  - "paragraph" — a single paragraph of prose. You may use **bold** and *italic* inline markdown.
  - "list" — bullet list with concise items
  - "quote" — a notable pull quote or callout sentence
  - "callout" — a single short "key takeaway" sentence (use sparingly, max 1-2 per doc)
- Keep the user's wording. Do not invent facts. You may lightly clean up grammar/punctuation.
- Aim for a clean, scannable one-pager. Don't pad. Don't add a conclusion if the source doesn't have one.

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
          { role: "user", content: data.text },
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
