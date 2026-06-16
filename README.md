# Imitatio

 **Imitatio** is a multilingual language-learning platform implementing the *Audio Imitatio Protocol*: a structured auditory prompt–response method using timed speech prompts and guided repetition cycles to reinforce pronunciation, phonetic memory, and active recall. It combines a modern Vite/React interface with a programmable Flask text-to-speech backend and supports configurable voices for any language.
 
 ---
 
 ## Project structure
 
 - **vite-app/** → React app (Vite). UI, pedagogical controls, export UI, exam/assessment flows  
 - **static/** → Static `index.html` for quick offline demo or smoke tests  
 - **backend/** → Flask backend that synthesizes MP3s and manages provider fallbacks  
 - **tools/** → helper scripts (voice listing, tooling)  
 - **.github/workflows/** → CI / deployment workflow examples  
 - `QUICK_START.md`, `dev.sh`, `render.yaml`

---

## Features

- Per-item and per-sample audio playback (prompt → learner response)  
- Exam/assessment mode (configurable per language)  
- Pedagogical playback controls: pause timing and repetition cycles  
- Theme toggle (classical serif/parchment vs modern UI)  
- MP3 export pipeline with backend synthesis and download progress  
- Modular TTS provider pipeline (Edge, Google TTS, Amazon Polly, eSpeak NG, gTTS)
 - MP3 export pipeline using Microsoft Edge TTS (`edge-tts`) as the single synthesis engine

---

## Quick start (local testing)

### Static demo
```bash
cd static
python -m http.server 8000
```

Open: http://localhost:8000

### Vite React app
```bash
cd vite-app
npm install
npm run dev
```

### Backend (optional — MP3 export)
```bash
cd backend
python -m venv venv
source venv/bin/activate      # macOS/Linux
# .\venv\Scripts\activate     # Windows
pip install -r requirements.txt
python app.py
```

Backend URL in app:

```
http://localhost:5000/synthesize
```

---

## Configuration

The backend now standardizes on Microsoft Edge TTS via the `edge-tts` package.

- Voice mapping and selection are centralized in `backend/voices.py` using `VOICE_MAP` and `pick_voice()`.
- The only optional environment variable used by the synthesis pipeline is `DEFAULT_VOICE_GENDER` (defaults to `female`).

Language-specific voice choices are taken from `VOICE_MAP`. If a language or gender is not recognized, the backend falls back to `en-US-JennyNeural`.

---

## Listing provider voices

### Google Cloud
```bash
python tools/list_google_voices.py
```

### Amazon Polly
```bash
pip install boto3
python tools/list_polly_voices.py
```

### eSpeak NG (local fallback)
```bash
brew install espeak-ng
```

---

## Notes & caveats

- Browser-native TTS quality varies across OS and browser  
- Backend requires `ffmpeg` for audio manipulation  
- `espeak-ng` provides strong phonetic fallback but sounds synthetic  
- Google Cloud TTS requires credentials and `ENABLE_GOOGLE_TTS=1`

---

## Methodology — Audio Imitatio Protocol

The **Audio Imitatio Protocol** uses timed auditory prompts followed by guided imitation cycles:

prompt → imitation → spaced pause → repeated prompt

This structure optimizes phonetic acquisition, pronunciation stability, and active recall across languages.

---

## Multilingual recommendations

- Use ISO language codes (`English`, `Portuguese`, `Spanish`, `French`, `Italian`, `Greek`, `Latin`, `Polish`,`German`,`Russian`)  
- Choose fallback voices with similar phonology when native voices are weak  
- Enable exam mode for research or measurable assessment

---

 ## Development
 
 - See `QUICK_START.md` for deployment details  
 - CI workflows are in `.github/workflows/`  
 - New TTS providers should include helper scripts in `tools/`

---

## License

Add your preferred license file (`LICENSE`) and maintainer contact info.
