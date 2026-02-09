from flask import Flask, request, send_file, jsonify
import tempfile, os, pandas as pd
from gtts import gTTS
import subprocess
import logging
try:
    from google.cloud import texttospeech
    GOOGLE_TTS_AVAILABLE = True
except Exception:
    texttospeech = None
    GOOGLE_TTS_AVAILABLE = False
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    POLLY_AVAILABLE = True
except Exception:
    boto3 = None
    POLLY_AVAILABLE = False
try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except Exception:
    edge_tts = None
    EDGE_TTS_AVAILABLE = False
PREFERRED_ENG_ENGINE = os.environ.get('PREFERRED_ENG_ENGINE', 'edge')
EDGE_ENG_VOICE = os.environ.get('EDGE_ENG_VOICE', 'en-US-AriaNeural')
GOOGLE_ENG_VOICE = os.environ.get('GOOGLE_ENG_VOICE', '')
POLLY_ENG_VOICE = os.environ.get('POLLY_ENG_VOICE', 'Joanna')
EDGE_LATIN_FALLBACK_VOICE = os.environ.get('EDGE_LATIN_FALLBACK_VOICE', 'it-IT-ElsaNeural')
GOOGLE_LATIN_VOICE = os.environ.get('GOOGLE_LATIN_VOICE', 'it-IT-Wavenet-A')
POLLY_LATIN_VOICE = os.environ.get('POLLY_LATIN_VOICE', 'Carla')
# Accept comma-separated lists of preferred voices (will be tried in order)
GOOGLE_LATIN_VOICE_LIST = os.environ.get('GOOGLE_LATIN_VOICE_LIST', GOOGLE_LATIN_VOICE)
POLLY_LATIN_VOICE_LIST = os.environ.get('POLLY_LATIN_VOICE_LIST', POLLY_LATIN_VOICE)
EDGE_LATIN_FALLBACK_VOICE_LIST = os.environ.get('EDGE_LATIN_FALLBACK_VOICE_LIST', EDGE_LATIN_FALLBACK_VOICE)
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except Exception:
    AudioSegment = None
    PYDUB_AVAILABLE = False

# Configure pydub to use ffmpeg from imageio-ffmpeg package
# This is needed for deployment on platforms like Render where
# system ffmpeg is not available
if PYDUB_AVAILABLE:
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        AudioSegment.converter = ffmpeg_path
        AudioSegment.ffmpeg = ffmpeg_path
        AudioSegment.ffprobe = ffmpeg_path
    except Exception:
        pass  # fall back to system ffmpeg if imageio-ffmpeg not available
import zipfile

app = Flask(__name__)
DEFAULT_PAUSE_EN_TO_LA = 350
DEFAULT_PAUSE_BETWEEN = 700


# Simple CORS support without external dependency
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    return response

def try_google_save(text, lang, path):
    if not GOOGLE_TTS_AVAILABLE:
        return False
    try:
        client = texttospeech.TextToSpeechClient()
        # best-effort language_code: prefer explicit region if given
        language_code = lang if '-' in (lang or '') else (lang or 'en')
        voice = texttospeech.VoiceSelectionParams(language_code=language_code, ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL)
        synthesis_input = texttospeech.SynthesisInput(text=text)
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        resp = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        with open(path, 'wb') as f:
            f.write(resp.audio_content)
        return True
    except Exception:
        logging.exception('google tts failed')
        return False


def try_google_save_with_voice(text, lang, path, voice_name=None):
    if not GOOGLE_TTS_AVAILABLE:
        return False
    try:
        client = texttospeech.TextToSpeechClient()
        # best-effort language_code: prefer explicit region if given
        language_code = lang if '-' in (lang or '') else (lang or 'en')
        if voice_name:
            voice = texttospeech.VoiceSelectionParams(name=voice_name)
        else:
            voice = texttospeech.VoiceSelectionParams(language_code=language_code, ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL)
        synthesis_input = texttospeech.SynthesisInput(text=text)
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        resp = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        with open(path, 'wb') as f:
            f.write(resp.audio_content)
        return True
    except Exception:
        logging.exception('google tts failed')
        return False


