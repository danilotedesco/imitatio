"""
List Google Cloud Text-to-Speech voices (requires google credentials).
Usage:
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
  python tools/list_google_voices.py
"""
from google.cloud import texttospeech

def main():
    client = texttospeech.TextToSpeechClient()
    resp = client.list_voices()
    voices = resp.voices
    print(f"Found {len(voices)} voices")
    for v in voices:
        langs = ','.join(v.language_codes)
        print(f"{v.name}\tlanguages={langs}\tgender={texttospeech.SsmlVoiceGender(v.ssml_gender).name}")

if __name__ == '__main__':
    main()
