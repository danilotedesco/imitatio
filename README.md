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

The backend supports multiple TTS providers with fallback logic.

### Environment variables

```bash
export PREFERRED_TTS_ENGINE=edge   # edge | google | polly | gtts | espeak

export EDGE_VOICE=en-US-AriaNeural
export EDGE_FALLBACK_VOICE=it-IT-ElsaNeural

export ENABLE_GOOGLE_TTS=1
export GOOGLE_TTS_VOICE=it-IT-Wavenet-A

export POLLY_TTS_VOICE=Joanna

# language-specific overrides
export GOOGLE_TTS_VOICE_fr=fr-FR-Wavenet-A
export EDGE_VOICE_es=es-ES-ElviraNeural
```

Notes:

- Provider priority is controlled by `PREFERRED_TTS_ENGINE`  
- Language overrides use ISO codes (`_fr`, `_es`, `_la`, etc.)

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
