VOICE_MAP = {
    "en": {"female": "en-US-JennyNeural", "male": "en-US-GuyNeural"},
    "fr": {"female": "fr-FR-DeniseNeural", "male": "fr-FR-HenriNeural"},
    "es": {"female": "es-ES-ElviraNeural", "male": "es-ES-AlvaroNeural"},
    "it": {"female": "it-IT-ElsaNeural", "male": "it-IT-DiegoNeural"},
    "de": {"female": "de-DE-KatjaNeural", "male": "de-DE-ConradNeural"},
    "el": {"female": "el-GR-AthinaNeural", "male": "el-GR-NestorasNeural"},
    "pt": {"female": "pt-BR-FranciscaNeural", "male": "pt-BR-AntonioNeural"},
    "la": {"female": "it-IT-ElsaNeural", "male": "it-IT-DiegoNeural"}
}

DEFAULT_EDGE_VOICE = "en-US-JennyNeural"

def pick_voice(lang_code, gender="female"):
    if not lang_code or not isinstance(lang_code, str):
        return DEFAULT_EDGE_VOICE
    code = lang_code.split('-')[0].lower()
    entry = VOICE_MAP.get(code)
    if not entry:
        return DEFAULT_EDGE_VOICE
    return entry.get(gender, entry.get('female', DEFAULT_EDGE_VOICE))
