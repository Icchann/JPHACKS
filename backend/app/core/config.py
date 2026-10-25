from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_OBSERVATION_CSV_PATH = (PROJECT_ROOT / "backend" / "data" / "observations.csv").resolve()
DEFAULT_DATABASE_PATH = (PROJECT_ROOT / "backend" / "data" / "sanmou-test.sqlite3").resolve()
DEFAULT_DATABASE_URL = f"sqlite+pysqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"


class Settings(BaseSettings):
    app_name: str = "sanmou-api"
    app_environment: Literal["dev", "test"] = "dev"
    frontend_origin: str = "http://localhost:3000"
    observation_csv_path: Path = DEFAULT_OBSERVATION_CSV_PATH
    database_url: str = DEFAULT_DATABASE_URL
    sanmou_test_api_token: str = ""

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
