import React from 'react';

function App() {
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const synthUrl = BACKEND_URL + '/synthesize_text';
    // ... rest of the App component
}

export default App;