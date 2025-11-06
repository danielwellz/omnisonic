from functools import lru_cache
from pydantic import BaseSettings, AnyHttpUrl

class Settings(BaseSettings):
    graph_api_base: AnyHttpUrl = "http://localhost:4000"
    duckdb_path: str = "data/insight.duckdb"

    class Config:
        env_prefix = "INGEST_"
        env_file = ".env"
        case_sensitive = False

@lru_cache
def get_settings() -> Settings:
    return Settings()
