import {
  useState,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import logoUrl from "@/assets/aicd10-logo.png";
import sealUrl from "@/assets/aicd10-seal.png";
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
    if (tok.startsWith("**"))
      nodes.push(<strong key={`${key}-b-${i++}`}>{tok.slice(2, -2)}</strong>);
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
        <section className="doc-block doc-block--heading">
          <h2 className="doc-heading" style={{ color: BRAND.navy }}>
            {renderInline(block.text, `h-${index}`)}
          </h2>
        </section>
      );
    case "subheading":
      return (
        <section className="doc-block doc-block--subheading">
          <h3 className="doc-subheading" style={{ color: BRAND.red }}>
            {renderInline(block.text, `sh-${index}`)}
          </h3>
        </section>
      );
    case "paragraph":
      return (
        <p className="doc-block doc-paragraph" style={{ color: BRAND.navy }}>
          {renderInline(block.text, `p-${index}`)}
        </p>
      );
    case "list":
      return (
        <ul className="doc-block doc-list" style={{ color: BRAND.navy }}>
          {block.items.map((it, j) => (
            <li key={j} className="doc-list-item">
              <span className="doc-bullet" style={{ backgroundColor: BRAND.red }} />
              <span>{renderInline(it, `li-${index}-${j}`)}</span>
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          className="doc-block doc-quote"
          style={{ borderColor: BRAND.red, color: BRAND.navy }}
        >
          {renderInline(block.text, `q-${index}`)}
        </blockquote>
      );
    case "callout":
      return (
        <div
          className="doc-block doc-callout"
          style={{
            backgroundColor: BRAND.cream,
            color: BRAND.navy,
            borderLeft: `3px solid ${BRAND.red}`,
          }}
        >
          {renderInline(block.text, `c-${index}`)}
        </div>
      );
    case "signature":
      return (
        <div className="doc-block doc-signature" style={{ color: BRAND.navy }}>
          {block.lines.map((ln, j) => (
            <div key={j} className="doc-signature-line">
              {renderInline(ln, `sig-${index}-${j}`)}
            </div>
          ))}
        </div>
      );
  }
}

const SIGNATURE_STARTS =
  /^(sincerely|best|regards|thanks|thank you|cheers|sincerely yours|yours truly|warm regards|kind regards|respectfully|with gratitude)[,.!]?\s*$/i;

function collapseSignatures(blocks: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === "paragraph" && SIGNATURE_STARTS.test(b.text.trim())) {
      const lines: string[] = [b.text.trim()];
      let j = i + 1;
      while (j < blocks.length) {
        const nb = blocks[j];
        if (nb.kind !== "paragraph") break;
        const t = nb.text.trim();
        if (!t || t.length > 90 || /[.!?]$/.test(t) && t.split(/\s+/).length > 10) break;
        lines.push(t);
        j++;
      }
      out.push({ kind: "signature", lines });
      i = j;
    } else {
      out.push(b);
      i++;
    }
  }
  return out;
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getDocText(doc: StructuredDoc) {
  return [
    doc.title,
    doc.subtitle ?? "",
    ...doc.blocks.flatMap((block) =>
      block.kind === "list" ? block.items : block.kind === "signature" ? block.lines : block.text,
    ),
  ].join("\n");
}

