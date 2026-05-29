import { useState, useLayoutEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import logoUrl from "@/assets/aicd10-logo.png";
import { structureDocument, type StructuredDoc, type DocBlock } from "@/lib/document.functions";

const BRAND = {
  name: "AICD-10",
  tagline: "The AI infrastructure for clinical documentation & reimbursement.",
  red: "#ef3340",
  navy: "#0e1730",
  cream: "#fdf6f0",
  paper: "#fffdfa",
};

const SAMPLE = `AICD-10 closes a $1.2M seed round to scale AI-assisted medical coding

We're thrilled to share that AICD-10 has closed a $1.2M seed round to accelerate the build-out of HUBL, our proprietary ingestion layer that normalizes any clinical input into structured, audit-ready reimbursement workflows.

What this enables:
- Native EHR connectors across Epic, Cerner, athena, and eCW
- Live ICD-10 and CPT intelligence with payer-specific rules
- Coder-in-the-loop review tools that learn from every correction

Healthcare reimbursement still depends on fragmented manual coding workflows, creating billions in denials and delayed payments. Our mission is to give every provider a path from chart to cash that is fast, accurate, and explainable.

A huge thank you to our pilot partners and investors. We're hiring across engineering, clinical operations, and design.`;

function renderInline(text: string, key: string) {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={`${key}-b-${i++}`}>{tok.slice(2, -2)}</strong>);
    else nodes.push(<em key={`${key}-i-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function BlockView({ block, index }: { block: DocBlock; index: number }) {
  switch (block.kind) {
    case "heading":
      return (
        <h2 className="mt-4 text-[16px] font-bold tracking-tight" style={{ color: BRAND.navy }}>
          {renderInline(block.text, `h-${index}`)}
        </h2>
      );
    case "subheading":
      return (
        <h3
          className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: BRAND.red }}
        >
          {renderInline(block.text, `sh-${index}`)}
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-[11.5px] leading-[1.5]" style={{ color: BRAND.navy }}>
          {renderInline(block.text, `p-${index}`)}
        </p>
      );
    case "list":
      return (
        <ul className="space-y-1 text-[11.5px] leading-[1.45]" style={{ color: BRAND.navy }}>
          {block.items.map((it, j) => (
            <li key={j} className="flex gap-2">
              <span
                className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: BRAND.red }}
              />
              <span>{renderInline(it, `li-${index}-${j}`)}</span>
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          className="my-1 border-l-[3px] pl-3 text-[12px] italic leading-[1.5]"
          style={{ borderColor: BRAND.red, color: BRAND.navy }}
        >
          {renderInline(block.text, `q-${index}`)}
        </blockquote>
      );
    case "callout":
      return (
        <div
          className="my-1 rounded-md px-3 py-2 text-[11.5px] font-medium leading-snug"
          style={{ backgroundColor: BRAND.cream, color: BRAND.navy, borderLeft: `3px solid ${BRAND.red}` }}
        >
          {renderInline(block.text, `c-${index}`)}
        </div>
      );
  }
}

/**
 * Scales its children uniformly so they exactly fill the parent box.
 * - If content is too tall, scales down (min 0.55).
 * - If content is short, scales up to fill (max 1.35).
 */
function AutoFit({ children, deps }: { children: React.ReactNode; deps: unknown[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      // Reset inner to natural size to measure
      inner.style.transform = "scale(1)";
      inner.style.width = "100%";
      const available = outer.clientHeight;
      const natural = inner.scrollHeight;
      if (!available || !natural) return;
      const raw = available / natural;
      const next = Math.max(0.55, Math.min(1.35, raw));
      setScale(next);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <div ref={outerRef} className="h-full w-full overflow-hidden">
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DocumentDesigner() {
  const [raw, setRaw] = useState(SAMPLE);
  const [doc, setDoc] = useState<StructuredDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const structureFn = useServerFn(structureDocument);

  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleFormat = async () => {
    if (!raw.trim()) {
      toast.error("Paste some text first.");
      return;
    }
    setLoading(true);
    try {
      const result = await structureFn({ data: { text: raw.trim() } });
      setDoc(result);
      toast.success("Document formatted.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to format document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #f5f1ec 0%, #ece6df 100%)" }}>
      <style>{`
        .print-page, .print-page * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .print-root, .print-root * { visibility: visible !important; }
          .print-root { position: absolute !important; inset: 0 !important; }
          .no-print { display: none !important; }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            transform: none !important;
            width: 8.5in !important;
            height: 11in !important;
            max-width: none !important;
          }
        }
        @page { size: letter; margin: 0; }
      `}</style>

      <header className="no-print sticky top-0 z-10 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Apps
          </Link>
          <div className="text-sm font-semibold text-neutral-900">Document Designer</div>
          <Button onClick={() => window.print()} size="sm" variant="outline" className="gap-2" disabled={!doc}>
            <Printer className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        {/* Editor */}
        <aside className="no-print h-fit space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Sparkles className="h-4 w-4" style={{ color: BRAND.red }} /> Paste your text
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Paste anything — an announcement, memo, notes. AI will pick the title, subtitle, headings, and lists.
            </p>
          </div>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={22}
            placeholder="Paste your document text here…"
            className="resize-none bg-white font-mono text-sm text-neutral-900"
          />
          <Button
            onClick={handleFormat}
            disabled={loading || !raw.trim()}
            className="w-full gap-2"
            style={{ backgroundColor: BRAND.red, color: "white" }}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Formatting…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Format with AI</>
            )}
          </Button>
        </aside>

        {/* Preview / Print page */}
        <div className="print-root flex justify-center">
          <div
            className="print-page relative flex aspect-[8.5/11] w-full max-w-[8.5in] flex-col overflow-hidden shadow-[0_20px_60px_-20px_rgba(14,23,48,0.35)]"
            style={{ backgroundColor: BRAND.paper, fontFamily: "Inter, system-ui, sans-serif", color: BRAND.navy }}
          >
            {/* Decorative red side bar */}
            <div className="absolute inset-y-0 left-0 w-2" style={{ backgroundColor: BRAND.red }} />
            {/* Decorative top accent */}
            <div
              className="pointer-events-none absolute top-0 right-0 h-32 w-32 opacity-[0.08]"
              style={{
                background: `radial-gradient(circle at top right, ${BRAND.red}, transparent 70%)`,
              }}
            />

            {/* Header */}
            <div className="flex shrink-0 items-end justify-between px-10 pt-7 pb-4">
              <img src={logoUrl} alt={BRAND.name} className="h-9 w-auto" />
              <div className="text-right">
                {doc?.eyebrow && (
                  <div
                    className="text-[9.5px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: BRAND.red }}
                  >
                    {doc.eyebrow}
                  </div>
                )}
                <div className="mt-0.5 text-[10px]" style={{ color: BRAND.navy, opacity: 0.55 }}>
                  {today}
                </div>
              </div>
            </div>

            {/* Title block */}
            <div className="shrink-0 px-10">
              <div className="h-px w-full" style={{ backgroundColor: `${BRAND.navy}15` }} />
              <h1
                className="mt-4 text-[26px] font-extrabold leading-[1.1] tracking-tight"
                style={{ color: BRAND.navy }}
              >
                {doc?.title || "Your document title appears here"}
              </h1>
              {doc?.subtitle && (
                <p
                  className="mt-2 text-[12.5px] leading-snug"
                  style={{ color: BRAND.navy, opacity: 0.7 }}
                >
                  {doc.subtitle}
                </p>
              )}
              <div className="mt-3 h-[2.5px] w-10 rounded-full" style={{ backgroundColor: BRAND.red }} />
            </div>

            {/* Body — auto-fits to remaining vertical space */}
            <div className="min-h-0 flex-1 px-10 pt-4 pb-3">
              {!doc ? (
                <div
                  className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm"
                  style={{ borderColor: `${BRAND.navy}25`, color: `${BRAND.navy}80` }}
                >
                  Paste your text on the left and click <span className="font-semibold">Format with AI</span> to generate a branded one-pager.
                </div>
              ) : (
                <AutoFit deps={[doc]}>
                  <div className="space-y-2">
                    {doc.blocks.map((b, i) => (
                      <BlockView key={i} block={b} index={i} />
                    ))}
                  </div>
                </AutoFit>
              )}
            </div>

            {/* Footer slogan */}
            <div
              className="shrink-0 px-10 py-3 text-center text-[10px] italic tracking-wide"
              style={{ borderTop: `1px solid ${BRAND.navy}15`, color: BRAND.navy, opacity: 0.7 }}
            >
              {BRAND.tagline}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
