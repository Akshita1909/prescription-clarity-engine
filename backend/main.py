import os
import hashlib
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import httpx
import base64
import json
import redis
from datetime import datetime

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Prescription Clarity Engine", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis cache
try:
    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    cache.ping()
    CACHE_AVAILABLE = True
    print("Redis cache connected")
except Exception:
    CACHE_AVAILABLE = False
    print("Redis not available, caching disabled")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
CACHE_TTL = 3600  # 1 hour

PROMPT = """You are a medical prescription decoder. Analyze this prescription image and return a JSON object.

Extract everything you can see and return ONLY valid JSON, no other text.

Return this exact structure:
{
  "raw_text": "exact text you can read from the prescription",
  "patient_name": "patient name if visible",
  "doctor_name": "doctor name if visible",
  "drugs": [
    {
      "name": "drug brand name",
      "generic_name": "generic/chemical name",
      "drug_class": "e.g. Antibiotic, Painkiller, Antacid",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily",
      "duration": "e.g. 5 days",
      "timing": "e.g. After meals",
      "what_it_does": "one sentence explanation of what this drug treats",
      "plain_language": "explain in very simple words what the patient should know",
      "side_effects": "common side effects in plain language",
      "warnings": "important warnings",
      "food_interactions": "foods to avoid or take with"
    }
  ],
  "schedule": [
    {
      "drug_name": "drug name",
      "time": "Morning / Afternoon / Evening / Night",
      "dosage": "dose to take",
      "instruction": "e.g. Take after food"
    }
  ],
  "interactions": [
    {
      "drug1": "first drug",
      "drug2": "second drug",
      "severity": "High / Moderate / Low",
      "description": "what happens when taken together",
      "action": "what the patient should do"
    }
  ]
}

Language for plain_language field: LANGUAGE_PLACEHOLDER

Rules:
- If you cannot read something clearly, make your best guess based on context
- For schedule, create one entry per drug per time slot
- Only include interactions if there are 2+ drugs and a real interaction exists
- Keep plain_language simple enough for a person with no medical knowledge
- Return ONLY the JSON object, no markdown, no explanation"""


def get_cache_key(image_data: bytes, language: str) -> str:
    image_hash = hashlib.md5(image_data).hexdigest()
    return f"prescription:{image_hash}:{language}"


def validate_file(file: UploadFile, data: bytes):
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is 10MB, got {len(data) / 1024 / 1024:.1f}MB"
        )
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Allowed: JPG, PNG, WebP, GIF"
        )


def parse_ai_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI returned invalid response: {str(e)}"
        )


def build_safe_result(raw: dict, cached: bool = False) -> dict:
    return {
        "raw_text": raw.get("raw_text", ""),
        "patient_name": raw.get("patient_name", ""),
        "doctor_name": raw.get("doctor_name", ""),
        "drugs": raw.get("drugs", []),
        "schedule": raw.get("schedule", []),
        "interactions": raw.get("interactions", []),
        "analyzed_at": datetime.utcnow().isoformat(),
        "cached": cached,
    }


@app.post("/analyze")
@limiter.limit("10/minute")
async def analyze(request: Request, file: UploadFile = File(...), language: str = Form("english")):
    image_data = await file.read()

    validate_file(file, image_data)

    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="API key not configured. Set OPENROUTER_API_KEY environment variable."
        )

    # Check cache
    cache_key = get_cache_key(image_data, language)
    if CACHE_AVAILABLE:
        cached = cache.get(cache_key)
        if cached:
            print(f"Cache HIT for key: {cache_key[:20]}...")
            result = json.loads(cached)
            result["cached"] = True
            return result

    print(f"Cache MISS - calling AI API")

    base64_image = base64.standard_b64encode(image_data).decode("utf-8")
    ext = (file.filename or "image.jpg").split(".")[-1].lower()
    media_type_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "image/jpeg")
    prompt = PROMPT.replace("LANGUAGE_PLACEHOLDER", language)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "nvidia/nemotron-nano-12b-v2-vl:free",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{media_type};base64,{base64_image}"
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                }
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach AI service: {str(e)}")

    data = response.json()

    if "error" in data:
        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {data['error'].get('message', 'Unknown error')}"
        )

    if "choices" not in data or not data["choices"]:
        raise HTTPException(status_code=502, detail="AI returned empty response")

    response_text = data["choices"][0]["message"]["content"]
    parsed = parse_ai_response(response_text)
    result = build_safe_result(parsed, cached=False)

    # Store in cache
    if CACHE_AVAILABLE:
        cache.setex(cache_key, CACHE_TTL, json.dumps(result))
        print(f"Cached result for 1 hour")

    return result


@app.get("/health")
def health():
    return {
        "status": "ok",
        "api_key_set": bool(OPENROUTER_API_KEY),
        "cache_available": CACHE_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/")
def root():
    return {"status": "Prescription Clarity Engine running", "version": "1.0.0"}