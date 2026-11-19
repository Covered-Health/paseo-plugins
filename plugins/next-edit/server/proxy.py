# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi>=0.115,<1", "uvicorn>=0.34,<1", "httpx>=0.28,<1", "zed-zeta-bindings==1.10.2"]
# ///
"""Run: uv run --script proxy.py. Configure ZETA_COMPLETIONS_URL, ZETA_MODEL,
ZETA_API_KEY, and optional PREDICTION_CORS_ORIGINS (comma-separated).
The model URL is the full OpenAI-compatible /v1/completions endpoint.
"""
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

FORMAT = "V0318SeedMultiRegions"


class History(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diff: str = Field(max_length=16_000)


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=4096)
    text: str = Field(max_length=500_000)
    cursorOffset: int = Field(ge=0)
    history: list[History] = Field(default_factory=list, max_length=10)


def utf16_to_byte(text: str, offset: int) -> int:
    """CodeMirror uses UTF-16 code units; Zeta uses UTF-8 bytes."""
    if offset < 0:
        raise ValueError("Negative cursor offset")
    encoded = text.encode("utf-16-le")
    if offset * 2 > len(encoded):
        raise ValueError("Cursor outside document")
    return len(encoded[:offset * 2].decode("utf-16-le").encode("utf-8"))


def byte_to_utf16(data: bytes, offset: int) -> int:
    if not 0 <= offset <= len(data):
        raise ValueError("Byte offset outside document")
    return len(data[:offset].decode("utf-8").encode("utf-16-le")) // 2


def build_input(body: Prediction, zeta):
    cursor = utf16_to_byte(body.text, body.cursorOffset)
    return zeta.Zeta2PromptInput(
        cursor_path=body.path, cursor_excerpt=body.text,
        cursor_offset_in_excerpt=cursor,
        excerpt_ranges=zeta.compute_excerpt_ranges(body.text, cursor),
        excerpt_start_row=0,
        events=[zeta.Event(path=body.path, old_path=body.path, diff=item.diff) for item in body.history],
    )


def splice(body: Prediction, parsed) -> dict:
    original = body.text.encode("utf-8")
    start, end = parsed.range_in_excerpt
    if not 0 <= start <= end <= len(original):
        raise ValueError("Invalid predicted region")
    # Decode both boundaries to reject ranges inside a UTF-8 code point.
    original[:start].decode("utf-8")
    original[:end].decode("utf-8")
    replacement = parsed.new_editable_region.encode("utf-8")
    cursor = parsed.cursor_offset_in_new_editable_region
    if cursor is None:
        old_cursor = utf16_to_byte(body.text, body.cursorOffset)
        if old_cursor < start:
            cursor_global = old_cursor
        elif old_cursor > end:
            cursor_global = old_cursor + len(replacement) - (end - start)
        else:
            # No explicit cursor: place it after the predicted region.
            cursor_global = start + len(replacement)
    else:
        byte_to_utf16(replacement, cursor)
        cursor_global = start + cursor
    updated = original[:start] + replacement + original[end:]
    return {"newText": updated.decode("utf-8"), "cursorOffset": byte_to_utf16(updated, cursor_global)}


@asynccontextmanager
async def lifespan(app):
    import zeta_bindings
    app.state.zeta = zeta_bindings
    async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
        app.state.http = client
        yield


app = FastAPI(lifespan=lifespan)
origins = [value.strip() for value in os.environ.get("PREDICTION_CORS_ORIGINS", "").split(",") if value.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST"], allow_headers=["Content-Type"])


@app.post("/predict")
async def predict(body: Prediction):
    try:
        prompt_input = build_input(body, app.state.zeta)
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(422, "Invalid editor state") from exc
    prompt = app.state.zeta.format_prompt(prompt_input, FORMAT)
    if prompt is None:
        raise HTTPException(422, "Editor context exceeds Zeta prompt budget")
    headers = {}
    if key := os.environ.get("ZETA_API_KEY"):
        headers["Authorization"] = f"Bearer {key}"
    payload = {
        "prompt": prompt, "max_tokens": 512, "temperature": 0.0,
        "stop": app.state.zeta.stop_tokens(FORMAT) or ["<|marker_2|>"],
        "stream": False,
    }
    if model := os.environ.get("ZETA_MODEL"):
        payload["model"] = model
    try:
        response = await app.state.http.post(
            os.environ.get("ZETA_COMPLETIONS_URL", "http://127.0.0.1:8080/v1/completions"),
            json=payload, headers=headers,
        )
        response.raise_for_status()
        data = response.json()
        choice = data["choices"][0]
        # A truncated marker-span response can erase valid code; never offer it.
        if choice.get("finish_reason") == "length":
            raise ValueError("Truncated prediction")
        parsed = app.state.zeta.parse_output(choice["text"], FORMAT, prompt_input)
        return splice(body, parsed)
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Model request timed out") from exc
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Invalid or failed model prediction") from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("PREDICTION_HOST", "127.0.0.1"), port=int(os.environ.get("PREDICTION_PORT", "8001")))
