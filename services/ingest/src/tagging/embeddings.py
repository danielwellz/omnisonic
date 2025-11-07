import hashlib
import json
import logging
import math
from functools import lru_cache
from typing import Dict, List, Optional, Sequence

import redis

try:  # pragma: no cover - optional dependency
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - optional dependency
    SentenceTransformer = None  # type: ignore

logger = logging.getLogger("ingest.tagging")


def _hash_key(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


class EmbeddingClient:
    def __init__(self, model_name: str, cache_ttl: int, redis_url: Optional[str]) -> None:
        self.cache_ttl = cache_ttl
        self.model_name = model_name
        self._memory: Dict[str, List[float]] = {}
        self._redis = redis.from_url(redis_url) if redis_url else None
        self._model = None
        self.enabled = False

        if SentenceTransformer is None:
            logger.info("SentenceTransformer not installed; embedding support disabled")
            return

        try:
            self._model = SentenceTransformer(model_name)
            self.enabled = True
            logger.info("Loaded embedding model %s", model_name)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to load embedding model %s: %s", model_name, exc)
            self.enabled = False

    def embed(self, text: str) -> Optional[List[float]]:
        if not self.enabled or not text.strip():
            return None
        key = _hash_key(text.strip().lower())
        if key in self._memory:
            return self._memory[key]
        if self._redis is not None:
            try:
                cached = self._redis.get(key)
                if cached:
                    vector = json.loads(cached)
                    self._memory[key] = vector
                    return vector
            except redis.RedisError as exc:  # pragma: no cover - network
                logger.debug("Redis read failed for embedding cache: %s", exc)
        if self._model is None:
            return None
        vector = self._model.encode([text])[0].tolist()
        self._memory[key] = vector
        if self._redis is not None:
            try:
                self._redis.setex(key, self.cache_ttl, json.dumps(vector))
            except redis.RedisError as exc:  # pragma: no cover - network
                logger.debug("Redis write failed for embedding cache: %s", exc)
        return vector

    @staticmethod
    def similarity(a: Optional[Sequence[float]], b: Optional[Sequence[float]]) -> float:
        if not a or not b:
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


@lru_cache(maxsize=1)
def get_embedding_client(model_name: str, cache_ttl: int, redis_url: Optional[str]) -> EmbeddingClient:
    return EmbeddingClient(model_name=model_name, cache_ttl=cache_ttl, redis_url=redis_url)
