import React from 'react';

// Other imports and code

const App = () => {
    // ... other code

    // Updated lines
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const synthUrl = BACKEND_URL + '/synthesize_text';

    return (
        <div>
            {/* Other JSX */}
            <input value={BACKEND_URL + '/synthesize_text'} readOnly />
            {/* Other JSX */}
        </div>
    );
};

export default App;