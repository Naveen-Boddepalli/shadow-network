# Three-slot LLM fallback chain over OpenAI-compatible chat endpoints.
#
# Every slot is a base URL, a model and an API key, so a slot can point at Groq,
# Gemini's OpenAI-compatible endpoint, OpenRouter, a local Ollama or anything else
# that speaks `POST {base_url}/chat/completions`. Slots are tried in order; a slot
# that is rate limited, down, slow or misconfigured hands the request to the next.
#
# Configure with LLM_1_BASE_URL / LLM_1_MODEL / LLM_1_API_KEY (and LLM_2_, LLM_3_).

import os
import re
from dataclasses import dataclass

import httpx

# A slot counts as configured only once it has a URL, a model and a real key.
PLACEHOLDER_KEYS = {"", "none", "unset", "placeholder", "changeme"}


@dataclass(frozen=True)
class Slot:
    name: str  # "LLM_1" etc.: appears in logs and /health, never the key
    base_url: str
    model: str
    api_key: str


class AllSlotsFailedError(RuntimeError):
    def __init__(self, failures: list[str]):
        self.failures = failures
        super().__init__("Every LLM slot failed: " + "; ".join(failures))

    @property
    def rate_limited(self) -> bool:
        return any(" 429 " in f for f in self.failures)


def slots_from_env(env=None) -> list[Slot]:
    env = os.environ if env is None else env
    return [
        Slot(
            name=f"LLM_{n}",
            base_url=env.get(f"LLM_{n}_BASE_URL", "").strip().rstrip("/"),
            model=env.get(f"LLM_{n}_MODEL", "").strip(),
            api_key=env.get(f"LLM_{n}_API_KEY", "").strip(),
        )
        for n in (1, 2, 3)
    ]


def configured_slots(slots: list[Slot] | None = None) -> list[Slot]:
    slots = slots_from_env() if slots is None else slots
    return [
        s for s in slots
        if s.base_url and s.model and s.api_key.lower() not in PLACEHOLDER_KEYS
    ]


def plain_text(text: str) -> str:
    """
    Strip the markdown models add despite being asked for plain text (the
    frontend shows answers verbatim): **bold**, __bold__, # headings, and '*'
    bullets, which become '-'.
    """
    text = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m.group(1) or m.group(2), text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    text = re.sub(r"^(\s*)\*\s+", r"\1- ", text, flags=re.M)
    return text.strip()


def complete(
    messages: list[dict],
    *,
    max_tokens: int = 700,
    temperature: float = 0.2,
    timeout: float = 45.0,
    slots: list[Slot] | None = None,
) -> dict:
    """Return {text, slot, model} from the first slot that answers."""
    usable = configured_slots(slots)
    if not usable:
        raise AllSlotsFailedError(["no LLM slot is configured (set LLM_1_BASE_URL, LLM_1_MODEL, LLM_1_API_KEY)"])

    failures: list[str] = []
    for slot in usable:
        try:
            r = httpx.post(
                f"{slot.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {slot.api_key}"},
                json={
                    "model": slot.model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
                timeout=timeout,
            )
        except httpx.HTTPError as e:
            failures.append(f"{slot.name} {type(e).__name__}: {e}")
            continue

        if r.status_code >= 400:
            # 429 is the expected one on free tiers; other 4xx usually mean a bad key
            # or a retired model name. Either way the next slot gets a chance.
            failures.append(f"{slot.name} {r.status_code} {r.text[:200]}")
            continue

        try:
            text = (r.json()["choices"][0]["message"].get("content") or "").strip()
        except (ValueError, KeyError, IndexError, TypeError):
            text = ""
        if not text:
            failures.append(f"{slot.name} returned an empty completion")
            continue

        print(f"LLM answered via {slot.name} ({slot.model})")
        return {"text": text, "slot": slot.name, "model": slot.model}

    print(f"All LLM slots failed: {failures}")
    raise AllSlotsFailedError(failures)
