import React, { useState } from 'react';

function App() {
    const [text, setText] = useState('');
    const [response, setResponse] = useState('');

    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const synthUrl = BACKEND_URL + '/synthesize_text';

    const handleSubmit = async (e) => {
        e.preventDefault();
        const res = await fetch(synthUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        const data = await res.json();
        setResponse(data.synthesizedText);
    };

    return (
        <div>
            <form onSubmit={handleSubmit}>
                <textarea value={text} onChange={(e) => setText(e.target.value)} />
                <button type="submit">Synthesize</button>
            </form>
            <div>{response}</div>
        </div>
    );
}

export default App;