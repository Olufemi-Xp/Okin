import os
from functools import lru_cache
from pathlib import Path
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine backend directory and project root directory
APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

# Candidate .env locations (later entries override earlier ones in pydantic-settings)
ENV_FILES = [
    str(ROOT_DIR / ".env"),
    str(BACKEND_DIR / ".env"),
]


class Settings(BaseSettings):
    GOOGLE_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    TAVILY_API_KEY: Optional[str] = None
    IMAGE_GEN_API_KEY: Optional[str] = None
    IMAGE_GEN_PROVIDER: str = "auto"
    OPENAI_API_KEY: Optional[str] = None
    FAL_KEY: Optional[str] = None
    APP_ACCESS_PIN: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"
    DATA_DIR: str = "./data"

    model_config = SettingsConfigDict(
        env_file=tuple(ENV_FILES),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("GOOGLE_API_KEY", "GROQ_API_KEY", "IMAGE_GEN_API_KEY", "OPENAI_API_KEY", "FAL_KEY", mode="before")
    @classmethod
    def clean_api_keys(cls, v: Optional[str]) -> str:
        if not v:
            return ""
        # Strip surrounding quotes and whitespace
        return v.strip().strip("'\"")


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    if not os.path.isabs(settings.DATA_DIR):
        settings.DATA_DIR = str((BACKEND_DIR / settings.DATA_DIR).resolve())
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    return settings


def refresh_settings() -> Settings:
    """Clear lru_cache and return fresh Settings instance."""
    get_settings.cache_clear()
    return get_settings()
