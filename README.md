<img src="frontend/public/logo.png" width="100%">

A desktop game where you dance salsa in front of your webcam, and computer vision judges your moves!

Real-time pose estimation (YOLO) feeds a LSTM move classifier that recognizes your dance moves (`front_and_back`, `idle`, `side_step`, `spin`) live from webcam video. Dance well and you'll earn your salsa license from Señorita Cabí and Señor Empanada, up on the slopes of Monserrate, Bogotá.

## Install (macOS)

1. Grab the latest `.dmg` from [Releases](https://github.com/dhyans26/bailar-con-colombia/releases).
2. Open the `.dmg` and drag **Macondo** into your `Applications` folder.
3. The app is ad-hoc signed, so Gatekeeper will block the first launch as "unidentified developer." Right-click (or Control-click) the app in `Applications` and choose **Open**
4. Grant camera access when prompted

Only an Apple Silicon (arm64) build is currently published; there's no Windows/Linux release yet, see [Frontend setup](#frontend-setup) below to run from source instead.

### Training data / model

- Dance clips are recorded per-move with `backend/dataset_recorder.py` into `backend/dataset/<move_name>/`.
- `backend/train_lstm.py` trains the LSTM classifier on that dataset and writes a checkpoint to `backend/model/lstm_move_classifier.pt`.
- `backend/test_lstm_model.py` opens a live webcam window with prediction bars.

## Getting started

### Prerequisites

- Python 3.12+ and a virtualenv at `.venv/` in the repo root 
- Node.js + npm
- A webcam
- A [Supabase](https://supabase.com) project (for the leaderboard)

### Supabase setup

Apply [`supabase/schema.sql`](supabase/schema.sql) to your Supabase project to set up the leaderboard table and RPC.

### Backend setup

```bash
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
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

## Acknowledgments

Thank u so much to Tati and Dhamari for helping train our model