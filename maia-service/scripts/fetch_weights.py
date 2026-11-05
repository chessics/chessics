"""Download the Maia-2 rapid weights and check their sha256.

    python scripts/fetch_weights.py [--dir ./maia2_models] [--url URL]

By default the file comes from maia2's own Google Drive link. `--url` (or
MAIA_WEIGHTS_URL) fetches the same file from somewhere else, for when Drive
refuses (it rate-limits popular files). Either way the file must match the
sha256 maia2 pins, or nothing is written. The weights are never committed.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
import urllib.request
from pathlib import Path


def fetch_from_url(url: str, dest: Path, sha256: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False, suffix=".part") as tmp:
        tmp_path = Path(tmp.name)
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                for block in iter(lambda: r.read(1 << 20), b""):
                    digest.update(block)
                    tmp.write(block)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
    if digest.hexdigest() != sha256:
        tmp_path.unlink(missing_ok=True)
        raise SystemExit(f"sha256 mismatch from {url}: got {digest.hexdigest()}, want {sha256}")
    os.replace(tmp_path, dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.environ.get("MAIA_MODEL_DIR", "./maia2_models"))
    ap.add_argument("--url", default=os.environ.get("MAIA_WEIGHTS_URL") or None)
    args = ap.parse_args()

    from maia2 import model
    from maia2.utils import sha256_file

    asset = model._MODEL_ASSETS["rapid"]
    path = Path(args.dir) / asset["filename"]
    if args.url and not path.is_file():
        fetch_from_url(args.url, path, asset["sha256"])

    # Verifies the sha256 of what is on disk; downloads from Drive if absent.
    m = model.from_pretrained(type="rapid", device="cpu", save_root=args.dir)
    # Both download paths write through a temporary file, created 0600; the
    # service runs as a non-root user and only needs to read it.
    path.chmod(0o644)
    params = sum(p.numel() for p in m.parameters())
    print(f"ok {path} {path.stat().st_size} bytes sha256 {sha256_file(path)} params {params}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
