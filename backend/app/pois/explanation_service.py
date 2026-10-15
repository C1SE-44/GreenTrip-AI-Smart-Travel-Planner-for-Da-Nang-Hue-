import logging
from uuid import UUID

from app.pois import explanation_repository
from app.pois.schemas import (
    ExplanationFact,
    ExplanationPOI,
    POIExplanationFactsResponse,
)


logger = logging.getLogger(__name__)


class ExplanationServiceUnavailable(Exception):
    """Raised when Knowledge Graph explanation facts cannot be retrieved."""


def get_poi_explanation_facts(
    poi_id: UUID,
) -> POIExplanationFactsResponse | None:
    try:
        payload = explanation_repository.fetch_poi_explanation_facts(str(poi_id))
        if payload is None:
            return None

        poi = ExplanationPOI.model_validate(payload["poi"])
        facts: list[ExplanationFact] = []
        seen: set[tuple[str, str, str, str | None]] = set()
        for raw_fact in payload["facts"]:
            fact = ExplanationFact.model_validate(raw_fact)
            signature = (
                fact.relationship,
                fact.target_type,
                fact.target_key,
                fact.target_name,
            )
            if signature not in seen:
                seen.add(signature)
                facts.append(fact)

        return POIExplanationFactsResponse(poi=poi, facts=facts)
    except Exception as exc:
        logger.warning("Knowledge Graph explanation service is unavailable.")
        raise ExplanationServiceUnavailable from exc
