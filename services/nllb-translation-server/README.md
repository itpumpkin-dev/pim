# NLLB Translation Server

Standalone FastAPI service that loads `facebook/nllb-200-distilled-600M`
via Hugging Face `transformers` and exposes it over HTTP so PIM's
"NLLB-200 (Self-hosted)" translation provider can call it. Runs
independently of the Laravel app — deploy it wherever you have Python and
enough RAM/VRAM for the model (~2.5GB download, CPU inference works but is
slow for large batches).

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

First request downloads the model from Hugging Face Hub and caches it
locally (`~/.cache/huggingface`).

Optional auth: set `NLLB_API_KEY` before starting the server to require a
matching `Authorization: Bearer <token>` header. Put the same value in the
provider's "Bearer Token" field in the PIM admin UI.

## API

`POST /translate`

```json
{
  "texts": ["Hello", "World"],
  "source_lang": "eng_Latn",
  "target_lang": "tha_Thai"
}
```

→

```json
{ "translations": ["สวัสดี", "โลก"] }
```

Language codes are FLORES-200 (NLLB's own language set), not ISO 639-1 —
the Laravel provider maps locale codes like `en`/`th` to these before
calling this server.

`GET /health` → `{"status": "ok", "model": "...", "device": "cpu"|"cuda"}`
