import React, { useEffect, useState, useRef } from "react";
import Papa from "papaparse";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "pt", label: "Portuguese" },
  { code: "es", label: "Spanish" },
  { code: "la", label: "Latin" },
  { code: "it", label: "Italian" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "el", label: "Greek" },
];

function matchVoiceToLang(v, code) {
  if (!v) return false;
  const lang = (v.lang || "").toLowerCase();
  const name = (v.name || "").toLowerCase();

  // direct language prefix or exact contains
  if (lang.startsWith(code)) return true;
  if (lang.includes(code)) return true;

  // special handling: treat some languages with sparse support (Latin) as
  // falling back to Italian voices when appropriate (many TTS bundles map
  // 'la' samples onto italian-sounding voices).
  if (code === 'la') {
    if (lang.startsWith('la')) return true;
    if (lang.startsWith('it')) return true; // accept Italian as a reasonable fallback
    if (name.includes('latin') || name.includes('italian')) return true;
  }

  const labels = {
    pt: ["portuguese", "português"],
    en: ["english"],
    es: ["spanish", "español"],
    la: ["latin"],
    it: ["italian"],
    fr: ["french", "français"],
    de: ["german", "deutsch"],
    pl: ["polish", "polski"],
    ru: ["russian", "русский"],
    el: ["greek", "ελληνικά", "hellenic"],
  };
  const want = labels[code] || [];
  for (const w of want) if (name.includes(w) || lang.includes(w)) return true;
  return false;
}

