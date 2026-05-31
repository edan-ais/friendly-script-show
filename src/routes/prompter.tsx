import { createFileRoute } from "@tanstack/react-router";
import { Teleprompter } from "@/components/Teleprompter";

export const Route = createFileRoute("/prompter")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Prompter — Hackathon Prep" },
      { name: "description", content: "Paste your script, scroll it on screen, and record yourself in one place." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  component: () => <Teleprompter />,
});
