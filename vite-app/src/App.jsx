import React, { useState } from 'react';
import './App.css';

function App() {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [audioUrl, setAudioUrl] = useState('');

  const handleTextChange = (event) => {
    setText(event.target.value);
  };

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
  };

  const synthesizeSpeech = () => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const audioBlob = new Blob([], { type: 'audio/mpeg' });
    // Use speech synthesis to generate audio here
    synth.speak(utterance);
    setAudioUrl(audioBlob);
  };

  const downloadAudio = () => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = 'speech.mp3';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="App">
      <h1>Text to Speech</h1>
      <textarea value={text} onChange={handleTextChange} placeholder="Type something..." />
      <div className="controls">
        <select value={language} onChange={handleLanguageChange}>
          <option value="en-US">English (US)</option>
          <option value="es-ES">Spanish (Spain)</option>
          <option value="fr-FR">French (France)</option>
          <!-- Add more languages as needed -->
        </select>
        <button onClick={synthesizeSpeech}>Synthesize</button>
        {audioUrl && <button onClick={downloadAudio}>Download</button>}
      </div>
      <audio src={audioUrl} controls></audio>
    </div>
  );
}

export default App;
