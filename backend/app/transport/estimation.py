"""Source-gated transport fare and emissions calculations.

No production rates are bundled here. Callers must supply a validated provider
record; missing or out-of-scope data returns an explicit unknown estimate.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Literal, Protocol
from urllib.parse import urlparse

EstimateStatus = Literal["ESTIMATED", "PARTIAL", "UNAVAILABLE"]


@dataclass(frozen=True)
class TravelerCounts:
    adults: int | None = None
    children: int | None = None
    infants: int | None = None
    pets: int | None = None

    @property
    def human_count(self) -> int | None:
        values = (self.adults, self.children, self.infants)
        if any(value is None for value in values):
            return None
        total = sum(value for value in values if value is not None)
        return total if total > 0 else None


@dataclass(frozen=True)
class FareRate:
    mode: str
    currency: str
    unit: Literal[
        "PER_TRAVELER_TRIP",
        "PER_VEHICLE_TRIP",
        "PER_VEHICLE_KM",
        "PER_VEHICLE_MINUTE",
    ]
    source_name: str
    source_url: str
    region: str
    publication: str
    valid_from: date | None = None
    valid_until: date | None = None
    amount: float | None = None
    traveler_rates: dict[str, float] = field(default_factory=dict)
    calculation_scope: str = ""
    assumptions: tuple[str, ...] = ()


@dataclass(frozen=True)
class EmissionFactor:
    mode: str
    value: float
    unit: Literal["KG_CO2E_PER_VEHICLE_KM", "KG_CO2E_PER_PASSENGER_KM"]
    source_name: str
    source_url: str
    region: str
    publication: str
    valid_from: date | None
    valid_until: date | None
    calculation_boundary: str
    assumptions: tuple[str, ...] = ()


@dataclass(frozen=True)
class Estimate:
    status: EstimateStatus
    amount: float | None
    unit: str | None
    source_name: str | None
    source_url: str | None
    region: str | None
    calculation_boundary: str | None = None
    warnings: tuple[str, ...] = ()
    currency: str | None = None


class FareRateProvider(Protocol):
    def get_rate(self, mode: str, region: str, travel_date: date | None) -> FareRate | None: ...


class EmissionFactorProvider(Protocol):
    def get_factor(self, mode: str, region: str, travel_date: date | None) -> EmissionFactor | None: ...


class NoFareRateProvider:
    """Safe default until a licensed or verified fare source is configured."""

    def get_rate(self, mode: str, region: str, travel_date: date | None) -> None:
        return None


class NoEmissionFactorProvider:
    """Safe default; test fixtures must be injected and are never production defaults."""

    def get_factor(self, mode: str, region: str, travel_date: date | None) -> None:
        return None


def _source_error(source_name: str, source_url: str, region: str) -> str | None:
    parsed = urlparse(source_url)
    if not source_name.strip() or parsed.scheme != "https" or not parsed.netloc:
        return "Thiếu nguồn công khai có thể xác minh cho dữ liệu ước tính."
    if region.upper() not in {"VN", "GLOBAL"}:
        return "Nguồn dữ liệu không áp dụng cho Việt Nam hoặc phạm vi toàn cầu."
    return None


def _validity_error(
    valid_from: date | None, valid_until: date | None, travel_date: date | None
) -> str | None:
    if valid_from and valid_until and valid_until < valid_from:
        return "Khoảng hiệu lực của dữ liệu không hợp lệ."
    if travel_date is None and (valid_from or valid_until):
        return "Chưa có ngày đi để kiểm tra thời hạn dữ liệu."
    if travel_date and valid_from and travel_date < valid_from:
        return "Dữ liệu chưa có hiệu lực vào ngày đi."
    if travel_date and valid_until and travel_date > valid_until:
        return "Dữ liệu đã hết hiệu lực vào ngày đi."
    return None


def estimate_fare(
    *,
    mode: str,
    route_status: str,
    distance_meters: float | None,
    duration_seconds: float | None,
    travelers: TravelerCounts,
    vehicle_count: int | None,
    travel_date: date | None,
    rate: FareRate | None,
) -> Estimate:
    """Calculate fare only when route, rate source, unit and required counts are known."""
    if rate is None:
        return Estimate("UNAVAILABLE", None, None, None, None, None, warnings=("Chưa có nguồn giá vé/giá xe được xác minh.",))
    if rate.mode != mode:
        return Estimate("UNAVAILABLE", None, None, rate.source_name, rate.source_url, rate.region, warnings=("Nguồn giá không áp dụng cho phương tiện này.",))
    source_error = _source_error(rate.source_name, rate.source_url, rate.region)
    if source_error:
        return Estimate("UNAVAILABLE", None, None, rate.source_name or None, rate.source_url or None, rate.region or None, warnings=(source_error,))
    if not rate.publication.strip() or rate.currency.upper() not in {"VND", "USD", "EUR"}:
        return Estimate("UNAVAILABLE", None, None, rate.source_name, rate.source_url, rate.region, warnings=("Thiếu phiên bản nguồn hoặc tiền tệ được hỗ trợ.",))
    validity_error = _validity_error(rate.valid_from, rate.valid_until, travel_date)
    if validity_error:
        return Estimate("UNAVAILABLE", None, None, rate.source_name, rate.source_url, rate.region, warnings=(validity_error,))
    if route_status != "ROUTED":
        return Estimate("UNAVAILABLE", None, rate.unit, rate.source_name, rate.source_url, rate.region, warnings=("Chưa có quãng đường/thời lượng tuyến được định tuyến để tính giá.",))

    km = distance_meters / 1000 if distance_meters is not None and math.isfinite(distance_meters) and distance_meters >= 0 else None
    minutes = duration_seconds / 60 if duration_seconds is not None and math.isfinite(duration_seconds) and duration_seconds >= 0 else None
    amount: float | None = None
    warnings = list(rate.assumptions)
    status: EstimateStatus = "ESTIMATED"

    if rate.unit == "PER_TRAVELER_TRIP":
        counts = {"adult": travelers.adults, "child": travelers.children, "infant": travelers.infants}
        if any(count is None for count in counts.values()):
            return Estimate("UNAVAILABLE", None, "currency/traveler/trip", rate.source_name, rate.source_url, rate.region, warnings=("Cần số người lớn, trẻ em và trẻ sơ sinh để áp dụng đúng biểu giá.",))
        known_subtotal = 0.0
        missing_classes: list[str] = []
        for category, count in counts.items():
            if not count:
                continue
            unit_price = rate.traveler_rates.get(category)
            if unit_price is None or not math.isfinite(unit_price) or unit_price < 0:
                missing_classes.append(category)
            else:
                known_subtotal += unit_price * count
        if missing_classes:
            status = "PARTIAL"
            warnings.append("Thiếu biểu giá cho: " + ", ".join(missing_classes) + "; số tiền chỉ là phần đã biết.")
        amount = known_subtotal
    elif rate.unit == "PER_VEHICLE_TRIP":
        if rate.amount is None or not math.isfinite(rate.amount) or rate.amount < 0 or not vehicle_count or vehicle_count < 1:
            return Estimate("UNAVAILABLE", None, "currency/vehicle/trip", rate.source_name, rate.source_url, rate.region, warnings=("Cần giá/chuyến và số xe đã biết; không tự suy ra số xe từ sức chứa giả định.",))
        amount = rate.amount * vehicle_count
    elif rate.unit == "PER_VEHICLE_KM":
        if rate.amount is None or not math.isfinite(rate.amount) or rate.amount < 0 or km is None or not vehicle_count or vehicle_count < 1:
            return Estimate("UNAVAILABLE", None, "currency/vehicle/km", rate.source_name, rate.source_url, rate.region, warnings=("Cần đơn giá/km, quãng đường và số xe đã biết.",))
        amount = rate.amount * km * vehicle_count
    else:
        if rate.amount is None or not math.isfinite(rate.amount) or rate.amount < 0 or minutes is None or not vehicle_count or vehicle_count < 1:
            return Estimate("UNAVAILABLE", None, "currency/vehicle/minute", rate.source_name, rate.source_url, rate.region, warnings=("Cần đơn giá/phút, thời lượng và số xe đã biết.",))
        amount = rate.amount * minutes * vehicle_count

    if travelers.pets is None:
        status = "PARTIAL"
        warnings.append("Chưa biết số thú cưng; không xác nhận được chính sách hoặc phụ phí mang thú cưng.")
    elif travelers.pets > 0:
        status = "PARTIAL"
        warnings.append("Chính sách/phụ phí thú cưng chưa có nguồn; không bao gồm trong số tiền.")
    return Estimate(
        status,
        round(amount, 2) if amount is not None else None,
        rate.unit,
        rate.source_name,
        rate.source_url,
        rate.region,
        rate.calculation_scope,
        tuple(warnings),
        rate.currency,
    )


def estimate_emissions(
    *,
    mode: str,
    route_status: str,
    distance_meters: float | None,
    travelers: TravelerCounts,
    vehicle_count: int | None,
    travel_date: date | None,
    factor: EmissionFactor | None,
) -> Estimate:
    """Estimate leg CO₂e using a sourced factor with an explicit activity unit."""
    if factor is None:
        return Estimate("UNAVAILABLE", None, None, None, None, None, warnings=("Chưa có hệ số CO₂e có nguồn áp dụng cho phương tiện này.",))
    if factor.mode != mode:
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Hệ số không áp dụng cho phương tiện này.",))
    source_error = _source_error(factor.source_name, factor.source_url, factor.region)
    if source_error:
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name or None, factor.source_url or None, factor.region or None, warnings=(source_error,))
    if not factor.publication.strip():
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Thiếu ấn bản/phiên bản nguồn của hệ số.",))
    validity_error = _validity_error(factor.valid_from, factor.valid_until, travel_date)
    if validity_error:
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=(validity_error,))
    if route_status != "ROUTED":
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Không tính CO₂e trên khoảng cách heuristic hoặc chưa xác minh.",))
    if not math.isfinite(factor.value) or factor.value < 0:
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Giá trị hệ số không hợp lệ.",))
    if not factor.calculation_boundary.strip():
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Thiếu phạm vi tính của hệ số CO₂e.",))
    if distance_meters is None or not math.isfinite(distance_meters) or distance_meters < 0:
        return Estimate("UNAVAILABLE", None, factor.unit, factor.source_name, factor.source_url, factor.region, warnings=("Thiếu quãng đường hợp lệ cho chặng.",))

    km = distance_meters / 1000
    if factor.unit == "KG_CO2E_PER_VEHICLE_KM":
        if not vehicle_count or vehicle_count < 1:
            return Estimate("UNAVAILABLE", None, "kg CO₂e/vehicle-km", factor.source_name, factor.source_url, factor.region, factor.calculation_boundary, ("Cần số phương tiện đã biết; không tự suy ra số xe.",))
        total = factor.value * km * vehicle_count
    else:
        human_count = travelers.human_count
        if human_count is None:
            return Estimate("UNAVAILABLE", None, "kg CO₂e/passenger-km", factor.source_name, factor.source_url, factor.region, factor.calculation_boundary, ("Cần số người lớn, trẻ em và trẻ sơ sinh; thú cưng không được tính là hành khách.",))
        total = factor.value * km * human_count
    return Estimate(
        "ESTIMATED",
        round(total, 4),
        "kg CO₂e (nhóm)",
        factor.source_name,
        factor.source_url,
        factor.region,
        factor.calculation_boundary,
        tuple(factor.assumptions),
    )
