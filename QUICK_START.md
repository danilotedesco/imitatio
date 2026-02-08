Quick start — one command

Run both backend (Flask) and frontend (Vite) with a single script.

1) Make the script executable (run once):

```bash
chmod +x dev.sh
```

2) Start both servers:

```bash
./dev.sh
```

What the script does:
- Creates or reuses `backend/.venv` and installs Python deps from `backend/requirements.txt`.
- Starts the Flask backend at `http://127.0.0.1:5000` and writes logs to `.dev_backend.log`.
- Starts the Vite dev server for the React app at `http://localhost:5173` in the foreground.

Stopping:
- Press `Ctrl-C` in the terminal running `./dev.sh` to stop Vite and the backend.

If you'd like, I can instead add a `Makefile` or an `npm` root script that uses `concurrently`/`pnpm` to manage both processes.
