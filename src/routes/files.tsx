import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText } from "lucide-react";

export const Route = createFileRoute("/files")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Files — Hackathon Prep" },
      { name: "description", content: "Download key documents on demand." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: FilesPage,
});

type FileItem = {
  name: string;
  description: string;
  href: string;
  filename: string;
};

const FILES: FileItem[] = [
  {
    name: "Postmoney SAFE — MFN Only",
    description: "Y Combinator Postmoney SAFE (MFN-only) — final signed template.",
    href: "/files/postmoney-safe-mfn.pdf",
    filename: "Postmoney-SAFE-MFN-Only.pdf",
  },
  {
    name: "Wire Transfer Instructions",
    description: "AICD-10 incoming wire details (domestic & international) on branded letterhead.",
    href: "/files/wire-transfer-instructions.pdf",
    filename: "AICD10-Wire-Transfer-Instructions.pdf",
  },
];

function FilesPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #f5f1ec 0%, #ece6df 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" /> Apps
          </Link>
          <div className="text-sm font-semibold text-neutral-900">Files</div>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-[#0e1730]">Documents</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Tap any file to download. Keep these handy — you can grab them any time.
          </p>
        </div>

        <ul className="space-y-3">
          {FILES.map((f) => (
            <li
              key={f.href}
              className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[#ef3340]/40 hover:shadow-md"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: "#fdf6f0", color: "#ef3340" }}
              >
                <FileText className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[#0e1730]">{f.name}</div>
                <div className="truncate text-xs text-neutral-500">{f.description}</div>
              </div>
              <a
                href={f.href}
                download={f.filename}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition active:scale-95"
                style={{ backgroundColor: "#ef3340" }}
              >
                <Download className="h-4 w-4" /> Download
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
