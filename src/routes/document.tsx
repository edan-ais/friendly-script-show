import { createFileRoute } from "@tanstack/react-router";
import { DocumentDesigner } from "@/components/DocumentDesigner";

export const Route = createFileRoute("/document")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Document Designer — Hackathon Prep" },
      { name: "description", content: "Paste text and produce a branded one-page AICD-10 document." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  component: () => <DocumentDesigner />,
});
