# maia-service

A small HTTP service that answers one question: given a chess position and two
ratings, how likely is a human of that rating to play each legal move? The
model is [Maia-2](https://github.com/CSSLab/maia2) (rapid weights, MIT
licence), run on CPU with PyTorch. The API is in [API.md](API.md); latency
and sanity measurements are in [RESULTS.md](RESULTS.md); deploying is in
[DEPLOY.md](DEPLOY.md).

## Layout

```
app/main.py           HTTP layer: auth, routes, errors (FastAPI)
app/request.py        reading and validating a request body
app/policy.py         MoveScorer interface; softmax over legal moves, ordering
app/maia2_scorer.py   Maia-2 behind that interface (loaded once at startup)
scripts/fetch_weights.py   download + sha256-check the weights
scripts/mutate.py     deliberate breaks the tests must catch
scripts/bench.py      latency measurement
scripts/select_sanity.py, scripts/sanity.py   is the policy right
tests/                pytest; model tests skip when the weights are absent
```

## Run locally

Python 3.10 to 3.12 (maia2's range); 3.11 is what the image uses.

```bash
python3.11 -m venv .venv
```

```bash
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.8.0
```

```bash
.venv/bin/pip install -r requirements-dev.txt
```

```bash
.venv/bin/python scripts/fetch_weights.py
```

```bash
.venv/bin/python -m pytest -q
```

```bash
.venv/bin/uvicorn --factory app.main:create_app --port 8000
```

The weights (280 MB) land in `maia2_models/`, which git ignores. Without them
the model tests skip and everything else runs against a stub scorer.
