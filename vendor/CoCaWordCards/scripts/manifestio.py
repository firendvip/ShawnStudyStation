"""Tiny helper to load the manifest, shared by the download / report stages."""

from __future__ import annotations

import json

import config


def load_manifest() -> dict | None:
    if not config.MANIFEST_JSON.exists():
        return None
    return json.loads(config.MANIFEST_JSON.read_text(encoding="utf-8"))
