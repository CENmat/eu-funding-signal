from __future__ import annotations

from eu_funding_signal.core.demo_loader import load_demo_dataset


class DemoRepository:
    def get_dataset(self) -> dict:
        return load_demo_dataset()

