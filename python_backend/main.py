"""Local-only FastAPI analysis service. No recordings, credentials or persistence."""
import os
from typing import Annotated
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict, model_validator
from .analysis import analyze

Number = Annotated[float, Field(allow_inf_nan=False)]
Percent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Timestamp = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class Track(BaseModel):
    id: int = Field(ge=1)
    firstSeen: Timestamp
    lastSeen: Timestamp
    attention: Percent
    present: bool

    @model_validator(mode="after")
    def ordered(self):
        if self.lastSeen < self.firstSeen:
            raise ValueError("lastSeen must follow firstSeen")
        return self


class Point(BaseModel):
    t: int = Field(ge=0)
    score: Percent | None
    students: int = Field(ge=0)
    db: Number | None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    now: Timestamp
    t: int = Field(ge=0)
    tracks: list[Track] = Field(max_length=500)
    samples: list[Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]] = Field(default_factory=list, max_length=4096)
    db: Number | None = None
    timeline: list[Point] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def valid_tracks(self):
        if any(t.lastSeen > self.now for t in self.tracks):
            raise ValueError("Track timestamps cannot be in the future")
        if len({t.id for t in self.tracks}) != len(self.tracks):
            raise ValueError("Track IDs must be unique")
        return self


app = FastAPI(title="EduSense local analysis", docs_url="/docs")
origins = [o.strip() for o in os.getenv("EDUSENSE_ALLOWED_ORIGINS", "http://localhost:8080").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST", "GET"],
                   allow_headers=["Content-Type", "X-EduSense-Client"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze_request(payload: AnalysisRequest, request: Request):
    # A custom header prevents simple cross-site form requests; CORS restricts browser callers.
    # This is NOT authentication: bind only to 127.0.0.1, never expose it publicly.
    if request.headers.get("x-edusense-client") != "local-analysis":
        raise HTTPException(403, "Local analysis client header required")
    origin = request.headers.get("origin")
    if origin and origin not in origins:
        raise HTTPException(403, "Origin not allowed")
    return analyze(payload.model_dump())