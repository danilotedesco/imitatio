Latin Audio Flashcards — Full bundle
Includes:
- vite-app/      -> React app (Vite). Run: npm install && npm run dev
- static/        -> Pure static index.html for quick offline test
- backend/       -> Flask backend (synthesize MP3). Run: pip install -r requirements.txt && python app.py

Features added:
- Play sample and rows, per-row Play
- Exam mode (Latin only)
- Pedagogical controls: pause timings, repeat Latin, repeat pause
- Theme toggle: serif/parchment and modern
- Export MP3 sending options to backend; client shows download progress when possible

How to test quickly (no build):
1) Static version: open static/index.html in a browser (or run `python -m http.server` in the static/ folder).
2) Vite React app:
   - cd vite-app
   - npm install
   - npm run dev
   - open the local dev URL shown by Vite
3) Backend (optional, for MP3 export):
   - cd backend
   - python -m venv venv
   - source venv/bin/activate   # macOS / Linux
   - pip install -r requirements.txt
   - python app.py
   - then set backend URL in the app to http://localhost:5000/synthesize

Notes:
- Browser TTS voices differ across OSs and browsers.
- The Flask backend uses gTTS and pydub. It may require ffmpeg installed on your system to manipulate audio files.

- New options for improved Latin/Greek synthesis:
   - eSpeak NG (local, free): install with `brew install espeak-ng` on macOS. The backend will attempt to call `espeak-ng` as a fallback for Latin (`la`) and Greek (`el`). eSpeak sounds robotic but often pronounces classical languages more accurately than generic voices.
   - Google Cloud Text-to-Speech (high quality): install the Python client `google-cloud-texttospeech` (already listed in `backend/requirements.txt`). Configure Google credentials via `GOOGLE_APPLICATION_CREDENTIALS` or enable runtime with `ENABLE_GOOGLE_TTS=1`. The backend will use Google TTS when available and enabled.

   - Preferred engine and voices: you can control which provider is tried first for English/front audio via environment variables:
      - `PREFERRED_ENG_ENGINE`: `edge` (default) | `google` | `polly` | `gtts`
      - `EDGE_ENG_VOICE`: Edge voice for English when `edge` is selected (default `en-US-AriaNeural`)
      - `EDGE_LATIN_FALLBACK_VOICE`: Edge voice used as an Italian-sounding fallback for Latin (default `it-IT-ElsaNeural`)
      - `GOOGLE_ENG_VOICE`: optional Google TTS voice name to force for English
      - `POLLY_ENG_VOICE`: optional Polly voice id to force for English (default `Joanna`)

   Examples:
   ```bash
   export PREFERRED_ENG_ENGINE=edge
   export EDGE_ENG_VOICE=en-US-AriaNeural
   export EDGE_LATIN_FALLBACK_VOICE=it-IT-ElsaNeural
   ```

   Listing provider voices

   You can list available provider voices (to choose good Italian/Latin voices) using these helper scripts:

   Google Cloud (requires `GOOGLE_APPLICATION_CREDENTIALS`):

   ```bash
   python tools/list_google_voices.py
   ```

   Amazon Polly (requires AWS credentials):

   ```bash
   pip install boto3
   python tools/list_polly_voices.py
   ```

   Recommended Google Italian voices to try (WaveNet family): `it-IT-Wavenet-A`, `it-IT-Wavenet-B`, `it-IT-Wavenet-C`, `it-IT-Wavenet-D`. Use `GOOGLE_LATIN_VOICE` to pick one.


Usage notes:
- To prefer Google TTS, set environment variable `ENABLE_GOOGLE_TTS=1` and ensure Google credentials are available.
- To use eSpeak NG fallback, install `espeak-ng` system package; no Python key is required.
