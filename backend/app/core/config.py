from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    app_name: str = "sanmou-api"
    app_environment: Literal["dev", "test"] = "dev"
    frontend_origin: str = "http://localhost:3000"
    observation_csv_path: Path = Path("backend/data/observations.csv")
    database_url: str = ""
    sanmou_test_api_token: str = ""

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
