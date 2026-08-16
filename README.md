<img src="frontend/public/logo.png" width="100%">

A desktop game where you dance salsa in front of your webcam, and computer vision judges your moves!

Real-time pose estimation (YOLO) feeds a LSTM move classifier that recognizes your dance moves (`front_and_back`, `idle`, `side_step`, `spin`) live from webcam video. Dance well and you'll earn your salsa license from Señorita Cabí and Señor Empanada, up on the slopes of Monserrate, Bogotá.


### Training data / model

- Dance clips are recorded per-move with `backend/dataset_recorder.py` into `backend/dataset/<move_name>/`.
- `backend/train_lstm.py` trains the LSTM classifier on that dataset and writes a checkpoint to `backend/model/lstm_move_classifier.pt`.
- `backend/test_lstm_model.py` opens a live webcam window with prediction bars.

## Getting started

### Prerequisites

- Python 3.10+ and a virtualenv at `.venv/` in the repo root (Electron looks for it first before falling back to `python` on `PATH`)
- Node.js + npm
- A webcam
- A [Supabase](https://supabase.com) project (for the leaderboard)

### Backend setup

```bash
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Run the API standalone (auto-reload, for development):

```bash
cd backend
uvicorn api:app --reload --port 8000
```

### Frontend setup

```bash
cd frontend
npm install
cp ../.env.sample .env   # fill in your Supabase URL + publishable key
```

Run everything together as the Electron app (starts the Python backend automatically and opens the game window):

```bash
npm run electron:dev
```

Or just the web frontend against an already-running backend:

```bash
npm run dev
```

### Environment variables

Copy [`.env.sample`](.env.sample) to `.env` and fill in your own Supabase project credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Apply [`supabase/schema.sql`](supabase/schema.sql) to your Supabase project to set up the leaderboard table and RPC.


## Acknowledgments

Thank u so much to Tati for teaching us salsa and farming data, and to Dhamari for farming data. Me yum data 🫓
