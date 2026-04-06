from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from eu_funding_signal.core.settings import settings


def create_scheduler(refresh_callable) -> BackgroundScheduler | None:
    if not settings.enable_scheduler:
        return None
    scheduler = BackgroundScheduler(timezone="Europe/Berlin")
    scheduler.add_job(refresh_callable, "interval", hours=24, id="refresh-all")
    scheduler.start()
    return scheduler

