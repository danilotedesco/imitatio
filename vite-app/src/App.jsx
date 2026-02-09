import React, { useEffect, useState, useRef } from "react";

export default function App() {
 const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
 const synthUrl = BACKEND_URL + '/synthesize_text';
 // ... rest of the code
}