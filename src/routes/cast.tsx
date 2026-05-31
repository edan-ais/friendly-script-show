import { createFileRoute } from "@tanstack/react-router";
import { ScreenCast } from "@/components/ScreenCast";

export const Route = createFileRoute("/cast")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Screen Cast — Prompter" },
      {
        name: "description",
        content:
          "Record your screen with your face in the corner — like Loom — with a teleprompter overlay.",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: () => <ScreenCast />,
});
