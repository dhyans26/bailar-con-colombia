import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset, TensorDataset

from lstm_model import (DEFAULT_SEQ_LEN, FEATURE_DIM, ModelConfig, MoveLSTM,
                         augment_clip, clip_to_features, jitter_features)

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
MODEL_DIR = Path(__file__).resolve().parent / "model"
DEFAULT_OUT = MODEL_DIR / "lstm_move_classifier.pt"


def load_dataset(dataset_dir: Path):
    """Return (clips, y, label_names). clips: list of per-clip lists of raw
    (17, 2) keypoint frames (kept unfeaturized so training-time augmentation
    can still mirror/crop the original frames), y: (N,) int64 class indices,
    label_names: sorted list of move names (index order matches y)."""
    move_dirs = sorted(p for p in dataset_dir.iterdir() if p.is_dir())
    if not move_dirs:
        raise RuntimeError(
            f"No move folders found in {dataset_dir} -- record some with "
            f"dataset_recorder.py first.")

    label_names = [d.name for d in move_dirs]
    clips, y = [], []
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
            clips.append(kpts_seq)
            y.append(label_idx)

    print("dataset loaded:")
    for name, count in counts.items():
        flag = "  <- fewer than 5, will skip validation split for this class" if count < 5 else ""
        print(f"  {name}: {count} take(s){flag}")

    if not clips:
        raise RuntimeError("no usable clips found (all had < 2 frames)")

    return clips, np.array(y, dtype=np.int64), label_names


def features_for_clips(clips, seq_len: int) -> np.ndarray:
    return np.stack([clip_to_features(c, seq_len) for c in clips]).astype(np.float32)


class ClipDataset(Dataset):
    """Wraps raw per-frame keypoint clips + labels and featurizes them
    lazily."""

    def __init__(self, clips, labels, seq_len, mean, std, augment: bool,
                 jitter_std: float = 0.03, seed: int = 0):
        self.clips = clips
        self.labels = labels
        self.seq_len = seq_len
        self.mean = mean
        self.std = std
        self.augment = augment
        self.jitter_std = jitter_std
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return len(self.clips)

    def __getitem__(self, idx):
        frames = self.clips[idx]
        if self.augment:
            frames = augment_clip(frames, self.rng)
        feats = clip_to_features(frames, self.seq_len)
        if self.augment:
            feats = jitter_features(feats, self.rng, std=self.jitter_std)
        feats = (feats - self.mean) / self.std
        return torch.from_numpy(feats.astype(np.float32)), torch.tensor(self.labels[idx], dtype=torch.int64)


def stratified_split(y: np.ndarray, val_frac: float, seed: int):
    """Per-class shuffle + split so every well-represented class appears in
    both train and val"""
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
    parser.add_argument("--weight-decay", type=float, default=1e-3)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--patience", type=int, default=25,
                         help="stop if val loss doesn't improve for this many epochs")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--no-augment", action="store_true",
                         help="disable training-time mirror/time-crop/jitter augmentation")
    parser.add_argument("--jitter-std", type=float, default=0.03,
                         help="std of gaussian noise added to normalized joint positions "
                              "when augmenting (ignored with --no-augment)")
    args = parser.parse_args()

    torch.manual_seed(args.seed)

    clips, y, label_names = load_dataset(args.dataset_dir)
    if len(label_names) < 2:
        raise RuntimeError("need at least 2 move classes to train a classifier")

    train_idx, val_idx = stratified_split(y, args.val_split, args.seed)
    print(f"train: {len(train_idx)} clips, val: {len(val_idx)} clips"
          f"{'' if args.no_augment else ' (augmented)'}")

    train_clips = [clips[i] for i in train_idx]
    val_clips = [clips[i] for i in val_idx]

    # norm stats always come from the un-augmented features, so
    # they don't drift with whatever a given epoch's random jitter/crop did
    _, mean, std = normalize_features(features_for_clips(train_clips, args.seq_len))
    if len(val_idx):
        X_val, _, _ = normalize_features(features_for_clips(val_clips, args.seq_len), mean, std)
    else:
        X_val = np.zeros((0, args.seq_len, FEATURE_DIM), dtype=np.float32)

    # inverse-frequency class weights to counter stupid inbalance across the model
    class_counts = np.bincount(y[train_idx], minlength=len(label_names))
    class_weights = torch.tensor(
        class_counts.sum() / np.maximum(class_counts, 1), dtype=torch.float32)

    train_dataset = ClipDataset(
        train_clips, y[train_idx], args.seq_len, mean, std,
        augment=not args.no_augment, jitter_std=args.jitter_std, seed=args.seed)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)

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

    # label smoothing improves perf
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    best_val_loss = float("inf")
    best_val_acc = -1.0
    best_state = None
    epochs_without_improvement = 0

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, optimizer)

        if val_loader is not None:
            val_loss, val_acc = run_epoch(model, val_loader, criterion)
            print(f"epoch {epoch:3d}  train loss={train_loss:.3f} acc={train_acc:.2f}  "
                  f"val loss={val_loss:.3f} acc={val_acc:.2f}")
            # checkpoint on val loss 
            if val_loss < best_val_loss:
                best_val_loss = val_loss
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
