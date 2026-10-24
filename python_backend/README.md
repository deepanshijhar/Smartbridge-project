# Local EduSense Python service

The existing interface, browser camera detection, anonymous tracking, login and saved class history stay unchanged. Python computes attendance confirmation, PCM audio RMS/dBFS, weighted engagement and teaching suggestions when connected. If it is not configured or fails, the existing browser logic continues automatically.

Skill Wallet is the assignment website; no additional workflow specification was provided.

## Run locally

From the project root (Python 3.11+):

```sh
python3 -m venv python_backend/.venv
python_backend/.venv/bin/pip install -r python_backend/requirements.txt
python_backend/.venv/bin/python -m uvicorn python_backend.main:app --host 127.0.0.1 --port 8000
```

For a local frontend, set `VITE_PYTHON_ANALYSIS_URL=http://127.0.0.1:8000` in `.env.local` before starting the frontend. Leave unset to keep the current browser-only behavior. Tests: `python_backend/.venv/bin/python -m unittest discover -s python_backend -p 'test_*.py'` (install `httpx` separately to run endpoint tests).

For the hosted preview, a local HTTP service may be blocked by browser local-network or mixed-content restrictions. Use an HTTPS service with authentication before public use; do not bind this unauthenticated local service to `0.0.0.0` or expose it through a public tunnel. Configure `EDUSENSE_ALLOWED_ORIGINS` as a comma-separated exact list when changing frontend origins. No wildcard origins are enabled.

## Contract and limitations

`POST /analyze` takes `now` (epoch milliseconds), `t` (session seconds), anonymous tracks (`id`, `firstSeen`, `lastSeen`, `attention`, `present`), up to 4096 normalized PCM samples, optional fallback `db`, and the last 10 timeline points. It returns `point`, `presentIds`, `audio`, and `suggestions`. Include `X-EduSense-Client: local-analysis`. `/docs` contains request schemas; `/health` checks availability.

- Attendance remains cumulative anonymous participation, not named student identification. A track confirms after more than 3000ms of observed span; already-confirmed tracks stay counted. Visibility for presence uses the existing 500ms cutoff.
- Audio is amplitude in **dBFS**, not calibrated room SPL, speech recognition, or identification of who is speaking. Short PCM windows are sent only when configured; they are processed in memory, not recorded or logged.
- Weights remain attention 50%, presence 30%, audio 20%, with missing inputs excluded. Suggestions use the current deterministic rules, not generative AI. Emotion display remains simulated.
- Face detection stays in the browser's existing MediaPipe implementation. OpenCV and Python MediaPipe would duplicate working capture and require sending images, so neither is added. NumPy is used for actual PCM analysis; Librosa and Pandas are unnecessary for the current amplitude/trend calculations. SQLite is unnecessary because existing class history already has persistence.
- No new dependencies are added to the frontend. No existing database or authentication behavior is replaced.

## Remaining tasks

1. Run on your local machine and connect a locally running frontend, then verify a real camera/microphone session and saved history.
2. For hosted use, deploy Python separately with HTTPS, authenticated access, explicit allowed origins and appropriate privacy consent. Lovable hosting does not run Python.
3. Supply any additional assignment criteria if named attendance, richer audio features or other Skill Wallet requirements are expected.