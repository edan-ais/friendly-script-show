import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import logoUrl from "@/assets/aicd10-logo.png";

const BRAND = {
  name: "AICD-10",
  tagline: "The AI infrastructure for clinical documentation & reimbursement.",
  red: "#ef3340",
  navy: "#0e1730",
  cream: "#f9eee8",
};

const PLACEHOLDER = `Document Title
Internal Memo · Optional subtitle

Write your opening paragraph here. Just type — the first line becomes the title and the next short line becomes the subtitle.

## A section heading
Use ## at the start of a line to make a section heading.

You can make text **bold** or *italic* inline. Separate paragraphs with a blank line.

- Bullet points start with a dash
- They group into a tidy list
- Great for highlights or takeaways`;

// --- inline formatting: **bold** and *italic* ---
function renderInline(text: string, keyBase: string) {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-b-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`${keyBase}-i-${i++}`}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

// Parse raw text → title, subtitle, blocks
function parseDoc(raw: string) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  // strip leading blank lines
  while (lines.length && lines[0].trim() === "") lines.shift();

  const title = (lines.shift() ?? "").trim();
  let subtitle = "";

  // peek next non-blank-block for subtitle: short single line followed by blank line
  if (lines.length) {
    const candidate = lines[0]?.trim() ?? "";
    const isShort = candidate.length > 0 && candidate.length <= 90 && !candidate.startsWith("#") && !candidate.startsWith("-");
    const nextBlank = (lines[1] ?? "").trim() === "";
    if (isShort && nextBlank) {
      subtitle = candidate;
      lines.shift();
    }
  }

  // Group remaining lines into paragraphs by blank lines
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!buffer.length) return;
    // Check if this is a bullet list
    const allBullets = buffer.every((l) => /^\s*-\s+/.test(l));
    if (allBullets) {
      blocks.push({
        kind: "ul",
        items: buffer.map((l) => l.replace(/^\s*-\s+/, "").trim()),
      });
    } else {
      // join with spaces (soft wraps), but treat bullets/headings inside as their own
      const joined = buffer.join(" ").trim();
      blocks.push({ kind: "p", text: joined });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushBuffer();
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushBuffer();
      blocks.push({ kind: "h2", text: line.replace(/^##\s+/, "").trim() });
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      // if buffer has non-bullet content, flush first
      if (buffer.length && !buffer.every((l) => /^\s*-\s+/.test(l))) flushBuffer();
      buffer.push(line);
      continue;
    }
    // regular line — if buffer was bullets, flush
    if (buffer.length && buffer.every((l) => /^\s*-\s+/.test(l))) flushBuffer();
    buffer.push(line);
  }
  flushBuffer();

  return { title, subtitle, blocks };
}

export function DocumentDesigner() {
  const [raw, setRaw] = useState(PLACEHOLDER);
  const { title, subtitle, blocks } = useMemo(() => parseDoc(raw), [raw]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-neutral-100">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
        }
        @page { size: letter; margin: 0; }
      `}</style>

      <header className="no-print sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Apps
          </Link>
          <div className="text-sm font-semibold text-neutral-900">Document Designer</div>
          <Button onClick={handlePrint} size="sm" className="gap-2">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        {/* Single paste box */}
        <aside className="no-print h-fit space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Paste your text</div>
            <p className="mt-1 text-xs text-neutral-500">
              First line = title. Optional short next line = subtitle. Use
              <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px]">##</code> for headings,
              <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px]">**bold**</code>,
              <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px]">*italic*</code>, and
              <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px]">- bullets</code>.
            </p>
          </div>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={26}
            className="resize-none bg-white font-mono text-sm text-neutral-900"
          />
        </aside>

        {/* Page preview */}
        <div className="flex justify-center">
          <div
            className="print-page relative aspect-[8.5/11] w-full max-w-[8.5in] overflow-hidden bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)]"
            style={{ fontFamily: "Inter, system-ui, sans-serif", color: BRAND.navy }}
          >
            {/* Brand header */}
            <div
              className="flex items-center justify-between px-12 py-6"
              style={{ backgroundColor: BRAND.cream, borderBottom: `4px solid ${BRAND.red}` }}
            >
              <img src={logoUrl} alt={BRAND.name} className="h-12 w-auto" />
              <div className="text-right">
                {subtitle && (
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.red }}>
                    {subtitle}
                  </div>
                )}
                <div className="text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>
                  {today}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-12 py-10 pb-16">
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight" style={{ color: BRAND.navy }}>
                {title || "Untitled"}
              </h1>
              <div className="mt-2 h-1 w-16 rounded-full" style={{ backgroundColor: BRAND.red }} />

              <div className="mt-8 space-y-4 text-[14.5px] leading-relaxed" style={{ color: BRAND.navy }}>
                {blocks.length === 0 ? (
                  <p style={{ opacity: 0.4 }}>Your document body will appear here.</p>
                ) : (
                  blocks.map((b, i) => {
                    if (b.kind === "h2") {
                      return (
                        <h2 key={i} className="pt-2 text-xl font-bold tracking-tight" style={{ color: BRAND.red }}>
                          {renderInline(b.text, `h2-${i}`)}
                        </h2>
                      );
                    }
                    if (b.kind === "ul") {
                      return (
                        <ul key={i} className="ml-5 list-disc space-y-1.5 marker:text-[color:var(--brand-red)]" style={{ ["--brand-red" as never]: BRAND.red }}>
                          {b.items.map((it, j) => (
                            <li key={j}>{renderInline(it, `li-${i}-${j}`)}</li>
                          ))}
                        </ul>
                      );
                    }
                    return <p key={i}>{renderInline(b.text, `p-${i}`)}</p>;
                  })
                )}
              </div>
            </div>

            {/* Footer: slogan only */}
            <div
              className="absolute inset-x-0 bottom-0 px-12 py-4 text-center text-[11px] italic"
              style={{ borderTop: `1px solid ${BRAND.cream}`, color: BRAND.navy, opacity: 0.75 }}
            >
              {BRAND.tagline}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