export default function App() {
  const [mode, setMode] = useState("manual");
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [voices, setVoices] = useState([]);
  const [voicePart1, setVoicePart1] = useState(0);
  const [voicePart2, setVoicePart2] = useState(0);
  const [part1Language, setPart1Language] = useState("la");
  const [part2Language, setPart2Language] = useState("en");
  const [theme, setTheme] = useState("light");
  const [loading, setLoading] = useState(false);
  const [secondPauseMs, setSecondPauseMs] = useState(220);
  const [secondRate, setSecondRate] = useState(1.0);
  const [firstPauseMs, setFirstPauseMs] = useState(220);
  const [firstRate, setFirstRate] = useState(1.0);
  const inputRef = useRef();

  useEffect(() => {
    function loadVoices() {
      let v = [];
      if (typeof window !== "undefined" && window.speechSynthesis) {
        v = window.speechSynthesis.getVoices() || [];
      }
      // dedupe by name+lang
      const seen = new Set();
      const dedup = [];
      for (const x of v) {
        const key = (x.name || "") + "|" + (x.lang || "");
        if (!seen.has(key)) {
          seen.add(key);
          dedup.push(x);
        }
      }
      setVoices(dedup);
    }
    loadVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // when voices load or when the chosen language changes, prefer a recommended
  // voice for each segment so the UI doesn't default to an unrelated voice
  useEffect(() => {
    if (!voices || voices.length === 0) return;
    // ensure first segment selection matches language, or pick a recommended one
    try {
      const curr1 = voices[voicePart1];
      if (!curr1 || !matchVoiceToLang(curr1, part1Language)) {
        const filt = voices.map((v, i) => i).filter((i) => matchVoiceToLang(voices[i], part1Language));
        setVoicePart1(filt.length > 0 ? filt[0] : 0);
      }
      const curr2 = voices[voicePart2];
      if (!curr2 || !matchVoiceToLang(curr2, part2Language)) {
        const filt2 = voices.map((v, i) => i).filter((i) => matchVoiceToLang(voices[i], part2Language));
        setVoicePart2(filt2.length > 0 ? filt2[0] : 0);
      }
    } catch (e) {
      // defensive: some voice objects may be undefined during rapid updates
    }
  }, [voices, part1Language, part2Language, voicePart1, voicePart2]);

  // persist and apply theme (adds class to the <html> element so CSS selectors
  // like `.theme-dark .card` and `.theme-dark body` work). Also remember
  // preference in localStorage so theme survives reloads.
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('laf_theme') : null;
      if (saved) setTheme(saved);
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      if (typeof document !== 'undefined') {
        const el = document.documentElement; // <html>
        if (theme === 'dark') el.classList.add('theme-dark');
        else el.classList.remove('theme-dark');
      }
      if (typeof window !== 'undefined') window.localStorage.setItem('laf_theme', theme);
    } catch (e) {}
  }, [theme]);

  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    Papa.parse(f, {
      complete: (res) => {
        const data = res.data || [];
        // treat first row as header and ignore it for content rows
        const header = Array.isArray(data[0]) ? data[0] : [];
        const body = data.slice(1);
        const parsed = body
          .filter((r) => Array.isArray(r) && r.length > 0)
          .map((r) => ({ part1: r[0] ?? "", part2: r[1] ?? "" }));
        setRows(parsed);
        setCols(header && header.length ? header.map((_, i) => `col${i + 1}`) : []);
      },
    });
  }

  const filteredIndicesPart1 = voices.map((v, i) => i).filter((i) => matchVoiceToLang(voices[i], part1Language));
  const filteredIndicesPart2 = voices.map((v, i) => i).filter((i) => matchVoiceToLang(voices[i], part2Language));

  // speak returns a Promise that resolves when the utterance ends
  function speak(text, voiceIndex, langCode = null, opts = {}) {
    if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
    // decide conjunction to insert when encountering commas or slashes
    let code = langCode;
    const v = voices[voiceIndex];
    if (!code) {
      code = (v && v.lang) ? v.lang.split('-')[0] : 'en';
    }
    const conj = String(code || '').toLowerCase().startsWith('en') ? 'and' : 'e';

    // original text
    const raw = String(text || "");

    // heuristics for language tags and speaking parameters
    const langMap = {
      la: 'it-IT',
      el: 'el-GR',
      en: 'en-US',
      fr: 'fr-FR',
      de: 'de-DE',
      es: 'es-ES',
      it: 'it-IT',
      pt: 'pt-PT',
      ru: 'ru-RU',
      pl: 'pl-PL'
    };
    const rateMap = { la: 0.88, el: 0.78, en: 1.0, fr: 0.95, de: 0.95 };
    const pitchMap = { la: 1.0, el: 1.0, en: 1.0 };

    const primary = (code || 'en').toLowerCase();

    // If segmented mode is requested (or Greek by default), speak each
    // sub-segment separately. This helps languages like Greek where forms
    // run together; we preserve accents and do not inject conjunctions
    // when segmented.
    const segmented = opts.segmented === true || primary === 'el';
    if (segmented) {
      const parts = raw.split(/[\/,;—\-]+/).map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return Promise.resolve();
      return new Promise((resolve) => {
        let idx = 0;
        const speakPart = () => {
          if (idx >= parts.length) return setTimeout(resolve, 50);
          const seg = parts[idx++];
          const u = new SpeechSynthesisUtterance(seg);
          if (v) {
            u.voice = v;
            if (!u.lang && v.lang) u.lang = v.lang;
          } else {
            const want = primary;
            const candidates = voices.filter((vo) => matchVoiceToLang(vo, want));
            const preferred = candidates.find((c) => /(google|neural|enhanced|msft|microsoft)/i.test(c.name || '')) || candidates[0];
            if (preferred) u.voice = preferred;
            u.lang = langMap[want] || (preferred && preferred.lang) || (primary + '-US');
          }
          // segmented uses a slightly reduced rate for clarity
          const segRateMap = { el: 0.78, la: 0.88 };
          u.rate = (opts.rate !== undefined) ? opts.rate : (segRateMap[primary] || (rateMap[primary] || 1.0));
          u.pitch = (opts.pitch !== undefined) ? opts.pitch : (pitchMap[primary] || 1.0);
          u.volume = 1;
          u.onend = () => setTimeout(speakPart, opts.pauseMs || 220);
          window.speechSynthesis.speak(u);
        };
        speakPart();
      });
    }

    // For non-segmented mode: replace '/' and ',' with the chosen conjunction and normalize whitespace
    const normalized = raw.replace(/[\/,]/g, ` ${conj} `).replace(/\s+/g, ' ').trim();
    if (!normalized) return Promise.resolve();

    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(normalized);
      // prefer explicit voice if provided, otherwise try to pick a good match
      if (v) {
        u.voice = v;
        if (!u.lang && v.lang) u.lang = v.lang;
      } else {
        // pick a voice that matches the code and looks high-quality
        const want = (code || 'en').toLowerCase();
        const candidates = voices.filter((vo) => matchVoiceToLang(vo, want));
        const preferred = candidates.find((c) => /(google|neural|enhanced|msft|microsoft)/i.test(c.name || '')) || candidates[0];
        if (preferred) u.voice = preferred;
        const mapped = langMap[want] || (preferred && preferred.lang) || 'en-US';
        u.lang = mapped;
      }

      u.rate = (opts.rate !== undefined) ? opts.rate : (rateMap[primary] || 1.0);
      u.pitch = (opts.pitch !== undefined) ? opts.pitch : (pitchMap[primary] || 1.0);
      u.volume = 1;
      u.onend = () => setTimeout(resolve, 50);
      window.speechSynthesis.speak(u);
    });
  }

  function playSample() {
    speak("Sample front. Sample back.", voicePart1, part1Language);
  }

  async function playRow(r) {
    // speak first part fully, then small pause, then second part
    try {
      await speak(r.part1 || "", voicePart1, part1Language, { rate: firstRate });
      await new Promise((s) => setTimeout(s, firstPauseMs));
      // speak the second segment using segmented mode to preserve accents
      // and get natural pauses between forms; use UI-controlled pause/rate
      await speak(r.part2 || "", voicePart2, part2Language, { segmented: true, pauseMs: secondPauseMs, rate: secondRate });
    } catch (e) {
      // ignore errors from speech interruption
    }
  }

  function playAll() {
    let idx = 0;
    const run = () => {
      if (idx >= rows.length) return;
      const r = rows[idx++];
      playRow(r);
      setTimeout(run, 1200);
    };
    run();
  }

  function stop() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      stopVoiceRunRef.current = true;
      window.speechSynthesis.cancel();
    }
  }

  function addRow() {
    setRows((s) => [...s, { part1: "", part2: "" }]);
  }
  function updateRow(i, k, v) {
    setRows((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }
  function deleteRow(i) {
    setRows((s) => s.filter((_, j) => j !== i));
  }

  function downloadCSV() {
    const csv = rows.map(r => `${(r.part1||"").replace(/\n/g,' ')}","${(r.part2||"").replace(/\n/g,' ')}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Voice test controls (from static/voice_test.html)
  const [voiceTestLang, setVoiceTestLang] = useState('la');
  const [voiceTestIndex, setVoiceTestIndex] = useState(-1);
  const stopVoiceRunRef = useRef(false);

  const filteredIndicesForTest = voices.map((v, i) => i).filter((i) => {
    if (voiceTestLang === 'all') return true;
    return matchVoiceToLang(voices[i], voiceTestLang);
  });

  useEffect(() => {
    // default selection when language or voices change
    if (filteredIndicesForTest.length > 0) setVoiceTestIndex(filteredIndicesForTest[0]);
    else setVoiceTestIndex(-1);
  }, [voiceTestLang, voices.join ? voices.join() : voices, JSON.stringify(filteredIndicesForTest)]);

  async function playSampleForVoice(code, voiceIdx) {
    const sampleMap = {
      la: 'Salve discipule. Quomodo vales? Ego laetus sum te docere.',
      el: 'Χαῖρε μαθητὴ. Πῶς ἔχεις; Εὐδαίμων εἰμί ὅτι μανθάνεις.',
      it: 'Ciao, come stai?',
      en: 'Hello, how are you?',
      fr: 'Bonjour, comment ça va?',
      de: 'Guten Tag, wie geht\'s?',
      es: 'Hola, ¿cómo estás?'
    };
    let codeToUse = code;
    const v = voices[voiceIdx];
    if (code === 'all') {
      codeToUse = v && v.lang ? v.lang.split('-')[0] : 'en';
    }

    // heuristics for voice quality and speaking parameters
    const isNeural = v && /(google|neural|enhanced|msft|microsoft)/i.test(v.name || '');
    const baseRates = { en: 1.0, la: 0.95, el: 0.9, it: 0.98, fr: 0.96, de: 0.96, es: 0.98 };
    const basePitches = { en: 1.0, la: 1.0, el: 1.0 };
    const langKey = (codeToUse || 'en').toLowerCase();
    const suggestedRate = isNeural ? (baseRates[langKey] || 1.0) : ((baseRates[langKey] || 0.95) * 0.95);
    const suggestedPitch = basePitches[langKey] || 1.0;

    const text = sampleMap[codeToUse] || sampleMap.la;
    // split into clauses for more natural pacing
    const clauses = String(text).split(/[\.\?\!]+\s*/).map(s => s.trim()).filter(Boolean);
    stopVoiceRunRef.current = false;
    for (const clause of clauses) {
      if (stopVoiceRunRef.current) break;
      const opts = { rate: suggestedRate, pitch: suggestedPitch, segmented: (langKey === 'el' || langKey === 'la'), pauseMs: 260 };
      try {
        await speak(clause, voiceIdx, codeToUse, opts);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 180));
    }
  }

  async function playAllVoicesForLang(code) {
    const v = voices || [];
    const indices = v.map((vo, i) => matchVoiceToLang(vo, code) ? i : -1).filter(i => i >= 0);
    if (indices.length === 0) { alert('No voices matched that language — try a different browser or OS.'); return; }
    stopVoiceRunRef.current = false;
    for (const idx of indices) {
      if (stopVoiceRunRef.current) break;
      // reuse playSampleForVoice to get clause-splitting and heuristics
      await playSampleForVoice(code, idx);
      await new Promise(s => setTimeout(s, 300));
    }
  }

  // ---- MP3 export helpers ----
  const synthUrl = "http://localhost:5000/synthesize_text";

  async function synthesizeAndDownload(text, filename, voiceIdx = null, lang = null) {
    if (!synthUrl) { alert('No backend URL configured for synthesis.'); return; }
    try {
      const payload = { text: String(text || ''), voiceIndex: voiceIdx, lang };
      const res = await fetch(synthUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Synthesis failed: ' + res.statusText);
      const ab = await res.arrayBuffer();
      const blob = new Blob([ab], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Error exporting MP3: ' + (e.message || e));
    }
  }

  async function exportRowMP3(i) {
    const r = rows[i];
    if (!r) { alert('Row not found'); return; }
    // create filenames safe for download
    const safe = (s) => String(s || '').replace(/[^a-z0-9\-_\.]/gi, '_').slice(0,120);
    const base = `row_${i + 1}_${safe(r.part1 || r.part2 || '')}`;
    stopVoiceRunRef.current = false;
    await synthesizeAndDownload(r.part1 || '', `${base}_front.mp3`, voicePart1, part1Language);
    if (stopVoiceRunRef.current) return;
    await synthesizeAndDownload(r.part2 || '', `${base}_back.mp3`, voicePart2, part2Language);
  }

  async function exportAllMP3() {
    if (!rows || rows.length === 0) { alert('No rows to export'); return; }
    if (!confirm(`Export ${rows.length} rows as MP3 files? This will trigger ${rows.length * 2} downloads.`)) return;
    stopVoiceRunRef.current = false;
    for (let i = 0; i < rows.length; i++) {
      if (stopVoiceRunRef.current) break;
      // small delay between requests to avoid overloading a local backend
      await exportRowMP3(i);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return (
    <div className="container">
      <div className="header">
          <div>
          <h1 className="app-title">Imitatio</h1>
          <p className="tagline">Create spoken flashcards from CSV — upload your list, choose voices, preview rows, and export audio.</p>
        </div>
        <div className="toolbar">
          <div className="theme-toggle" role="tablist" aria-label="Theme">
            <button aria-pressed={theme === 'light'} className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
            <button aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>
      </div>

      

      <div className="controls-grid" style={{ marginTop: 16 }}>
        <div>
          <div className="card">
            <h3>Input</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <label><input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} /> Manual</label>
              <label><input type="radio" checked={mode === 'upload'} onChange={() => setMode('upload')} /> Upload CSV</label>
            </div>
            {mode === 'upload' ? (
              <div style={{ marginTop: 10 }}>
                <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} style={{ width: '100%' }} />
                <div className="small" style={{ marginTop: 8 }}>Detected columns: {cols.join(', ') || '—'}</div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>#</th><th>First part</th><th>Second part</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><input value={r.part1} onChange={e => updateRow(i, 'part1', e.target.value)} style={{ width: '100%' }} /></td>
                        <td><input value={r.part2} onChange={e => updateRow(i, 'part2', e.target.value)} style={{ width: '100%' }} /></td>
                        <td><button className="btn" onClick={() => deleteRow(i)}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={addRow}>Add row</button>
                  <button className="btn btn-ghost" onClick={downloadCSV}>Download CSV</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }} className="card">
            <h3>Voice Test</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div className="small">Language</div>
                <select value={voiceTestLang} onChange={e => setVoiceTestLang(e.target.value)}>
                  <option value="all">All languages</option>
                  {LANGUAGE_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label} ({o.code})</option>)}
                </select>
              </div>

              <div>
                <div className="small">Voice</div>
                <select value={voiceTestIndex} onChange={e => setVoiceTestIndex(Number(e.target.value))} style={{ minWidth: 240 }}>
                  {filteredIndicesForTest.length > 0 ? filteredIndicesForTest.map(i => <option key={i} value={i}>{voices[i].name} — {voices[i].lang}</option>) : <option value={-1}>No matching voices</option>}
                </select>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { if (isNaN(voiceTestIndex) || voiceTestIndex < 0) { alert('No voice selected for that language.'); return; } stopVoiceRunRef.current = false; playSampleForVoice(voiceTestLang, voiceTestIndex).catch(()=>{}); }}>Play Sample</button>
                <button className="btn" onClick={() => { stopVoiceRunRef.current = false; playAllVoicesForLang(voiceTestLang).catch(()=>{}); }}>Play All</button>
                <button className="btn" onClick={() => { stopVoiceRunRef.current = true; if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); }} style={{ background: '#ef4444', color: '#fff' }}>Stop</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="small">Notes: voice availability depends on OS/browser. Use Chrome/Edge for best voice selection.</div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Preview (first 200 rows)</h3>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>#</th><th>First</th><th>Second</th><th>Play</th></tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r.part1}</td>
                      <td>{r.part2}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => playRow(r)}>Play</button>
                        <button className="btn btn-ghost" onClick={() => exportRowMP3(i)}>Export MP3</button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="small">No rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 16 }} className="card">
            <h3>Export MP3</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div className="small">Export options</div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => { if (rows.length === 0) { alert('No rows to export'); return; } exportAllMP3().catch(()=>{}); }}>Export All (each row → front/back)</button>
                  <div className="small" style={{ marginTop: 8 }}>This will request MP3s from the configured backend and trigger downloads for each row.</div>
                </div>
              </div>
              <div style={{ minWidth: 220 }}>
                <div className="small">Single row export</div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select defaultValue={0} onChange={() => {}} style={{ flex: 1 }}>
                      <option value={-1}>Use Preview Export buttons</option>
                    </select>
                    <button className="btn" onClick={() => alert('Use the Export MP3 button in the Preview table for individual rows.')}>Help</button>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }} className="small">Backend URL: http://localhost:5000/synthesize (read-only)</div>
          </div>

        </div>

        <div>
          <div className="card">
            <h3>Audio segments</h3>

            <div style={{ border: '1px solid rgba(15,23,42,0.06)', padding: 10, borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>First Audio Segment</strong>
                  <div className="small">Language & voice for the first (front) segment</div>
                </div>
                <div className="small">{voices[voicePart1] ? voices[voicePart1].name + ' (' + voices[voicePart1].lang + ')' : 'No voice selected'}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <div className="small">Language</div>
                <select value={part1Language} onChange={e => setPart1Language(e.target.value)} style={{ width: '100%', marginTop: 6, padding: 8 }}>
                  {LANGUAGE_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <div className="small">Voice</div>
                  <div>
                    <button className="btn btn-ghost" onClick={() => { const idx = voices.findIndex(v => matchVoiceToLang(v, part1Language)); if (idx >= 0) setVoicePart1(idx); }}>Use recommended</button>
                  </div>
                </div>
                <select value={voicePart1} onChange={e => setVoicePart1(Number(e.target.value))} style={{ width: '100%', marginTop: 6, padding: 8 }}>
                  {filteredIndicesPart1.length > 0 ? filteredIndicesPart1.map(i => <option key={i} value={i}>{voices[i].name} — {voices[i].lang}</option>) : voices.map((v, i) => <option key={i} value={i}>{v.name} — {v.lang}</option>)}
                </select>
                {filteredIndicesPart1.length === 0 && <div className="small" style={{ marginTop: 6, color: '#b91c1c' }}>No voices matched this language — showing all voices.</div>}
              </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div>
                    <div className="small">First segment pause (ms)</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn" onClick={() => setFirstPauseMs(p => Math.max(0, p - 10))}>-10</button>
                      <input type="number" value={firstPauseMs} onChange={e => setFirstPauseMs(Number(e.target.value || 0))} style={{ width: '100%', marginTop: 6, padding: 8 }} />
                      <button className="btn" onClick={() => setFirstPauseMs(p => p + 10)}>+10</button>
                    </div>
                  </div>
                  <div>
                    <div className="small">First segment rate</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="range" min={0.6} max={1.4} step={0.01} value={firstRate} onChange={e => setFirstRate(Number(e.target.value))} style={{ flex: 1 }} />
                      <div style={{ width: 56, textAlign: 'right' }}>{firstRate.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              

            <div style={{ border: '1px solid rgba(15,23,42,0.06)', padding: 10, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Second Audio Segment</strong>
                  <div className="small">Language & voice for the second (back) segment</div>
                </div>
                <div className="small">{voices[voicePart2] ? voices[voicePart2].name + ' (' + voices[voicePart2].lang + ')' : 'No voice selected'}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <div className="small">Language</div>
                <select value={part2Language} onChange={e => setPart2Language(e.target.value)} style={{ width: '100%', marginTop: 6, padding: 8 }}>
                  {LANGUAGE_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <div className="small">Voice</div>
                  <div>
                    <button className="btn btn-ghost" onClick={() => { const idx = voices.findIndex(v => matchVoiceToLang(v, part2Language)); if (idx >= 0) setVoicePart2(idx); }}>Use recommended</button>
                  </div>
                </div>
                <select value={voicePart2} onChange={e => setVoicePart2(Number(e.target.value))} style={{ width: '100%', marginTop: 6, padding: 8 }}>
                  {filteredIndicesPart2.length > 0 ? filteredIndicesPart2.map(i => <option key={i} value={i}>{voices[i].name} — {voices[i].lang}</option>) : voices.map((v, i) => <option key={i} value={i}>{v.name} — {v.lang}</option>)}
                </select>
                {filteredIndicesPart2.length === 0 && <div className="small" style={{ marginTop: 6, color: '#b91c1c' }}>No voices matched this language — showing all voices.</div>}
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div>
                    <div className="small">Second segment pause (ms)</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn" onClick={() => setSecondPauseMs(p => Math.max(0, p - 10))}>-10</button>
                      <input type="number" value={secondPauseMs} onChange={e => setSecondPauseMs(Number(e.target.value || 0))} style={{ width: '100%', marginTop: 6, padding: 8 }} />
                      <button className="btn" onClick={() => setSecondPauseMs(p => p + 10)}>+10</button>
                    </div>
                  </div>
                  <div>
                    <div className="small">Second segment rate</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="range" min={0.6} max={1.4} step={0.01} value={secondRate} onChange={e => setSecondRate(Number(e.target.value))} style={{ flex: 1 }} />
                      <div style={{ width: 56, textAlign: 'right' }}>{secondRate.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="small">Backend URL (for MP3 export)</div>
              <input value={"http://localhost:5000/synthesize"} readOnly style={{ width: '100%', marginTop: 6, padding: 8 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Lower duplicate preview removed for a cleaner UI */}

      <div className="footer">Notes: Browser voices vary by OS. For MP3 export, run the Flask backend in the backend/ folder and set its URL here.</div>
    </div>
  );
}
