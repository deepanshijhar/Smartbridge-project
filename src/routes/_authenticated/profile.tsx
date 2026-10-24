import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, LayoutGrid, Trophy, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Teacher profile — EduSense AI" },
      { name: "description", content: "Teaching effectiveness, strengths and class history." },
      { property: "og:title", content: "Teacher profile — EduSense AI" },
      { property: "og:description", content: "Teaching effectiveness, strengths and class history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["class_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_sessions").select("*").order("started_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const avg = sessions.length ? sessions.reduce((s, x) => s + Number(x.avg_engagement), 0) / sessions.length : 0;
  const recent = sessions.slice(0, 5);
  const older = sessions.slice(5, 10);
  const avgOf = (a: typeof sessions) => (a.length ? a.reduce((s, x) => s + Number(x.avg_engagement), 0) / a.length : 0);
  const trend = older.length ? Math.round(avgOf(recent) - avgOf(older)) : null;
  const highShare = sessions.length ? Math.round((sessions.filter((s) => Number(s.avg_engagement) >= 80).length / sessions.length) * 100) : 0;
  const totalMin = Math.round(sessions.reduce((s, x) => s + x.duration_sec, 0) / 60);

  const tipCounts = new Map<string, number>();
  sessions.forEach((s) => (s.suggestions as { text: string }[]).forEach((t) => tipCounts.set(t.text, (tipCounts.get(t.text) ?? 0) + 1)));
  const topTips = [...tipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="font-display font-semibold">Teacher Central</span>
        <Button asChild variant="outline" size="sm"><Link to="/dashboard"><LayoutGrid className="h-4 w-4" /> Back to Dashboard</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-3xl font-bold">Teacher Profile</h1>
        <p className="text-sm text-muted-foreground">Effectiveness Dashboard & Insights</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="panel relative p-6">
            <Award className="absolute right-6 top-6 h-12 w-12 text-muted-foreground/30" />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Teaching effectiveness</div>
            <div className="mt-2 font-display text-5xl font-bold text-success">{avg.toFixed(1)}<span className="text-lg text-muted-foreground"> / 100</span></div>
            {trend !== null && (
              <span className="mt-3 inline-flex items-center gap-1 rounded bg-success/15 px-2 py-0.5 text-xs text-success"><TrendingUp className="h-3 w-3" /> {trend >= 0 ? "+" : ""}{trend} vs earlier sessions</span>
            )}
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Trophy className="h-3 w-3 text-warning" /> Strengths</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>• High engagement sessions ({highShare}%)</li>
              <li>• {sessions.length} sessions, {totalMin} minutes taught</li>
              <li>• Peak class size: {Math.max(0, ...sessions.map((s) => s.peak_students))}</li>
            </ul>
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><BookOpen className="h-3 w-3 text-primary" /> Recommendations</div>
            <ul className="mt-3 space-y-2 text-sm">
              {topTips.length === 0 && <li className="text-muted-foreground">Run a few sessions to get recommendations.</li>}
              {topTips.map(([t, n]) => <li key={t}>• {t} <span className="text-muted-foreground">({n}×)</span></li>)}
            </ul>
          </div>
        </div>

        <h2 className="font-display mt-10 text-xl font-bold">Class History Comparison</h2>
        {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : sessions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No saved sessions yet — end a live session to save it here.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {sessions.map((s) => (
              <div key={s.id} className="panel p-5">
                <div className="font-semibold">{s.class_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleString()}</div>
                <div className="mono mt-2 text-primary">{Math.round(Number(s.avg_engagement))}% Avg</div>
                <div className="mt-2 text-xs text-muted-foreground">{Math.round(s.duration_sec / 60)} min · {s.peak_students} students · {s.avg_noise_db ?? "—"} dB</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
