"""Téléchargement HTTP robuste partagé par les modules d'acquisition.

Idempotent (saute un fichier déjà présent), **écriture atomique** (`.tmp` puis rename :
un téléchargement interrompu ne laisse jamais de fichier tronqué pris pour complet à la
reprise) et **retry exponentiel** sur erreurs transitoires (429, 5xx, réseau).
"""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from pathlib import Path


def download(url: str, dest: Path, *, force: bool = False, max_retries: int = 3) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ déjà là : {dest.name}")
        return dest
    print(f"⤓ {url}")
    tmp = dest.parent / f"{dest.name}.tmp"
    for attempt in range(1, max_retries + 1):
        tmp.unlink(missing_ok=True)
        try:
            urllib.request.urlretrieve(url, tmp)
            tmp.rename(dest)  # atomique : jamais de demi-fichier sous `dest`
            print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")
            return dest
        except urllib.error.HTTPError as e:
            tmp.unlink(missing_ok=True)
            transient = e.code == 429 or 500 <= e.code < 600
            if transient and attempt < max_retries:
                time.sleep(2 ** attempt)  # backoff exponentiel
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError):
            tmp.unlink(missing_ok=True)
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
    return dest
