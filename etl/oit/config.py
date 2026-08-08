"""Carga de la configuración declarativa del ETL."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


def _load(nombre: str) -> dict[str, Any]:
    ruta = CONFIG_DIR / nombre
    if not ruta.exists():
        raise FileNotFoundError(f"Falta el archivo de configuración: {ruta}")
    with ruta.open(encoding="utf-8") as fh:
        return json.load(fh)


@dataclass(frozen=True)
class Categoria:
    nombre: str
    etiqueta: str
    corta: str
    minimo_requerido: int
    orden: int
    grupo: str


@dataclass
class Config:
    """Configuración consolidada, tal como la consume el resto del ETL."""

    categorias: list[Categoria]
    alias_categoria: dict[str, str]
    calendario: dict[str, Any]
    parametros: dict[str, Any]
    _por_nombre: dict[str, Categoria] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._por_nombre = {c.nombre: c for c in self.categorias}

    # -- accesores ---------------------------------------------------------
    def categoria(self, nombre: str) -> Categoria | None:
        return self._por_nombre.get(nombre)

    def minimo_requerido(self, nombre: str) -> int:
        cat = self._por_nombre.get(nombre)
        return cat.minimo_requerido if cat else 1

    @property
    def min_categorias_general(self) -> int:
        return int(self.parametros["reglas"]["min_categorias_general"])

    @property
    def estadia_defecto(self) -> float:
        return float(self.parametros["reglas"]["estadia_promedio_defecto"])

    @property
    def anio(self) -> int:
        return int(self.calendario["anio"])


def cargar_config() -> Config:
    cats_raw = _load("categorias.json")
    categorias = [Categoria(**{k: v for k, v in c.items()}) for c in cats_raw["categorias"]]
    alias = {k.upper().strip(): v for k, v in cats_raw["alias"].items()}
    return Config(
        categorias=categorias,
        alias_categoria=alias,
        calendario=_load("calendario.json"),
        parametros=_load("parametros.json"),
    )
