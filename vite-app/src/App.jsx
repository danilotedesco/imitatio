import React, { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const synthUrl = BACKEND_URL + '/synthesize_text';

function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');

  const handleSynthesize = async () => {
    const response = await fetch(synthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: inputText }),
    });
    const data = await response.json();
    setOutputText(data.output || 'Error synthesizing text');
  };

  return (
    <div>
      <h1>Imitatio Application</h1>
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Enter text to synthesize"
      />
      <button onClick={handleSynthesize}>Synthesize</button>
      <div>
        <h2>Output:</h2>
        <p>{outputText}</p>
      </div>
      <input type="text" value={BACKEND_URL + '/synthesize_text'} readOnly />
    </div>
  );
}

export default App;