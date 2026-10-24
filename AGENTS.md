<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep Python analysis in `python_backend/` as an optional loopback FastAPI service; this hosting cannot execute Python, and the browser implementation must remain an unconfigured/error fallback.
- Keep browser MediaPipe capture and existing authenticated class-history persistence; send only anonymous track metadata and short PCM windows to the optional service to avoid duplicating working detection or storing media.
