import React from 'react';

function App() {
    // Other code...

    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const synthUrl = BACKEND_URL + '/synthesize_text';

    // Other code...
}

export default App;