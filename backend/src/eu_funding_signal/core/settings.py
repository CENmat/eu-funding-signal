from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_mode: str = "demo"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    database_url: str | None = None
    demo_dataset_path: str = "frontend/lib/demo-dataset.json"
    cache_dir: str = "data/cache"
    upload_dir: str = "data/uploads"
    embedding_backend: str = "hash"
    enable_scheduler: bool = False
    cors_origins: list[str] = ["*"]

    @property
    def base_dir(self) -> Path:
        return Path(__file__).resolve().parents[4]

    @property
    def resolved_demo_dataset_path(self) -> Path:
        path = Path(self.demo_dataset_path)
        if path.is_absolute():
            return path
        return (self.base_dir / path).resolve()

    @property
    def resolved_cache_dir(self) -> Path:
        path = Path(self.cache_dir)
        return path if path.is_absolute() else (self.base_dir / path).resolve()

    @property
    def resolved_upload_dir(self) -> Path:
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (self.base_dir / path).resolve()


settings = Settings()
