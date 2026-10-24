"""Browser-compatible heuristics; these are proxies, not emotion or identity inference."""
import math
import numpy as np


def rounded(value):
    # Match JavaScript Math.round for nonnegative engagement scores.
    return math.floor(value + 0.5)


def audio_analysis(samples, db):
    if samples:
        rms = float(np.sqrt(np.mean(np.square(np.asarray(samples, dtype=np.float64)))))
        db = 20 * math.log10(rms) if rms > 0 else -100.0
    if db is None:
        return {"db": None, "score": None, "activity": "no_audio"}
    for threshold, score, label in [(-60, 55, "silent"), (-45, 85, "quiet_focus"),
                                    (-30, 100, "normal_discussion"), (-18, 60, "loud")]:
        if db < threshold:
            return {"db": db, "score": score, "activity": label}
    return {"db": db, "score": 30, "activity": "chaotic"}


def combine_score(attention, presence, audio):
    values = [(attention, 0.5), (presence, 0.3), (audio, 0.2)]
    available = [(v, w) for v, w in values if v is not None and math.isfinite(v)]
    if not available:
        return None
    return rounded(sum(v * w for v, w in available) / sum(w for _, w in available))


def suggestions(timeline):
    recent = [p for p in timeline if p["score"] is not None][-10:]
    if len(recent) < 3:
        return []
    avg = sum(p["score"] for p in recent) / len(recent)
    dbs = [p["db"] for p in recent if p["db"] is not None]
    avg_db = sum(dbs) / len(dbs) if dbs else None
    out = []
    def add(priority, text, impact):
        out.append({"priority": priority, "text": text, "impact": impact})
    if avg < 50:
        add("high", "Engagement is low — try a quick interactive poll", "Re-engagement")
    if recent[0]["score"] - recent[-1]["score"] >= 15:
        add("high", "Attention is dropping — take a 2-minute break", "Focus recovery")
    if avg_db is not None and avg_db > -18:
        add("medium", "Room is very loud — refocus with a clear task", "Classroom control")
    if avg_db is not None and avg_db < -60 and avg < 70:
        add("medium", "Class is silent — ask an open question", "Participation")
    if avg >= 80:
        add("low", "Engagement is high — challenge with a harder problem", "Deep learning")
    return out


def analyze(payload):
    now = payload["now"]
    confirmed = [t for t in payload["tracks"]
                 if t["present"] or t["lastSeen"] - t["firstSeen"] > 3000]
    attention = sum(t["attention"] for t in confirmed) / len(confirmed) if confirmed else None
    visible = sum(now - t["lastSeen"] < 500 for t in confirmed)
    presence = rounded(100 * visible / len(confirmed)) if confirmed else None
    audio = audio_analysis(payload["samples"], payload["db"])
    point = {"t": payload["t"], "score": combine_score(attention, presence, audio["score"]),
             "students": len(confirmed), "db": audio["db"]}
    return {"point": point, "presentIds": [t["id"] for t in confirmed],
            "audio": audio, "suggestions": suggestions(payload["timeline"] + [point])}