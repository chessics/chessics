# Deploying maia-service (notes, not yet done)

Nothing here has been deployed. These are the steps and the settings the
measurements in RESULTS.md point to.

## Image

`Dockerfile` builds three stages. `runtime` (the last, so the default) is the
one to serve. `test` additionally runs the pytest suite inside the image:

```bash
docker build --target test -t maia-test .
```

```bash
docker build -t maia-service .
```

At build time the image installs the CPU-only torch wheel, then downloads the
Maia-2 rapid weights (280 MB) from Google Drive and checks them against the
sha256 maia2 pins. The weights are never in the repository.

**Drive can refuse.** Google Drive rate-limits popular files ("too many users
have viewed or downloaded this file"), which would fail a build. To build
without Drive, put the same file somewhere you control (object storage, a
release asset) and pass its URL:

```bash
docker build --build-arg MAIA_WEIGHTS_URL=https://example.invalid/rapid_model.pt -t maia-service .
```

The sha256 check is the same either way: a wrong file fails the build.

## Railway service

A separate service from the analysis worker; it shares nothing with it.

- **Source:** this folder (`maia-service/`), built from its Dockerfile.
  Railway uses a Dockerfile it finds at the service root.
- **Start command:** none needed; the image's CMD runs uvicorn on `$PORT`.
- **Healthcheck:** path `/health`. It only answers once the model is loaded
  (about 2 to 3 s after start; see RESULTS.md).
- **Variables:**
  - `MAIA_TOKEN`: a long random string, e.g. from `openssl rand -hex 32`.
    The caller sends it as `Authorization: Bearer <token>`. The caller keeps it
    server-side only, never in browser code.
  - `MAIA_THREADS`: set it to the vCPU count the service is given. Unset,
    torch picks a thread count from the cores it can see, which in a shared
    container can be the host's cores rather than the service's share, and
    oversubscribing threads makes each request slower.
  - Leave `MAIA_ALLOW_DOWNLOAD` unset: the weights are in the image, and the
    service then refuses to start rather than fetch them at runtime.
- **Networking:** the caller runs outside Railway, so the service needs a
  public domain. Railway's private network only reaches other Railway
  services.
- **Replicas:** one. Each process holds one copy of the model and runs one
  forward pass at a time: about 43 requests a second on 1 vCPU (RESULTS.md).

## Sizing

From RESULTS.md: 1 vCPU with `MAIA_THREADS=1` and a 1 GB memory limit. That
gave a median 20 ms per request in a container on the sandbox's CPU, and
about 0.4 GB in use. The image started under a 768 MB limit and was killed
during load at 512 MB. Two vCPUs bring the median to 14 ms. Estimated cost: 4 to 9 USD a
month, nearly all memory (RESULTS.md has the arithmetic).

Measure again on the real instance before trusting those figures:

```bash
MAIA_TOKEN=... python scripts/bench.py remote --url https://<service-domain>
```

## What was and was not verified (4 Nov 2026)

The image was built and run in a sandbox. Three things differed from a real
build, so these parts of the Dockerfile are **not verified**:

- **The CPU-only torch wheel.** download.pytorch.org's file host was
  unreachable, so the build used `--build-arg TORCH_INDEX_URL=https://pypi.org/simple`,
  which installs the CUDA build (an 11.8 GB image). The real image should be
  far smaller; its size was not measured.
- **The Google Drive download inside the build.** Drive's file host was
  unreachable from the build, so the weights came through
  `--build-arg MAIA_WEIGHTS_URL` from a local copy. The local copy itself was
  downloaded from the same Drive file outside the build, and the build checked
  it against maia2's sha256.
- **The sandbox's TLS certificate.** Two lines added to a copy of the Dockerfile
  trusted the sandbox proxy's certificate; the committed file does not have them.

Verified with that build: the `test` stage runs the whole suite inside the
image (290 passed), against the real weights. The `runtime` image starts as a
non-root user, answers `/health`, refuses a request without the token, and
serves the latency in RESULTS.md under `--cpus 1` and `--cpus 2`.
