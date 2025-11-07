from functools import lru_cache
from typing import Optional

from pydantic import BaseSettings, AnyHttpUrl, AnyUrl

class Settings(BaseSettings):
    graph_api_base: AnyHttpUrl = "http://localhost:4000"
    duckdb_path: str = "data/insight.duckdb"
    redis_url: Optional[AnyUrl] = None
    tagging_fuzzy_threshold: int = 70
    tagging_embedding_threshold: float = 0.7
    tagging_use_embeddings: bool = False
    tagging_embeddings_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    tagging_embedding_cache_ttl: int = 60 * 60 * 24 * 7  # 7 days

    class Config:
        env_prefix = "INGEST_"
        env_file = ".env"
        case_sensitive = False

@lru_cache
def get_settings() -> Settings:
    return Settings()
