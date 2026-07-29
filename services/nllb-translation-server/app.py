"""
Minimal inference server for facebook/nllb-200-distilled-600M, exposing the
HTTP contract App\\Services\\Translation\\Providers\\NllbProvider expects.

Run:
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 8000

Set NLLB_API_KEY to require a matching "Authorization: Bearer <token>"
header (leave unset to run without auth, e.g. behind a private network).
"""

import os

import torch
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "facebook/nllb-200-distilled-600M"
API_KEY = os.environ.get("NLLB_API_KEY")

app = FastAPI(title="NLLB Translation Server")

device = "cuda" if torch.cuda.is_available() else "cpu"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(device)
model.eval()


class TranslateRequest(BaseModel):
    texts: list[str]
    source_lang: str  # FLORES-200 code, e.g. "eng_Latn"
    target_lang: str  # FLORES-200 code, e.g. "tha_Thai"


class TranslateResponse(BaseModel):
    translations: list[str]


def check_auth(authorization: str | None) -> None:
    if not API_KEY:
        return

    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(401, "Missing or invalid bearer token.")


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    if not req.texts:
        return TranslateResponse(translations=[])

    try:
        tokenizer.src_lang = req.source_lang
        target_id = tokenizer.convert_tokens_to_ids(req.target_lang)
    except Exception as exc:
        raise HTTPException(400, f"Unknown source_lang/target_lang: {exc}")

    inputs = tokenizer(req.texts, return_tensors="pt", padding=True, truncation=True).to(device)

    with torch.no_grad():
        generated = model.generate(**inputs, forced_bos_token_id=target_id, max_length=512)

    translations = tokenizer.batch_decode(generated, skip_special_tokens=True)
    return TranslateResponse(translations=translations)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "device": device}