def try_espeak_save(text, lang, path):
    # espeak-ng produces WAV; convert to mp3 if possible
    try:
        wav_tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
        cmd = ['espeak-ng', '-v', lang or 'en', '-w', wav_tmp, text]
        subprocess.run(cmd, check=True)
        # if desired output is mp3, convert
        if path.lower().endswith('.mp3'):
            if PYDUB_AVAILABLE:
                AudioSegment.from_wav(wav_tmp).export(path, format='mp3')
                os.remove(wav_tmp)
                return True
            else:
                # try ffmpeg conversion
                try:
                    subprocess.run(['ffmpeg', '-y', '-i', wav_tmp, path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    os.remove(wav_tmp)
                    return True
                except Exception:
                    # leave wav as fallback if caller expects wav
                    pass
        else:
            # caller asked for wav or other extension; move
            os.replace(wav_tmp, path)
            return True
    except Exception:
        logging.exception('espeak-ng failed')
    try:
        if os.path.exists(wav_tmp):
            os.remove(wav_tmp)
    except Exception:
        pass
    return False


def try_edge_save(text, voice, path):
    if not EDGE_TTS_AVAILABLE:
        return False
    try:
        import asyncio

        async def _save():
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(path)

        asyncio.run(_save())
        return True
    except Exception:
        logging.exception('edge-tts failed')
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        return False


def try_polly_save(text, voice, path):
    if not POLLY_AVAILABLE:
        return False
    try:
        polly = boto3.client('polly')
        resp = polly.synthesize_speech(Text=text, VoiceId=voice, OutputFormat='mp3')
        with open(path, 'wb') as f:
            f.write(resp['AudioStream'].read())
        return True
    except (BotoCoreError, ClientError):
        logging.exception('polly tts failed')
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        return False


def try_google_save_with_voice_list(text, lang, path, voice_list_csv):
    if not voice_list_csv:
        return False
    voices = [v.strip() for v in voice_list_csv.split(',') if v.strip()]
    for v in voices:
        if try_google_save_with_voice(text, lang, path, v):
            return True
    return False


def try_polly_save_list(text, voice_list_csv, path):
    if not voice_list_csv:
        return False
    voices = [v.strip() for v in voice_list_csv.split(',') if v.strip()]
    for v in voices:
        if try_polly_save(text, v, path):
            return True
    return False


def try_edge_save_list(text, voice_list_csv, path):
    if not voice_list_csv:
        return False
    voices = [v.strip() for v in voice_list_csv.split(',') if v.strip()]
    for v in voices:
        if try_edge_save(text, v, path):
            return True
    return False


def gtts_save(text, lang, path):
    # Try Google Cloud TTS if available and enabled
    use_google = os.environ.get('ENABLE_GOOGLE_TTS', '') == '1' or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if use_google and try_google_save(text, lang, path):
        return
    # Fallback to gTTS
    try:
        t = gTTS(text=text, lang=lang)
        t.save(path)
        return
    except Exception:
        logging.exception('gTTS failed')
    # Last-resort: try espeak-ng (local, fast) for Latin/Greek
    try_espeak_save(text, lang, path)

@app.route('/synthesize', methods=['POST'])
def synthesize():
    # Accepts form-data: file (csv) and optional numeric fields:
    # pause_en_la_ms, pause_between_ms, repeat_latin, latin_repeat_pause_ms
    f = request.files.get('file')
    if not f:
        return jsonify({"error":"no file uploaded"}), 400
    # accept both legacy and new parameter names
    def int_field(*names, default=0):
        for n in names:
            v = request.form.get(n)
            if v is not None:
                try:
                    return int(v)
                except ValueError:
                    return None
        return default

    pause_en_la = int_field('pause_en_la_ms', 'pause_ms_front_to_back', default=DEFAULT_PAUSE_EN_TO_LA)
    pause_between = int_field('pause_between_ms', 'pause_between_rows', default=DEFAULT_PAUSE_BETWEEN)
    repeat_latin = int_field('repeat_latin', 'repeat_times', default=1)
    latin_repeat_pause = int_field('latin_repeat_pause_ms', 'repeat_pause_ms', default=400)

    if None in (pause_en_la, pause_between, repeat_latin, latin_repeat_pause):
        return jsonify({"error":"invalid numeric parameter"}), 400

    df = pd.read_csv(f, dtype=str)
    df.columns = [c.strip() for c in df.columns]
    # detect front/back columns heuristically (support part1/part2 or English/Latin)
    def find_col(possible):
        for c in df.columns:
            if c.strip().lower() in possible:
                return c
        return None

    front_col = find_col(['part1','first','front','english','english_text'])
    back_col = find_col(['part2','second','back','latin','1 pp','principal','principal parts','principal_parts'])
    # fallback to first/second columns
    if front_col is None and len(df.columns) >= 1:
        front_col = df.columns[0]
    if back_col is None and len(df.columns) >= 2:
        back_col = df.columns[1]
    if back_col is None and front_col is not None:
        back_col = front_col

    out_audio = AudioSegment.silent(duration=500)
    temps = []
    # per-segment language hints
    lang_front = request.form.get('language_for_front') or request.form.get('language') or 'en'
    lang_back = request.form.get('language_for_back') or request.form.get('language') or 'la'

    if PYDUB_AVAILABLE:
        for idx, row in df.iterrows():
            front_text = str(row.get(front_col,'') or '')
            back_text = str(row.get(back_col,'') or '')

            tmp_front = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
            tmp_back = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
            temps.extend([tmp_front, tmp_back])

            # synthesize front (prefer configured engine, then fall back)
            front_audio = None
            made_en = False
            try:
                if PREFERRED_ENG_ENGINE == 'edge' and EDGE_TTS_AVAILABLE:
                    made_en = try_edge_save(front_text, EDGE_ENG_VOICE, tmp_front)
                if not made_en and PREFERRED_ENG_ENGINE == 'google' and GOOGLE_TTS_AVAILABLE:
                    made_en = try_google_save_with_voice(front_text, lang_front, tmp_front, GOOGLE_ENG_VOICE or None)
                if not made_en and PREFERRED_ENG_ENGINE == 'polly' and POLLY_AVAILABLE:
                    made_en = try_polly_save(front_text, POLLY_ENG_VOICE, tmp_front)
                if not made_en:
                    # fallback to gTTS
                    try:
                        gtts_save(front_text, 'en' if (lang_front and str(lang_front).lower().startswith('en')) else lang_front, tmp_front)
                        made_en = True
                    except Exception:
                        made_en = False
                if made_en:
                    try:
                        front_audio = AudioSegment.from_file(tmp_front)
                    except Exception:
                        front_audio = AudioSegment.silent(duration=700)
                else:
                    front_audio = AudioSegment.silent(duration=700)
            except Exception:
                logging.exception('Front synthesis failed')
                front_audio = AudioSegment.silent(duration=700)

            # synthesize back with fallback sequence
            back_audio = None
            # If requested language is Latin, prefer Italian/Latin voices.
            # Flow: gTTS('la') -> Google Italian WaveNet (configurable) -> Edge Italian -> Polly Italian -> gTTS('en')
            if lang_back and str(lang_back).lower().startswith('la'):
                made_la = False
                try:
                    if back_text:
                        # 1) try gTTS latin
                        try:
                            gtts_save(back_text, 'la', tmp_back)
                            made_la = True
                        except Exception:
                            made_la = False
                        # 2) try Google Italian voice
                        if not made_la and GOOGLE_TTS_AVAILABLE:
                                made_la = try_google_save_with_voice_list(back_text, 'it-IT', tmp_back, GOOGLE_LATIN_VOICE_LIST)
                        # 3) try Edge italian fallback
                        if not made_la and EDGE_TTS_AVAILABLE:
                                made_la = try_edge_save_list(back_text, EDGE_LATIN_FALLBACK_VOICE_LIST, tmp_back)
                        # 4) try Polly italian voice
                        if not made_la and POLLY_AVAILABLE:
                                made_la = try_polly_save_list(back_text, POLLY_LATIN_VOICE_LIST, tmp_back)
                        # 5) final fallback: english via gTTS
                        if not made_la:
                            try:
                                gtts_save(back_text, 'en', tmp_back)
                                made_la = True
                            except Exception:
                                made_la = False
                except Exception:
                    logging.exception(f"Latin TTS failed for row {idx}: {back_text!r}")
                    made_la = False

                if made_la:
                    try:
                        back_audio = AudioSegment.from_file(tmp_back)
                    except Exception:
                        back_audio = None
                else:
                    back_audio = AudioSegment.silent(duration=700)
            else:
                # non-Latin: existing fallback behavior
                try:
                    gtts_save(back_text, lang_back, tmp_back)
                    back_audio = AudioSegment.from_file(tmp_back)
                except Exception:
                    fallbacks = []
                    if lang_back and lang_back != 'en':
                        fallbacks.append(str(lang_back).split('-')[0])
                    fallbacks.extend(['it','en'])
                    for fb in fallbacks:
                        try:
                            gtts_save(back_text, fb, tmp_back)
                            back_audio = AudioSegment.from_file(tmp_back)
                            break
                        except Exception:
                            back_audio = None
                if back_audio is None:
                    back_audio = AudioSegment.silent(duration=700)

            # append sequences with repeats
            out_audio += front_audio + AudioSegment.silent(duration=pause_en_la)
            for i in range(max(1, repeat_latin)):
                out_audio += back_audio
                if i < max(1, repeat_latin)-1:
                    out_audio += AudioSegment.silent(duration=latin_repeat_pause)
            out_audio += AudioSegment.silent(duration=pause_between)
    else:
        # pydub not available: synthesize individual mp3 files and return a zip
        zip_path = tempfile.NamedTemporaryFile(suffix='.zip', delete=False).name
        with zipfile.ZipFile(zip_path, 'w') as zf:
            idx = 1
            for _, row in df.iterrows():
                front_text = str(row.get(front_col,'') or '')
                back_text = str(row.get(back_col,'') or '')
                fn_front = f'row{idx:03d}_front.mp3'
                fn_back = f'row{idx:03d}_back.mp3'
                tmp_front = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
                tmp_back = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
                made_en = False
                try:
                    if PREFERRED_ENG_ENGINE == 'edge' and EDGE_TTS_AVAILABLE:
                        made_en = try_edge_save(front_text, EDGE_ENG_VOICE, tmp_front)
                    if not made_en and PREFERRED_ENG_ENGINE == 'google' and GOOGLE_TTS_AVAILABLE:
                        made_en = try_google_save_with_voice(front_text, lang_front, tmp_front, GOOGLE_ENG_VOICE or None)
                    if not made_en and PREFERRED_ENG_ENGINE == 'polly' and POLLY_AVAILABLE:
                        made_en = try_polly_save(front_text, POLLY_ENG_VOICE, tmp_front)
                    if not made_en:
                        gtts_save(front_text, 'en' if (lang_front and str(lang_front).lower().startswith('en')) else lang_front, tmp_front)
                        made_en = True
                except Exception:
                    try:
                        open(tmp_front,'wb').close()
                    except Exception:
                        pass
                # For zip path (no pydub), follow same Latin flow when lang_back indicates Latin
                made_la = False
                if lang_back and str(lang_back).lower().startswith('la'):
                    try:
                        if back_text:
                            try:
                                gtts_save(back_text, 'la', tmp_back)
                                made_la = True
                            except Exception:
                                # try edge-tts Italian fallback
                                if EDGE_TTS_AVAILABLE:
                                    made_la = try_edge_save(back_text, EDGE_LATIN_FALLBACK_VOICE, tmp_back)
                                if not made_la:
                                    # final fallback to English
                                    try:
                                        gtts_save(back_text, 'en', tmp_back)
                                        made_la = True
                                    except Exception:
                                        made_la = False
                    except Exception:
                        logging.exception(f"Latin TTS failed for row {idx}: {back_text!r}")
                        made_la = False
                else:
                    try:
                        gtts_save(back_text, lang_back, tmp_back)
                    except Exception:
                        # try simple fallbacks
                        try:
                            gtts_save(back_text, (str(lang_back).split('-')[0] if lang_back else 'it'), tmp_back)
                        except Exception:
                            try:
                                gtts_save(back_text, 'en', tmp_back)
                            except Exception:
                                open(tmp_back,'wb').close()
                zf.write(tmp_front, arcname=fn_front)
                zf.write(tmp_back, arcname=fn_back)
                temps.extend([tmp_front, tmp_back])
                idx += 1
        # cleanup intermediate files will be handled below; send zip
        response = send_file(zip_path, as_attachment=True, download_name='flashaudios_rows.zip')
        for t in temps:
            try: os.remove(t)
            except: pass
        return response

    out_path = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
    out_audio.export(out_path, format='mp3')

    # cleanup intermediate mp3s
    for t in temps:
        try: os.remove(t)
        except: pass

    return send_file(out_path, as_attachment=True, download_name='combined.mp3')


@app.route('/synthesize_text', methods=['POST'])
def synthesize_text():
    """Simple endpoint to synthesize a single text snippet to MP3.
    Accepts JSON: { text: string, lang: 'en'|'la'|... }
    Returns: MP3 file
    """
    try:
        data = request.get_json(force=True)
    except Exception:
        data = {}
    text = data.get('text') if isinstance(data, dict) else None
    lang = (data.get('lang') if isinstance(data, dict) else None) or 'en'
    if not text:
        return jsonify({'error': 'no text provided'}), 400
    out_path = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
    try:
        # use the same gTTS / fallback pipeline used elsewhere
        gtts_save(text, lang, out_path)
        return send_file(out_path, as_attachment=True, download_name='speech.mp3')
    except Exception:
        logging.exception('synthesize_text failed')
        try:
            if os.path.exists(out_path): os.remove(out_path)
        except Exception:
            pass
        return jsonify({'error':'synthesis failed'}), 500


@app.route('/synthesize_combined', methods=['POST'])
def synthesize_combined():
    """Synthesize multiple text segments into a single combined MP3 file.
    Accepts JSON: {
        segments: [{ text: string, lang: string }, ...],
        pause_ms: int (pause between segments within a row, default 500),
        row_pause_ms: int (pause between rows, default 1000)
    }
    Returns: Single combined MP3 file
    """
    if not PYDUB_AVAILABLE:
        return jsonify({'error': 'pydub not available - cannot combine audio'}), 500
    
    try:
        data = request.get_json(force=True)
    except Exception:
        data = {}
    
    if not isinstance(data, dict):
        return jsonify({'error': 'invalid request format'}), 400
    
    segments = data.get('segments', [])
    if not segments or not isinstance(segments, list):
        return jsonify({'error': 'no segments provided'}), 400
    
    pause_ms = data.get('pause_ms', 500)
    row_pause_ms = data.get('row_pause_ms', 1000)
    
    # Start with a small silent intro
    combined_audio = AudioSegment.silent(duration=200)
    temps = []
    
    try:
        for idx, segment in enumerate(segments):
            if not isinstance(segment, dict):
                continue
            
            text = segment.get('text', '')
            lang = segment.get('lang', 'en')
            is_row_boundary = segment.get('is_row_boundary', False)
            
            if not text:
                continue
            
            # Create temporary file for this segment
            tmp_path = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
            temps.append(tmp_path)
            
            # Synthesize this segment
            try:
                gtts_save(text, lang, tmp_path)
                segment_audio = AudioSegment.from_file(tmp_path)
                combined_audio += segment_audio
                
                # Add pause after segment
                # Use row_pause_ms if this is a row boundary, otherwise use pause_ms
                if is_row_boundary and idx < len(segments) - 1:
                    combined_audio += AudioSegment.silent(duration=row_pause_ms)
                elif idx < len(segments) - 1:
                    combined_audio += AudioSegment.silent(duration=pause_ms)
                    
            except Exception:
                logging.exception(f'Failed to synthesize segment {idx}: {text[:50]}')
                # Add silent duration as fallback
                combined_audio += AudioSegment.silent(duration=500)
        
        # Export combined audio
        out_path = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
        combined_audio.export(out_path, format='mp3')
        
        # Clean up temporary files
        for tmp in temps:
            try:
                os.remove(tmp)
            except Exception:
                pass
        
        return send_file(out_path, as_attachment=True, download_name='combined.mp3')
        
    except Exception:
        logging.exception('synthesize_combined failed')
        # Clean up temporary files
        for tmp in temps:
            try:
                os.remove(tmp)
            except Exception:
                pass
        return jsonify({'error': 'synthesis failed'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
