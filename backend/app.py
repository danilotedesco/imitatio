from flask import Flask, request, send_file, jsonify
import tempfile, os, pandas as pd
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except Exception:
    edge_tts = None
    EDGE_TTS_AVAILABLE = False

from voices import pick_voice

# Configure pydub with ffmpeg from imageio-ffmpeg package
# This is needed for deployment on platforms like Render where
# system ffmpeg is not available
AudioSegment = None
PYDUB_AVAILABLE = False
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except Exception as e:
    logging.warning(f'pydub not available: {e}')
    AudioSegment = None
    PYDUB_AVAILABLE = False

if PYDUB_AVAILABLE:
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        AudioSegment.converter = ffmpeg_path
        AudioSegment.ffmpeg = ffmpeg_path
        AudioSegment.ffprobe = ffmpeg_path.replace('ffmpeg', 'ffprobe') if 'ffmpeg' in ffmpeg_path else None
        logging.info(f'pydub configured successfully with ffmpeg: {ffmpeg_path}')
    except Exception as e:
        # Keep pydub available; it may still work if ffmpeg is on PATH
        logging.warning(f'ffmpeg not configured via imageio-ffmpeg: {e}')
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



def synthesize_edge_save(text, lang, path, gender='female'):
    """Synthesize text to MP3 using Edge TTS and the centralized voice map."""
    try:
        voice_name = pick_voice(lang or 'en', gender or 'female')
        return try_edge_save(text, voice_name, path)
    except Exception:
        logging.exception('synthesize_edge_save failed')
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        return False


def gtts_save(text, lang, path, gender=None):
    """Legacy wrapper kept for compatibility: routes call `gtts_save`.
    Internally uses Edge TTS and centralized voice map. Accepts optional
    `gender` ("female"|"male") and defaults to environment setting.
    """
    use_gender = gender or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
    synthesize_edge_save(text, lang, path, gender=use_gender)

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

            # synthesize front using Edge TTS only (centralized voice map)
            front_audio = None
            gender_front = request.form.get('voice_gender_front') or request.form.get('voice_gender') or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
            try:
                gtts_save(front_text, 'en' if (lang_front and str(lang_front).lower().startswith('en')) else lang_front, tmp_front, gender=gender_front)
                front_audio = AudioSegment.from_file(tmp_front)
            except Exception:
                logging.exception('Front synthesis failed')
                front_audio = AudioSegment.silent(duration=700)

            # synthesize back using Edge TTS only (centralized voice map)
            back_audio = None
            gender_back = request.form.get('voice_gender_back') or request.form.get('voice_gender') or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
            try:
                gtts_save(back_text, lang_back, tmp_back, gender=gender_back)
                back_audio = AudioSegment.from_file(tmp_back)
            except Exception:
                logging.exception('Back synthesis failed')
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
                    gender_front = request.form.get('voice_gender_front') or request.form.get('voice_gender') or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
                    gtts_save(front_text, 'en' if (lang_front and str(lang_front).lower().startswith('en')) else lang_front, tmp_front, gender=gender_front)
                    made_en = True
                except Exception:
                    try:
                        open(tmp_front,'wb').close()
                    except Exception:
                        pass
                # For zip path (no pydub), follow same Latin flow when lang_back indicates Latin
                try:
                    gender_back = request.form.get('voice_gender_back') or request.form.get('voice_gender') or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
                    gtts_save(back_text, lang_back, tmp_back, gender=gender_back)
                    made_la = True
                except Exception:
                    try:
                        # fallback: try language short code
                        gtts_save(back_text, (str(lang_back).split('-')[0] if lang_back else 'en'), tmp_back, gender=gender_back)
                        made_la = True
                    except Exception:
                        try:
                            gtts_save(back_text, 'en', tmp_back, gender=gender_back)
                            made_la = True
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
    gender = (data.get('gender') if isinstance(data, dict) else None) or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
    if not text:
        return jsonify({'error': 'no text provided'}), 400
    out_path = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
    try:
        # use Edge-only pipeline
        gtts_save(text, lang, out_path, gender=gender)
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
                gender_seg = segment.get('gender') or os.environ.get('DEFAULT_VOICE_GENDER', 'female')
                gtts_save(text, lang, tmp_path, gender=gender_seg)
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
