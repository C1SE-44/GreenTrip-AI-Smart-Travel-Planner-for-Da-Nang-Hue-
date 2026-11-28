from datetime import date, datetime
from uuid import uuid4

from fastapi import HTTPException

from app.db.postgres import get_connection


CRITERIA = (
    "cleanliness_waste",
    "single_use_plastic",
    "ecosystem_protection",
    "responsible_management",
)


def _timestamp(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value) if value is not None else None


def _row_dict(row):
    if row is None:
        return None
    columns = (
        "review_id", "poi_id", "trip_id", "visit_reference", "visit_verification_type",
        *CRITERIA, "comment", "review_version", "created_at", "updated_at",
    )
    result = dict(zip(columns, row))
    result["created_at"] = _timestamp(result["created_at"])
    result["updated_at"] = _timestamp(result["updated_at"])
    return result


def get_own_review(poi_id, user_id):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """SELECT review_id, poi_id, trip_id, visit_reference, visit_verification_type,
                              cleanliness_waste, single_use_plastic, ecosystem_protection,
                              responsible_management, comment, review_version, created_at, updated_at
                       FROM public.poi_environmental_reviews
                       WHERE poi_id=%s AND user_id=%s""",
                    (poi_id, str(user_id)),
                )
                return _row_dict(cursor.fetchone())
    except Exception as error:
        raise HTTPException(503, "Community reviews are not available until their schema is installed.") from error


def _same_content(existing, payload, poi_id, user_id):
    return all(
        existing.get(key) == payload.get(key)
        for key in ("trip_id", "stop_id", *CRITERIA, "comment")
    ) and existing.get("poi_id") == poi_id and existing.get("user_id") == str(user_id)


def save_review(poi_id, user_id, visit_reference, payload):
    values = (
        payload.trip_id,
        visit_reference,
        "SELF_REPORTED_VISIT",
        payload.cleanliness_waste,
        payload.single_use_plastic,
        payload.ecosystem_protection,
        payload.responsible_management,
        payload.comment,
    )
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                if payload.expected_version is None:
                    cursor.execute(
                        """INSERT INTO public.poi_environmental_reviews (
                               review_id, user_id, poi_id, trip_id, visit_reference,
                               visit_verification_type, cleanliness_waste, single_use_plastic,
                               ecosystem_protection, responsible_management, comment, review_version
                           ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                           ON CONFLICT (user_id, poi_id) DO NOTHING
                           RETURNING review_id""",
                        (str(uuid4()), str(user_id), poi_id, *values),
                    )
                    created = cursor.fetchone() is not None
                    if not created:
                        cursor.execute(
                            """SELECT review_id, poi_id, trip_id, visit_reference, visit_verification_type,
                                      cleanliness_waste, single_use_plastic, ecosystem_protection,
                                      responsible_management, comment, review_version, created_at, updated_at
                               FROM public.poi_environmental_reviews WHERE poi_id=%s AND user_id=%s""",
                            (poi_id, str(user_id)),
                        )
                        existing_row = cursor.fetchone()
                        existing = _row_dict(existing_row)
                        if not existing or not _same_content(
                            existing | {"user_id": str(user_id), "stop_id": existing["visit_reference"]},
                            payload.model_dump(), poi_id, user_id,
                        ):
                            raise HTTPException(409, "A review already exists. Load it before editing.")
                else:
                    cursor.execute(
                        """UPDATE public.poi_environmental_reviews
                           SET trip_id=%s, visit_reference=%s, visit_verification_type=%s,
                               cleanliness_waste=%s, single_use_plastic=%s, ecosystem_protection=%s,
                               responsible_management=%s, comment=%s, review_version=review_version+1,
                               updated_at=CURRENT_TIMESTAMP
                           WHERE poi_id=%s AND user_id=%s AND review_version=%s
                           RETURNING review_id""",
                        (*values, poi_id, str(user_id), payload.expected_version),
                    )
                    if cursor.fetchone() is None:
                        raise HTTPException(409, "Your review changed elsewhere. Reload it before editing.")

                cursor.execute(
                    """SELECT review_id, poi_id, trip_id, visit_reference, visit_verification_type,
                              cleanliness_waste, single_use_plastic, ecosystem_protection,
                              responsible_management, comment, review_version, created_at, updated_at
                       FROM public.poi_environmental_reviews WHERE poi_id=%s AND user_id=%s""",
                    (poi_id, str(user_id)),
                )
                result = _row_dict(cursor.fetchone())
            connection.commit()
            return result
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(503, "Could not save the community review.") from error


def get_aggregate(poi_id):
    valid_count = " + ".join(f"CASE WHEN {column} IS NULL THEN 0 ELSE 1 END" for column in CRITERIA)
    score_sum = " + ".join(f"COALESCE({column}, 0)" for column in CRITERIA)
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""SELECT COUNT(*),
                               COUNT(CASE WHEN ({valid_count}) > 0 THEN 1 END),
                               AVG(CASE WHEN ({valid_count}) > 0 THEN 1.0 * ({score_sum}) / ({valid_count}) END),
                               AVG(cleanliness_waste), COUNT(cleanliness_waste),
                               AVG(single_use_plastic), COUNT(single_use_plastic),
                               AVG(ecosystem_protection), COUNT(ecosystem_protection),
                               AVG(responsible_management), COUNT(responsible_management)
                        FROM public.poi_environmental_reviews WHERE poi_id=%s""",
                    (poi_id,),
                )
                row = cursor.fetchone()
    except Exception as error:
        raise HTTPException(503, "Community ratings are not available until their schema is installed.") from error

    feedback_count, review_count = int(row[0] or 0), int(row[1] or 0)
    averages = {key: round(float(row[index]), 2) if row[index] is not None else None
                for key, index in zip(CRITERIA, (3, 5, 7, 9))}
    counts = {key: int(row[index] or 0) for key, index in zip(CRITERIA, (4, 6, 8, 10))}
    if review_count == 0:
        sample_note = "Ch\u01b0a c\u00f3 \u0111\u00e1nh gi\u00e1 m\u00f4i tr\u01b0\u1eddng t\u1eeb c\u1ed9ng \u0111\u1ed3ng GreenTrip."
    elif review_count < 3:
        sample_note = "M\u1eabu c\u00f2n \u00edt; \u0111i\u1ec3m tham kh\u1ea3o, ch\u01b0a \u0111\u01b0\u1ee3c x\u00e1c minh."
    else:
        sample_note = "T\u1ed5ng h\u1ee3p t\u1eeb ng\u01b0\u1eddi d\u00f9ng GreenTrip; kh\u00f4ng ph\u1ea3i ch\u1ee9ng nh\u1eadn m\u00f4i tr\u01b0\u1eddng."
    return {
        "poi_id": poi_id,
        "source": "GREENTRIP_COMMUNITY",
        "score_scale": "1-5",
        "community_green_score": round(float(row[2]), 2) if row[2] is not None else None,
        "review_count": review_count,
        "feedback_count": feedback_count,
        "criterion_average_scores": averages,
        "criterion_review_counts": counts,
        "sample_note": sample_note,
    }
