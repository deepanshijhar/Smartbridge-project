import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, BarChart3, Lightbulb, LogOut, Play, Square, Trophy, Users, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeWithPython } from "@/lib/python-analysis";
import {
  attentionFromKeypoints, audioScore, classifyAudio, combineScore, suggest,
  type Suggestion, type TimelinePoint,
} from "@/lib/engagement";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Live session — EduSense AI" },
      { name: "description", content: "Run a live attendance and engagement session." },
      { property: "og:title", content: "Live session — EduSense AI" },
      { property: "og:description", content: "Run a live attendance and engagement session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Track = {
  id: number; x: number; y: number; w: number; h: number;
  firstSeen: number; lastSeen: number; attention: number; points: number; present: boolean;
};

const PRESENCE_MS = 3000; // sustained presence before counting attendance
const LOST_MS = 2000;
// Prototype only: emotion is simulated, not inferred from faces.
const EMOTIONS = ["engaged", "focused", "neutral", "curious", "confused"];

function Dashboard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracksRef = useRef<Track[]>([]);
  const nextId = useRef(1);
  const dbRef = useRef<number | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const timelineRef = useRef<TimelinePoint[]>([]);
  const startRef = useRef(0);
  const generationRef = useRef(0);
  const tipsRef = useRef<Suggestion[]>([]);
  const navigate = useNavigate();

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [className, setClassName] = useState("CS101");
  const [elapsed, setElapsed] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [db, setDb] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [tips, setTips] = useState<Suggestion[]>([]);

  useEffect(() => () => stopRef.current(), []);

  async function start() {
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() =>
        navigator.mediaDevices.getUserMedia({ video: true }),
      );
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((t) => t.stop()); throw new Error("Camera view unavailable"); }
      video.srcObject = stream;
      await video.play();

      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
      );
      const detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });

      // Audio
      let audioCtx: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      if (stream.getAudioTracks().length) {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
      } else toast.info("No microphone — scoring without audio.");
      const buf = new Float32Array(2048);

      tracksRef.current = [];
      nextId.current = 1;
      timelineRef.current = [];
      dbRef.current = null;
      tipsRef.current = [];
      setTips([]);
      const generation = ++generationRef.current;
      startRef.current = Date.now();
      let raf = 0;
      let lastDetect = 0;

      const loop = () => {
        const now = performance.now();
        if (now - lastDetect > 150 && video.readyState >= 2) {
          lastDetect = now;
          const res = detector.detectForVideo(video, now);
          updateTracks(res.detections, video.videoWidth, video.videoHeight);
          draw();
          if (analyser) {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += v * v;
            const rms = Math.sqrt(sum / buf.length);
            dbRef.current = rms > 0 ? 20 * Math.log10(rms) : -100;
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      // 1 Hz aggregation
      let analyzing = false;
      const tick = setInterval(async () => {
        if (analyzing) return;
        analyzing = true;
        const present = tracksRef.current.filter((t) => t.present);
        const visible = tracksRef.current.filter((t) => Date.now() - t.lastSeen < 500);
        const attention = present.length
          ? present.reduce((s, t) => s + t.attention, 0) / present.length
          : null;
        const presence = present.length
          ? Math.round((present.filter((t) => visible.includes(t)).length / present.length) * 100)
          : null;
        const curDb = dbRef.current;
        const s = combineScore({ attention, presence, audio: audioScore(curDb) });
        present.forEach((t) => { if (t.attention > 60) t.points += 1; });
        const now = Date.now();
        const fallback = { t: Math.round((now - startRef.current) / 1000), score: s, students: present.length, db: curDb };
        const python = await analyzeWithPython({
          now, t: fallback.t,
          tracks: tracksRef.current.map(({ id, firstSeen, lastSeen, attention, present }) => ({ id, firstSeen, lastSeen, attention, present })),
          samples: analyser ? Array.from(buf) : [], db: curDb, timeline: timelineRef.current.slice(-10),
        });
        analyzing = false;
        if (generationRef.current !== generation) return;
        const pt = python?.point ?? fallback;
        if (python) {
          const ids = new Set(python.presentIds);
          tracksRef.current.forEach((track) => { if (ids.has(track.id)) track.present = true; });
        }
        timelineRef.current = [...timelineRef.current, pt];
        setTimeline(timelineRef.current.slice(-60));
        setScore(pt.score);
        setDb(pt.db);
        setTracks([...tracksRef.current]);
        setElapsed(pt.t);
        if (pt.t % 5 === 0 || python) {
          tipsRef.current = python?.suggestions ?? suggest(timelineRef.current);
          setTips(tipsRef.current);
        }
      }, 1000);

      stopRef.current = () => {
        generationRef.current += 1;
        cancelAnimationFrame(raf);
        clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        audioCtx?.close();
        detector.close();
        stopRef.current = () => {};
      };
      setRunning(true);
    } catch (e) {
      toast.error("Could not start camera: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function updateTracks(dets: { boundingBox?: { originX: number; originY: number; width: number; height: number }; keypoints: { x: number; y: number }[] }[], vw: number, vh: number) {
    const now = Date.now();
    const used = new Set<number>();
    for (const d of dets) {
      const b = d.boundingBox;
      if (!b) continue;
      const cx = b.originX + b.width / 2;
      const cy = b.originY + b.height / 2;
      let best: Track | null = null;
      let bestDist = Infinity;
      for (const t of tracksRef.current) {
        if (used.has(t.id)) continue;
        const dist = Math.hypot(t.x + t.w / 2 - cx, t.y + t.h / 2 - cy);
        if (dist < bestDist && dist < Math.max(b.width, 80)) { best = t; bestDist = dist; }
      }
      const kp = d.keypoints;
      const att = kp[0] && kp[1] && kp[2] ? attentionFromKeypoints(kp[0], kp[1], kp[2]) : 50;
      if (!best) {
        best = { id: nextId.current++, x: b.originX, y: b.originY, w: b.width, h: b.height, firstSeen: now, lastSeen: now, attention: att, points: 0, present: false };
        tracksRef.current.push(best);
      }
      Object.assign(best, { x: b.originX, y: b.originY, w: b.width, h: b.height, lastSeen: now, attention: Math.round(best.attention * 0.7 + att * 0.3) });
      if (!best.present && now - best.firstSeen > PRESENCE_MS) best.present = true;
      used.add(best.id);
    }
    tracksRef.current = tracksRef.current.filter((t) => t.present || now - t.lastSeen < LOST_MS);
    const c = canvasRef.current;
    if (c && (c.width !== vw || c.height !== vh)) { c.width = vw; c.height = vh; }
  }

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const css = getComputedStyle(document.documentElement);
    const ok = css.getPropertyValue("--success").trim();
    const warn = css.getPropertyValue("--warning").trim();
    for (const t of tracksRef.current) {
      if (Date.now() - t.lastSeen > 500) continue;
      const engaged = t.attention > 60;
      ctx.strokeStyle = engaged ? ok : warn;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      // video is mirrored with CSS; mirror the overlay too
      ctx.strokeRect(t.x, t.y, t.w, t.h);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.font = "bold 18px JetBrains Mono, monospace";
      ctx.fillText(`ID: ${t.id} | ${t.present ? (engaged ? "engaged" : "distracted") : "detecting…"}`, -(t.x + t.w), t.y - 8);
      ctx.restore();
    }
  }

  async function end() {
    stopRef.current();
    setRunning(false);
    const tl = timelineRef.current;
    const lastPoint = tl[tl.length - 1];
    const scored = tl.filter((p) => p.score !== null);
    const dbs = tl.map((p) => p.db).filter((d): d is number => d !== null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || tl.length < 2 || !lastPoint) { toast.info("Session too short to save."); return; }
    const { error } = await supabase.from("class_sessions").insert({
      user_id: u.user.id,
      class_name: className || "Untitled class",
      started_at: new Date(startRef.current).toISOString(),
      duration_sec: lastPoint.t,
      avg_engagement: scored.length ? Math.round(scored.reduce((s, p) => s + (p.score ?? 0), 0) / scored.length) : 0,
      peak_students: Math.max(0, ...tl.map((p) => p.students)),
      avg_noise_db: dbs.length ? Math.round((dbs.reduce((a, b) => a + b, 0) / dbs.length) * 10) / 10 : null,
      timeline: tl as never,
      suggestions: (import.meta.env['VITE_PYTHON_ANALYSIS_URL'] ? tipsRef.current : suggest(tl)) as never,
    });
    if (error) toast.error(error.message);
    else toast.success("Session saved to your history.");
  }

  async function signOut() {
    stopRef.current();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const present = tracks.filter((t) => t.present);
  const leaderboard = [...present].sort((a, b) => b.points - a.points).slice(0, 5);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const emotionCounts = EMOTIONS.map((e, i) => ({ e, n: present.filter((t) => (t.id + Math.floor(elapsed / 20)) % EMOTIONS.length === i).length }));

  return (
    <div className="grid min-h-screen grid-cols-1 gap-3 bg-background p-3 lg:grid-cols-[220px_1fr_280px]">
      {/* Sidebar */}
      <aside className="panel flex flex-col gap-3 p-4">
        <div>
          <h1 className="font-display text-lg font-bold text-primary">EduSense AI</h1>
          <p className="text-xs text-muted-foreground">Classroom Intelligence</p>
        </div>
        <div className="panel-inset p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className={`h-2 w-2 rounded-full ${running ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
            {running ? "SESSION ACTIVE" : "IDLE"}
          </div>
          <div className="mono mt-1 text-sm text-muted-foreground">{mm}:{ss}</div>
        </div>
        <div className="panel-inset p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">Students Present <Users className="h-3 w-3" /></div>
          <div className="font-display text-3xl font-bold">{present.length}</div>
        </div>
        {!running && <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class name" />}
        {running ? (
          <Button variant="destructive" onClick={end}><Square className="h-4 w-4" /> End Session</Button>
        ) : (
          <Button onClick={start} disabled={loading}><Play className="h-4 w-4" /> {loading ? "Starting…" : "Start Session"}</Button>
        )}
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3 text-sm">
          <Link to="/profile" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><BarChart3 className="h-4 w-4" /> Teacher profile</Link>
          <button onClick={signOut} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-col gap-3">
        <div className="panel relative aspect-video overflow-hidden bg-card">
          <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />
          {running && <span className="mono absolute left-3 top-3 rounded border border-success px-2 py-0.5 text-xs text-success">● LIVE</span>}
          {score !== null && (
            <div className="panel absolute right-3 top-3 px-3 py-2 text-right">
              <div className="text-[10px] uppercase text-muted-foreground">Engagement</div>
              <div className="font-display text-2xl font-bold text-primary">{score}%</div>
            </div>
          )}
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Press Start Session to turn on the camera. Nothing is recorded.
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="panel p-4">
            <h2 className="panel-title"><Trophy className="h-3 w-3" /> Live Leaderboard</h2>
            <div className="mt-3 space-y-2">
              {leaderboard.length === 0 && <p className="text-xs text-muted-foreground">No students tracked yet.</p>}
              {leaderboard.map((t, i) => (
                <div key={t.id} className="panel-inset flex items-center justify-between px-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-background">{i + 1}</span>Student {t.id}</span>
                  <span className="mono text-xs text-success">{t.points} pts</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel p-4">
            <h2 className="panel-title"><Lightbulb className="h-3 w-3" /> AI Suggestion Box</h2>
            <div className="mt-3 space-y-2">
              {tips.length === 0 && <p className="text-xs text-muted-foreground">Suggestions appear after a few seconds of data.</p>}
              {tips.map((s) => (
                <div key={s.text} className={`rounded-md border p-3 ${s.priority === "high" ? "border-destructive/50 bg-destructive/10" : "border-border bg-secondary"}`}>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.priority === "high" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{s.priority} priority</span>
                  <p className="mt-1.5 text-sm font-medium">{s.text}</p>
                  <p className="text-xs text-muted-foreground">↗ Impact: {s.impact}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Right */}
      <aside className="flex flex-col gap-3">
        <section className="panel p-4">
          <h2 className="panel-title"><Activity className="h-3 w-3" /> Engagement Trend</h2>
          <div className="mt-3 flex h-24 items-end gap-[2px]">
            {timeline.map((p, i) => (
              <div key={i} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${p.score ?? 0}%` }} />
            ))}
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="panel-title"><Activity className="h-3 w-3" /> Emotion Live <span className="ml-auto text-[9px] normal-case text-muted-foreground">simulated</span></h2>
          <div className="mt-3 space-y-1.5">
            {emotionCounts.map(({ e, n }) => (
              <div key={e} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted-foreground">{e}</span>
                <div className="h-2 flex-1 rounded bg-secondary"><div className="h-2 rounded bg-accent" style={{ width: `${present.length ? (n / present.length) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="panel-title"><Volume2 className="h-3 w-3" /> Audio Context</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="panel-inset p-2"><div className="text-[10px] text-muted-foreground">Noise Level</div><div className="mono text-sm">{db === null ? "—" : `${db.toFixed(1)} dB`}</div></div>
            <div className="panel-inset p-2"><div className="text-[10px] text-muted-foreground">Activity</div><div className="mono text-xs">{classifyAudio(db)}</div></div>
          </div>
        </section>
        <section className="panel p-4 text-xs text-muted-foreground">
          <h2 className="panel-title mb-2">How the score works</h2>
          Attention 50% (head facing forward) · Presence 30% (students still in view) · Audio 20% (healthy noise level). Missing signals are skipped. Students get anonymous IDs and count as present after 3 seconds.
        </section>
      </aside>
    </div>
  );
}
