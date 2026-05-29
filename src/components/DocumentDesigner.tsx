import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import logoUrl from "@/assets/aicd10-logo.png";

const BRAND = {
  name: "AICD-10",
  tagline: "The AI infrastructure for clinical documentation & reimbursement.",
  website: "aicd10.com",
  red: "#ef3340",
  navy: "#0e1730",
  cream: "#f9eee8",
};

export function DocumentDesigner() {
  const [title, setTitle] = useState("Untitled Document");
  const [subtitle, setSubtitle] = useState("Internal Memo");
  const [body, setBody] = useState(
    "Paste your document text here.\n\nEach blank line becomes a new paragraph. Use this one-pager for memos, briefs, or summaries — it will be styled with the AICD-10 brand automatically.",
  );
  const [author, setAuthor] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const paragraphs = useMemo(
    () => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    [body],
  );

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const handlePrint = () => {
    window.print();
  };

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

      {/* Toolbar */}
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

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[340px_1fr]">
        {/* Editor */}
        <aside className="no-print space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm h-fit lg:sticky lg:top-20">
          <div>
            <Label htmlFor="doc-title" className="text-neutral-700">Title</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 bg-white text-neutral-900" />
          </div>
          <div>
            <Label htmlFor="doc-subtitle" className="text-neutral-700">Subtitle / Category</Label>
            <Input id="doc-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1.5 bg-white text-neutral-900" />
          </div>
          <div>
            <Label htmlFor="doc-author" className="text-neutral-700">Author (optional)</Label>
            <Input id="doc-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Jane Doe" className="mt-1.5 bg-white text-neutral-900" />
          </div>
          <div>
            <Label htmlFor="doc-body" className="text-neutral-700">Body</Label>
            <Textarea
              id="doc-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="mt-1.5 resize-none bg-white font-mono text-sm text-neutral-900"
            />
            <p className="mt-1.5 text-xs text-neutral-500">Separate paragraphs with a blank line.</p>
          </div>
          <Button onClick={handlePrint} variant="outline" className="w-full gap-2">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </aside>

        {/* Preview / Print page */}
        <div className="flex justify-center">
          <div
            ref={printRef}
            className="print-page relative aspect-[8.5/11] w-full max-w-[8.5in] overflow-hidden bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)]"
            style={{ fontFamily: "Inter, system-ui, sans-serif", color: BRAND.navy }}
          >
            {/* Top brand bar */}
            <div
              className="flex items-center justify-between px-12 py-6"
              style={{ backgroundColor: BRAND.cream, borderBottom: `4px solid ${BRAND.red}` }}
            >
              <img src={logoUrl} alt={BRAND.name} className="h-12 w-auto" />
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.red }}>
                  {subtitle || "Document"}
                </div>
                <div className="text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>
                  {today}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-12 py-10">
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight" style={{ color: BRAND.navy }}>
                {title || "Untitled"}
              </h1>
              <div className="mt-2 h-1 w-16 rounded-full" style={{ backgroundColor: BRAND.red }} />
              {author && (
                <div className="mt-4 text-sm" style={{ color: BRAND.navy, opacity: 0.75 }}>
                  By <span className="font-semibold">{author}</span>
                </div>
              )}

              <div className="mt-8 space-y-4 text-[14.5px] leading-relaxed" style={{ color: BRAND.navy }}>
                {paragraphs.length === 0 ? (
                  <p style={{ opacity: 0.4 }}>Your document body will appear here.</p>
                ) : (
                  paragraphs.map((p, i) => <p key={i}>{p}</p>)
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-between px-12 py-4 text-[11px]"
              style={{ borderTop: `1px solid ${BRAND.cream}`, color: BRAND.navy }}
            >
              <span className="font-semibold" style={{ color: BRAND.red }}>{BRAND.name}</span>
              <span style={{ opacity: 0.7 }}>{BRAND.tagline}</span>
              <span style={{ opacity: 0.7 }}>{BRAND.website}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
