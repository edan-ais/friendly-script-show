import { createFileRoute, Link } from "@tanstack/react-router";
import { Video, FileText, Sparkles, FolderOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Hackathon Prep — Apps" },
      { name: "description", content: "All your hackathon prep tools in one place." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  component: Home,
});

type AppTile = {
  to: string;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  gradient: string;
};

const apps: AppTile[] = [
  {
    to: "/prompter",
    name: "Prompter",
    tagline: "Teleprompter + recorder",
    icon: <Video className="h-12 w-12" strokeWidth={2.25} />,
    gradient: "from-amber-300 via-orange-400 to-rose-500",
  },
  {
    to: "/cast",
    name: "Screen Cast",
    tagline: "Loom-style screen + face",
    icon: <MonitorUp className="h-12 w-12" strokeWidth={2.25} />,
    gradient: "from-sky-300 via-blue-500 to-indigo-700",
  },
  {
    to: "/document",
    name: "Document",
    tagline: "Branded one-pagers",
    icon: <FileText className="h-12 w-12" strokeWidth={2.25} />,
    gradient: "from-rose-500 via-red-600 to-rose-900",
  },
  {
    to: "/studio",
    name: "Studio",
    tagline: "Script-to-video editor",
    icon: <Film className="h-12 w-12" strokeWidth={2.25} />,
    gradient: "from-violet-400 via-fuchsia-500 to-purple-700",
  },
  {
    to: "/files",
    name: "Files",
    tagline: "Download key docs",
    icon: <FolderOpen className="h-12 w-12" strokeWidth={2.25} />,
    gradient: "from-emerald-300 via-teal-500 to-cyan-700",
  },
];

function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1a0608] via-[#0f0f1a] to-[#0a0a14] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-14 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Hackathon Prep
          </div>
          <h1 className="font-display text-5xl font-bold text-white sm:text-6xl">Your toolkit.</h1>
          <p className="mx-auto mt-3 max-w-md text-white/60">
            Tap an app to get to work. More tools coming as we build them.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
          {apps.map((app) => (
            <Link
              key={app.to}
              to={app.to}
              className="group flex flex-col items-center gap-2.5 focus:outline-none"
            >
              <div
                className={`relative aspect-square w-full overflow-hidden rounded-[28%] bg-gradient-to-br ${app.gradient} p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-95`}
              >
                <div className="flex h-full w-full items-center justify-center text-white drop-shadow">
                  {app.icon}
                </div>
                <div className="pointer-events-none absolute inset-0 rounded-[28%] bg-gradient-to-b from-white/15 to-transparent" />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-white">{app.name}</div>
                <div className="text-[11px] text-white/50">{app.tagline}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
