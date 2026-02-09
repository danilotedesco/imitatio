import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

function App() {
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const synthesizeEndpoint = BACKEND_URL + '/synthesize';

    const [csvFile, setCsvFile] = useState(null);
    const [frontLang, setFrontLang] = useState('en');
    const [backLang, setBackLang] = useState('la');
    const [frontVoice, setFrontVoice] = useState(null);
    const [backVoice, setBackVoice] = useState(null);
    const [voices, setVoices] = useState([]);
    const [frontVoices, setFrontVoices] = useState([]);
    const [backVoices, setBackVoices] = useState([]);
    const [log, setLog] = useState('');

    // Load available voices
    useEffect(() => {
        const loadVoices = () => {
            const availableVoices = speechSynthesis.getVoices() || [];
            setVoices(availableVoices);
        };
        
        loadVoices();
        speechSynthesis.onvoiceschanged = loadVoices;
    }, []);

    // Map language codes for voice matching (Latin uses Italian voices)
    const mapLangForMatching = (code) => {
        const map = { la: 'it', el: 'el' };
        return map[code] || code;
    };

    // Filter voices based on selected language
    useEffect(() => {
        const code = mapLangForMatching(frontLang).toLowerCase();
        const filtered = voices.filter(v => 
            v.lang && v.lang.toLowerCase().startsWith(code)
        );
        setFrontVoices(filtered);
        // Set first voice or reset if current voice is not in filtered list
        if (filtered.length > 0) {
            if (!frontVoice || !filtered.includes(frontVoice)) {
                setFrontVoice(filtered[0]);
            }
        } else {
            setFrontVoice(null);
        }
    }, [frontLang, voices]);

    useEffect(() => {
        const code = mapLangForMatching(backLang).toLowerCase();
        const filtered = voices.filter(v => 
            v.lang && v.lang.toLowerCase().startsWith(code)
        );
        setBackVoices(filtered);
        // Set first voice or reset if current voice is not in filtered list
        if (filtered.length > 0) {
            if (!backVoice || !filtered.includes(backVoice)) {
                setBackVoice(filtered[0]);
            }
        } else {
            setBackVoice(null);
        }
    }, [backLang, voices]);

    const speak = (text, voice) => {
        return new Promise(resolve => {
            if (!text) return resolve();
            const utterance = new SpeechSynthesisUtterance(text);
            if (voice) utterance.voice = voice;
            utterance.onend = () => setTimeout(resolve, 80);
            speechSynthesis.speak(utterance);
        });
    };

    const playRows = async (rows) => {
        const max = Math.min(rows.length, 20);
        for (let idx = 0; idx < max; idx++) {
            const row = rows[idx];
            const frontText = row.English || row.english || row.Front || row.front || row[Object.keys(row)[0]] || '';
            const backText = row.Latin || row.latin || row.Back || row.back || row[Object.keys(row)[1]] || '';
            
            if (frontVoice) await speak(frontText, frontVoice);
            await new Promise(s => setTimeout(s, 300));
            if (backVoice) await speak(backText, backVoice);
            await new Promise(s => setTimeout(s, 700));
        }
    };

    const handleLoadAndPlay = () => {
        if (!csvFile) {
            alert('Please select a CSV file');
            return;
        }
        
        Papa.parse(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rows = results.data;
                setLog(`Loaded ${rows.length} rows — playing first 20.`);
                playRows(rows.slice(0, 20));
            }
        });
    };

    const handleStop = () => {
        speechSynthesis.cancel();
        setLog('Playback stopped.');
    };

    const handleExportMp3 = async () => {
        if (!csvFile) {
            alert('Please select a CSV file');
            return;
        }

        const formData = new FormData();
        formData.append('file', csvFile);
        formData.append('language_for_front', frontLang);
        formData.append('language_for_back', backLang);
        
        setLog('Uploading and requesting MP3 — this may take a while...');
        
        try {
            const response = await fetch(synthesizeEndpoint, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const text = await response.text();
                throw new Error('Server error: ' + text);
            }
            
            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition') || '';
            const fileNameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^\";]+)"?/.exec(contentDisposition);
            let fileName = 'exported_audio.mp3';
            if (fileNameMatch) {
                fileName = decodeURIComponent(fileNameMatch[1] || fileNameMatch[2]);
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            
            setLog('Download started: ' + fileName);
        } catch (error) {
            console.error(error);
            alert('Export failed: ' + error.message);
            setLog('Export failed: ' + error.message);
        }
    };

    return (
        <div className="card">
            <h1>Imitatio Vocis — Imitate voices. Shadow languages.</h1>
            <p className="small">Upload CSV, pick voice and play. Export to MP3 for download.</p>
            <div className="controls">
                <input 
                    type="file" 
                    accept=".csv" 
                    onChange={(e) => setCsvFile(e.target.files[0])}
                />
                
                <label className="small">Front language</label>
                <select value={frontLang} onChange={(e) => setFrontLang(e.target.value)}>
                    <option value="en">English (en)</option>
                    <option value="la">Latin (la)</option>
                    <option value="el">Ancient Greek (el)</option>
                    <option value="it">Italian (it)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                    <option value="es">Spanish (es)</option>
                </select>
                
                <select 
                    value={frontVoice ? frontVoices.indexOf(frontVoice) : ''}
                    onChange={(e) => setFrontVoice(frontVoices[parseInt(e.target.value)])}
                    style={{minWidth: '200px'}}
                >
                    {frontVoices.length > 0 ? (
                        frontVoices.map((v, i) => (
                            <option key={i} value={i}>
                                {v.name} — {v.lang} {v.default ? '(default)' : ''}
                            </option>
                        ))
                    ) : (
                        <option value="">No matching voices</option>
                    )}
                </select>

                <label className="small">Back language</label>
                <select value={backLang} onChange={(e) => setBackLang(e.target.value)}>
                    <option value="la">Latin (la)</option>
                    <option value="en">English (en)</option>
                    <option value="el">Ancient Greek (el)</option>
                    <option value="it">Italian (it)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                    <option value="es">Spanish (es)</option>
                </select>
                
                <select 
                    value={backVoice ? backVoices.indexOf(backVoice) : ''}
                    onChange={(e) => setBackVoice(backVoices[parseInt(e.target.value)])}
                    style={{minWidth: '200px'}}
                >
                    {backVoices.length > 0 ? (
                        backVoices.map((v, i) => (
                            <option key={i} value={i}>
                                {v.name} — {v.lang} {v.default ? '(default)' : ''}
                            </option>
                        ))
                    ) : (
                        <option value="">No matching voices</option>
                    )}
                </select>

                <button onClick={handleLoadAndPlay} className="btn">Load & Play</button>
                <button onClick={handleExportMp3} className="btn">Export MP3</button>
                <button onClick={handleStop} className="btn" style={{background: '#ef4444'}}>Stop</button>
            </div>
            <div className="small" style={{marginTop: '12px'}}>{log}</div>
        </div>
    );
}

export default App;