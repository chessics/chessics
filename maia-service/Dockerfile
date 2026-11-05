# Maia-2 move service, CPU only.
#
#   docker build -t maia-service .                 # runtime image (Railway builds this)
#   docker build --target test -t maia-test .       # also runs the test suite
#
# The weights are downloaded and sha256-checked at build time, never committed.
# Pass --build-arg MAIA_WEIGHTS_URL=... to fetch them from a mirror instead of
# Google Drive; the same sha256 is enforced.

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MAIA_MODEL_DIR=/models
WORKDIR /srv

# CPU wheel first, so maia2's torch requirement is already met and pip never
# pulls the CUDA build (several GB). Override only to test where the CPU index
# is unreachable.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN pip install --index-url "$TORCH_INDEX_URL" torch==2.8.0
COPY requirements.txt .
RUN pip install -r requirements.txt

# Weights layer before the code, so a code change does not re-download them.
ARG MAIA_WEIGHTS_URL=
COPY scripts/fetch_weights.py scripts/fetch_weights.py
RUN MAIA_WEIGHTS_URL="$MAIA_WEIGHTS_URL" python scripts/fetch_weights.py --dir /models

COPY app app

FROM base AS test
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY tests tests
COPY pytest.ini .
RUN python -m pytest -q

FROM base AS runtime
# The service writes nothing, so root-owned, world-readable files are enough
# (a chown here would copy the 280 MB of weights into another layer).
RUN useradd --system --uid 10001 maia
USER maia
# MAIA_TOKEN: set it in the service's variables, never in this file.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn --factory app.main:create_app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log"]
