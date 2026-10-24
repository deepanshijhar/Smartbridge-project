import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduSense AI — Classroom attendance & engagement" },
      { name: "description", content: "Live camera attendance, classroom audio context and engagement scores with teaching suggestions." },
      { property: "og:title", content: "EduSense AI — Classroom attendance & engagement" },
      { property: "og:description", content: "Live camera attendance, classroom audio context and engagement scores with teaching suggestions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  ["Vision", "Detects and tracks faces with anonymous IDs. Attendance counts only after sustained presence."],
  ["Audio", "Measures classroom noise level and activity — no recordings are stored."],
  ["Engagement", "Transparent score from attention, presence and audio, with live teaching tips."],
];

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <span className="mono text-xs uppercase tracking-widest text-primary">Classroom intelligence</span>
        <h1 className="font-display mt-4 text-5xl font-bold leading-tight text-foreground md:text-6xl">
          See who's here.<br />Know who's <span className="text-primary">with you.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          EduSense AI combines your camera and microphone to take attendance and measure engagement — privately, in your browser.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/dashboard">Start a session</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
        </div>
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map(([t, d]) => (
            <div key={t} className="panel p-6">
              <h3 className="font-display font-semibold text-foreground">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
