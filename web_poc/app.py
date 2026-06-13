"""Backend produit (FastAPI, ADR 0007) — sert l'API de données de l'Atlas + le front.

Les fonctions de service du POC (web_poc/server.py) sont importées TELLES QUELLES :
elles sont agnostiques du framework — signature `(params: dict[str, list[str]]) -> dict`,
lecture DuckDB + parquet (ADR 0002) — et l'import ne démarre PAS le serveur stdlib grâce
au garde `if __name__ == "__main__"`. Ce module ne fait que les exposer en routes HTTP et
servir les fichiers statiques. Aucune réécriture de la couche données éprouvée.

SQLite (comptes / quotas / sessions, ADR 0007) viendra plus tard ; ici, uniquement la
donnée immobilière pour la page « Atlas du marché ».

Lancer :  uv run uvicorn web_poc.app:app --reload --port 8000
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import parse_qs

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from web_poc import server as svc

ROOT = Path(__file__).resolve().parent  # web_poc/

# Route -> fonction de service. Strictement les mêmes que le handler stdlib du POC
# (server.py do_GET), pour une parité de comportement sans duplication de logique.
SERVICES = {
    "departements": lambda _params: {"departements": svc.available_departements()},
    "estimate": svc.comparable_rows,
    "market": svc.market_rows,
    "parcelles": svc.parcelles_rows,
    "batiments": svc.batiments_rows,
    "parcelle-adresses": svc.parcelle_adresses_rows,
    "dpe": svc.dpe_rows,
    "codepostal": svc.postcode_rows,
    "commune": svc.commune_rows,
    "lieudit": svc.lieudit_rows,
    "scope-communes": svc.scope_communes_rows,
}

app = FastAPI(title="Primmobilier — API Atlas")


@app.get("/api/{name}")
def api(name: str, request: Request) -> JSONResponse:
    """Dispatch /api/* vers la fonction de service. On reconstruit `params` avec
    parse_qs pour coller EXACTEMENT à la forme attendue (dict[str, list[str]])."""
    fn = SERVICES.get(name)
    if fn is None:
        return JSONResponse({"error": f"route inconnue : /api/{name}"}, status_code=404)
    params = parse_qs(request.url.query)
    try:
        return JSONResponse(fn(params))
    except Exception as exc:  # parité avec le POC : 500 + message lisible
        return JSONResponse({"error": f"Erreur serveur: {exc}"}, status_code=500)


@app.get("/")
def home() -> RedirectResponse:
    # Page Atlas (maquette 2028 en cours de câblage). Provisoire : le rangement des
    # fichiers (static/ vs maquettes/) sera fait à la refonte ; on sert la maquette ici.
    return RedirectResponse(url="/maquettes/atlas.html")


# Statique : /static et /maquettes montés séparément (les .py de web_poc ne sont pas
# exposés). Les chemins relatifs de la maquette (../static/app.css) résolvent ainsi.
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")
app.mount("/maquettes", StaticFiles(directory=str(ROOT / "maquettes")), name="maquettes")
