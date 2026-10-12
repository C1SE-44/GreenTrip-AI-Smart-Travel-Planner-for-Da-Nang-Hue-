from dataclasses import dataclass


@dataclass(frozen=True)
class POI:
    id: str | int
    name: str
    category: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    address: str | None
    city: str | None