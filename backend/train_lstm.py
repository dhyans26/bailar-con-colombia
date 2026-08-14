"""Train the LSTM move classifier on backend/dataset/<move>/*.json takes
recorded by dataset_recorder.py.

Run:
    python backend/train_lstm.py
    python backend/train_lstm.py --epochs 150 --hidden-dim 32

Saves the best checkpoint (by validation accuracy) to
backend/model/lstm_move_classifier.pt, containing the model weights,
label list, feature normalization stats, and architecture config needed
to reload the model for inference later.
"""
    
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from lstm_model import DEFAULT_SEQ_LEN, FEATURE_DIM, ModelConfig, MoveLSTM, clip_to_features

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
MODEL_DIR = Path(__file__).resolve().parent / "model"
DEFAULT_OUT = MODEL_DIR / "lstm_move_classifier.pt"


def load_dataset(dataset_dir: Path, seq_len: int):
    """Return (X, y, label_names). X: (N, seq_len, FEATURE_DIM) float32,
    y: (N,) int64 class indices, label_names: sorted list of move names
    (index order matches y)."""
    move_dirs = sorted(p for p in dataset_dir.iterdir() if p.is_dir())
    if not move_dirs:
        raise RuntimeError(
            f"No move folders found in {dataset_dir} -- record some with "
            f"dataset_recorder.py first.")

    label_names = [d.name for d in move_dirs]
    X, y = [], []
    counts = {}

    for label_idx, move_dir in enumerate(move_dirs):
        take_paths = sorted(move_dir.glob("*.json"))
        counts[move_dir.name] = len(take_paths)
        for path in take_paths:
            with open(path) as f:
                data = json.load(f)
            frames = data.get("frames", [])
            if len(frames) < 2:
                print(f"skipping {path} -- only {len(frames)} frame(s)")
                continue
            kpts_seq = [np.array(fr["kpts_xy"], dtype=np.float32) for fr in frames]
            X.append(clip_to_features(kpts_seq, seq_len))
            y.append(label_idx)

    print("dataset loaded:")
    for name, count in counts.items():
        flag = "  <- fewer than 5, will skip validation split for this class" if count < 5 else ""
        print(f"  {name}: {count} take(s){flag}")

    if not X:
        raise RuntimeError("no usable clips found (all had < 2 frames)")

    return np.stack(X).astype(np.float32), np.array(y, dtype=np.int64), label_names


def stratified_split(y: np.ndarray, val_frac: float, seed: int):
    """Per-class shuffle + split so every well-represented class appears in
    both train and val -- classes with < 5 takes go entirely into train
    (not enough to hold anything out without starving training)."""
    rng = np.random.default_rng(seed)
    train_idx, val_idx = [], []
    for c in np.unique(y):
        idx = np.where(y == c)[0]
        rng.shuffle(idx)
        if len(idx) < 5:
            train_idx.extend(idx.tolist())
            continue
        n_val = max(1, int(round(len(idx) * val_frac)))
        val_idx.extend(idx[:n_val].tolist())
        train_idx.extend(idx[n_val:].tolist())
    return np.array(train_idx), np.array(val_idx)


def normalize_features(X: np.ndarray, mean: np.ndarray = None, std: np.ndarray = None):
    if mean is None:
        flat = X.reshape(-1, X.shape[-1])
        mean = flat.mean(axis=0)
        std = np.maximum(flat.std(axis=0), 1e-6)
    return ((X - mean) / std).astype(np.float32), mean, std


def run_epoch(model, loader, criterion, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)
    total_loss, correct, total = 0.0, 0, 0
    for xb, yb in loader:
        if is_train:
            optimizer.zero_grad()
        with torch.set_grad_enabled(is_train):
            logits = model(xb)
            loss = criterion(logits, yb)
            if is_train:
                loss.backward()
                optimizer.step()
        total_loss += loss.item() * len(yb)
        correct += (logits.argmax(dim=1) == yb).sum().item()
        total += len(yb)
    return total_loss / total, correct / total


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset-dir", type=Path, default=DATASET_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seq-len", type=int, default=DEFAULT_SEQ_LEN)
    parser.add_argument("--hidden-dim", type=int, default=64)
    parser.add_argument("--num-layers", type=int, default=1)
    parser.add_argument("--bidirectional", action="store_true")
    parser.add_argument("--dropout", type=float, default=0.4)
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--patience", type=int, default=25,
                         help="stop if val accuracy doesn't improve for this many epochs")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    torch.manual_seed(args.seed)

    X, y, label_names = load_dataset(args.dataset_dir, args.seq_len)
    if len(label_names) < 2:
        raise RuntimeError("need at least 2 move classes to train a classifier")

    train_idx, val_idx = stratified_split(y, args.val_split, args.seed)
    print(f"train: {len(train_idx)} clips, val: {len(val_idx)} clips")

    X_train, mean, std = normalize_features(X[train_idx])
    if len(val_idx):
        X_val, _, _ = normalize_features(X[val_idx], mean, std)
    else:
        X_val = np.zeros((0, X.shape[1], X.shape[2]), dtype=np.float32)

    # Inverse-frequency class weights to counter imbalance across move labels.
    class_counts = np.bincount(y[train_idx], minlength=len(label_names))
    class_weights = torch.tensor(
        class_counts.sum() / np.maximum(class_counts, 1), dtype=torch.float32)

    train_loader = DataLoader(
        TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y[train_idx])),
        batch_size=args.batch_size, shuffle=True)

    val_loader = None
    if len(val_idx):
        val_loader = DataLoader(
            TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y[val_idx])),
            batch_size=args.batch_size)
    else:
        print("warning: no validation clips (every class had < 5 takes) -- "
              "can't measure overfitting yet, record more takes and re-run")

    cfg = ModelConfig(hidden_dim=args.hidden_dim, num_layers=args.num_layers,
                       bidirectional=args.bidirectional, dropout=args.dropout,
                       num_classes=len(label_names), seq_len=args.seq_len,
                       label_names=label_names)
    model = MoveLSTM(cfg)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    best_val_acc = -1.0
    best_state = None
    epochs_without_improvement = 0

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, optimizer)

        if val_loader is not None:
            val_loss, val_acc = run_epoch(model, val_loader, criterion)
            print(f"epoch {epoch:3d}  train loss={train_loss:.3f} acc={train_acc:.2f}  "
                  f"val loss={val_loss:.3f} acc={val_acc:.2f}")
            if val_acc > best_val_acc:
                best_val_acc = val_acc
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1
                if epochs_without_improvement >= args.patience:
                    print(f"no val improvement for {args.patience} epochs -- stopping early")
                    break
        else:
            print(f"epoch {epoch:3d}  train loss={train_loss:.3f} acc={train_acc:.2f}")
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({
        "state_dict": best_state,
        "config": cfg.__dict__,
        "feature_mean": mean,
        "feature_std": std,
    }, args.out)

    msg = f"saved best model -> {args.out}"
    if val_loader is not None:
        msg += f" (best val acc={best_val_acc:.2f})"
    print(msg)


if __name__ == "__main__":
    main()