function didPreserveMeaning(source: string, structured: StructuredDoc) {
  const sourceWords = new Set(
    normalizeForCompare(source)
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
  const outputWords = normalizeForCompare(getDocText(structured))
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (!sourceWords.size || !outputWords.length) return false;
  const validWords = outputWords.filter((word) => sourceWords.has(word)).length;
  return validWords / outputWords.length > 0.82;
}

function formatRawFallback(text: string): StructuredDoc {
  const lines = text
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? "Untitled";
  const blocks: DocBlock[] = [];
  let pendingList: string[] = [];

  const flushList = () => {
    if (pendingList.length) {
      blocks.push({ kind: "list", items: pendingList });
      pendingList = [];
    }
  };

  for (const line of lines.slice(1)) {
    const bullet = line.match(/^[-•*]\s+(.+)/);
    if (bullet) {
      pendingList.push(bullet[1]);
      continue;
    }
    flushList();
    blocks.push({ kind: "paragraph", text: line });
  }
  flushList();

  return { title, subtitle: "", eyebrow: "", blocks };
}

type LayoutProfile = {
  columns: 1 | 2;
  fill: "flex-start" | "space-between" | "space-evenly";
  titleSize: number;
  subtitleSize: number;
  titleMarginTop: number;
  bodyPaddingTop: number;
  bodyPaddingBottom: number;
  bodyFont: number;
  headingFont: number;
  subheadingFont: number;
  quoteFont: number;
  lineHeight: number;
  blockGap: number;
  sectionGap: number;
  listGap: number;
  minFit: number;
  maxFit: number;
};

function getLayoutProfile(doc: StructuredDoc | null): LayoutProfile {
  const words = doc
    ? [
        doc.title,
        doc.subtitle ?? "",
        ...doc.blocks.map((block) =>
          block.kind === "list"
            ? block.items.join(" ")
            : block.kind === "signature"
              ? block.lines.join(" ")
              : block.text,
        ),
      ]
        .join(" ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0;
  const blocks = doc?.blocks.length ?? 0;
  const listItems =
    doc?.blocks.reduce((sum, block) => sum + (block.kind === "list" ? block.items.length : 0), 0) ??
    0;
  const useColumns = words > 520 || blocks > 10 || listItems > 10;

  if (words <= 150) {
    return {
      columns: 1,
      fill: "flex-start",
      titleSize: 36,
      subtitleSize: 15,
      titleMarginTop: 18,
      bodyPaddingTop: 22,
      bodyPaddingBottom: 18,
      bodyFont: 13.5,
      headingFont: 18,
      subheadingFont: 11.5,
      quoteFont: 14,
      lineHeight: 1.62,
      blockGap: 14,
      sectionGap: 8,
      listGap: 8,
      minFit: 0.86,
      maxFit: 2.4,
    };
  }

  if (words <= 320) {
    return {
      columns: 1,
      fill: "flex-start",
      titleSize: 31,
      subtitleSize: 13.5,
      titleMarginTop: 16,
      bodyPaddingTop: 18,
      bodyPaddingBottom: 14,
      bodyFont: 12.2,
      headingFont: 16.5,
      subheadingFont: 10.8,
      quoteFont: 12.8,
      lineHeight: 1.52,
      blockGap: 10,
      sectionGap: 7,
      listGap: 6,
      minFit: 0.78,
      maxFit: 1.85,
    };
  }

  if (!useColumns) {
    return {
      columns: 1,
      fill: "flex-start",
      titleSize: 27,
      subtitleSize: 12.4,
      titleMarginTop: 14,
      bodyPaddingTop: 14,
      bodyPaddingBottom: 10,
      bodyFont: 11.2,
      headingFont: 15,
      subheadingFont: 10.2,
      quoteFont: 11.8,
      lineHeight: 1.42,
      blockGap: 7,
      sectionGap: 5,
      listGap: 4,
      minFit: 0.7,
      maxFit: 1.35,
    };
  }

  return {
    columns: 2,
    fill: "flex-start",
    titleSize: words > 850 ? 23 : 25,
    subtitleSize: words > 850 ? 10.8 : 11.6,
    titleMarginTop: 11,
    bodyPaddingTop: 11,
    bodyPaddingBottom: 8,
    bodyFont: words > 850 ? 8.8 : 9.6,
    headingFont: words > 850 ? 11.4 : 12.5,
    subheadingFont: words > 850 ? 8.2 : 8.8,
    quoteFont: words > 850 ? 9.2 : 10,
    lineHeight: words > 850 ? 1.28 : 1.34,
    blockGap: words > 850 ? 4 : 5,
    sectionGap: 3,
    listGap: 2,
    minFit: 0.62,
    maxFit: 1.06,
  };
}

function DynamicBodyFit({
  children,
  deps,
  profile,
}: {
  children: ReactNode;
  deps: unknown[];
  profile: LayoutProfile;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      inner.style.setProperty("--fit-scale", "1");
      const available = outer.clientHeight;
      const availableWidth = outer.clientWidth;
      const natural = inner.scrollHeight;
      const naturalWidth = inner.scrollWidth;
      if (!available || !availableWidth || !natural || !naturalWidth) return;
      const raw = Math.min(available / natural, availableWidth / naturalWidth);
      const eased = raw >= 1 ? 1 + (raw - 1) * 0.72 : raw * 0.98;
      const next = Math.max(profile.minFit, Math.min(profile.maxFit, eased));
      setScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, profile]);

  const flowStyle = {
    "--fit-scale": scale,
    "--doc-body-font": `${profile.bodyFont}px`,
    "--doc-heading-font": `${profile.headingFont}px`,
    "--doc-subheading-font": `${profile.subheadingFont}px`,
    "--doc-quote-font": `${profile.quoteFont}px`,
    "--doc-line": profile.lineHeight,
    "--doc-block-gap": `${profile.blockGap}px`,
    "--doc-section-gap": `${profile.sectionGap}px`,
    "--doc-list-gap": `${profile.listGap}px`,
    "--doc-fill": profile.fill,
  } as CSSProperties;

  return (
    <div ref={outerRef} className="h-full w-full overflow-hidden">
      <div ref={innerRef} className="doc-flow" data-columns={profile.columns} style={flowStyle}>
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
  const profile = useMemo(() => getLayoutProfile(doc), [doc]);

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
      if (didPreserveMeaning(raw, result)) {
        setDoc({ ...result, blocks: collapseSignatures(result.blocks) });
        toast.success("Document formatted.");
      } else {
        const fb = formatRawFallback(raw);
        setDoc({ ...fb, blocks: collapseSignatures(fb.blocks) });
        toast.warning("AI changed too much, so I preserved your exact text instead.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to format document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #f5f1ec 0%, #ece6df 100%)" }}
    >
      <style>{`
        .print-page, .print-page * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        .doc-flow {
          transform: scale(var(--fit-scale));
          transform-origin: top left;
          width: calc(100% / var(--fit-scale));
          height: calc(100% / var(--fit-scale));
          font-size: var(--doc-body-font);
          line-height: var(--doc-line);
        }
        .doc-flow[data-columns="1"] {
          display: flex;
          flex-direction: column;
          justify-content: var(--doc-fill);
          gap: var(--doc-block-gap);
        }
        .doc-flow[data-columns="2"] {
          display: block;
          column-count: 2;
          column-gap: 24px;
          column-fill: balance;
          height: 100%;
        }
        .doc-flow[data-columns="2"] .doc-block { margin-bottom: var(--doc-block-gap); }
        .doc-block { break-inside: avoid; margin: 0; max-width: 100%; }
        .doc-flow[data-columns="1"] .doc-block + .doc-block { margin-top: var(--doc-section-gap); }
        .doc-heading { margin: var(--doc-section-gap) 0 0; font-size: var(--doc-heading-font); line-height: 1.12; font-weight: 800; letter-spacing: 0; }
        .doc-subheading { margin: var(--doc-section-gap) 0 0; font-size: var(--doc-subheading-font); line-height: 1.2; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; }
        .doc-paragraph { font-size: var(--doc-body-font); line-height: var(--doc-line); }
        .doc-list { display: grid; gap: var(--doc-list-gap); padding: 0; list-style: none; font-size: var(--doc-body-font); line-height: calc(var(--doc-line) * 0.96); }
        .doc-list-item { display: flex; gap: 8px; align-items: flex-start; }
        .doc-bullet { margin-top: 0.62em; display: inline-block; width: 4px; height: 4px; flex: 0 0 auto; border-radius: 999px; }
        .doc-quote { border-left-width: 3px; padding-left: 12px; font-size: var(--doc-quote-font); line-height: var(--doc-line); font-style: italic; }
        .doc-callout { border-radius: 6px; padding: 8px 12px; font-size: var(--doc-body-font); line-height: 1.28; font-weight: 650; }
        .doc-signature { font-size: var(--doc-body-font); line-height: 1.25; }
        .doc-signature .doc-signature-line { margin: 0; padding: 0; }
        .doc-signature .doc-signature-line:first-child { margin-bottom: 0.35em; }
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
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" /> Apps
          </Link>
          <div className="text-sm font-semibold text-neutral-900">Document Designer</div>
          <Button
            onClick={() => window.print()}
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={!doc}
          >
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
              Paste anything — an announcement, memo, notes. AI will pick the title, subtitle,
              headings, and lists.
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
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Formatting…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Format with AI
              </>
            )}
          </Button>
        </aside>

        {/* Preview / Print page */}
        <div className="print-root flex justify-center">
          <div
            className="print-page relative flex aspect-[8.5/11] w-full max-w-[8.5in] flex-col overflow-hidden shadow-[0_20px_60px_-20px_rgba(14,23,48,0.35)]"
            style={{
              backgroundColor: BRAND.paper,
              fontFamily: "Inter, system-ui, sans-serif",
              color: BRAND.navy,
            }}
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
            {/* Corporate seal watermark */}
            <img
              src={sealUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-12 right-6 w-[2.7in] opacity-20 mix-blend-multiply"
            />

            {/* Header */}
            <div
              className="relative z-10 flex shrink-0 items-end justify-between px-10 pt-7 pb-4"
              style={{ textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.7)" }}
            >
              <img
                src={logoUrl}
                alt={BRAND.name}
                className="h-20 w-auto drop-shadow-[0_2px_3px_rgba(255,255,255,0.8)]"
              />
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
            <div
              className="relative z-10 shrink-0 px-10"
              style={{
                textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 0 10px rgba(255,255,255,0.75)",
              }}
            >
              <div className="h-px w-full" style={{ backgroundColor: `${BRAND.navy}15` }} />
              <h1
                className="font-extrabold leading-[1.1]"
                style={{
                  color: BRAND.navy,
                  fontSize: `${profile.titleSize}px`,
                  marginTop: `${profile.titleMarginTop}px`,
                  letterSpacing: 0,
                }}
              >
                {doc?.title || "Your document title appears here"}
              </h1>
              {doc?.subtitle && (
                <p
                  className="mt-2 leading-snug"
                  style={{ color: BRAND.navy, opacity: 0.7, fontSize: `${profile.subtitleSize}px` }}
                >
                  {doc.subtitle}
                </p>
              )}
              <div
                className="mt-3 h-[2.5px] w-10 rounded-full"
                style={{ backgroundColor: BRAND.red }}
              />
            </div>

            {/* Body — auto-fits to remaining vertical space */}
            <div
              className="relative z-10 min-h-0 flex-1 px-10"
              style={{
                paddingTop: `${profile.bodyPaddingTop}px`,
                paddingBottom: `${profile.bodyPaddingBottom}px`,
                textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.7)",
              }}
            >
              {!doc ? (
                raw.trim() ? (
                  <DynamicBodyFit deps={[raw]} profile={profile}>
                    <p
                      className="doc-block doc-paragraph"
                      style={{ color: BRAND.navy, whiteSpace: "pre-wrap" }}
                    >
                      {raw}
                    </p>
                  </DynamicBodyFit>
                ) : (
                  <div
                    className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm"
                    style={{ borderColor: `${BRAND.navy}25`, color: `${BRAND.navy}80` }}
                  >
                    Paste your text on the left and click{" "}
                    <span className="font-semibold">Format with AI</span> to generate a branded
                    one-pager.
                  </div>
                )
              ) : (
                <DynamicBodyFit deps={[doc]} profile={profile}>
                  {doc.blocks.map((b, i) => (
                    <BlockView key={i} block={b} index={i} />
                  ))}
                </DynamicBodyFit>
              )}
            </div>

            {/* Footer slogan */}
            <div
              className="relative z-10 shrink-0 px-10 py-3 text-center text-[10px] italic tracking-wide"
              style={{
                color: BRAND.navy,
                opacity: 0.7,
                textShadow: "0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              {BRAND.tagline}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
