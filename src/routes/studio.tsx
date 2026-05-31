import { createFileRoute } from "@tanstack/react-router";
import { StudioEditor } from "@/components/studio/StudioEditor";

export const Route = createFileRoute("/studio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Studio — Hackathon Prep" },
      { name: "description", content: "Script-driven multi-track video editor with MP4 export." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  component: () => <StudioEditor />,
});
