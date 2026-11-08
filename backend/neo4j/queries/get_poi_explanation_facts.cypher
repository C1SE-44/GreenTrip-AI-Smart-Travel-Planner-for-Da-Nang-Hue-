MATCH (p:POI {id: $poi_id})
OPTIONAL MATCH (p)-[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]->(target)
WITH p, r, target
ORDER BY type(r), target.key, target.name
WITH p, collect(DISTINCT CASE
    WHEN r IS NULL THEN null
    ELSE {
        relationship: type(r),
        target_type: CASE type(r)
            WHEN 'IN_CATEGORY' THEN 'Category'
            WHEN 'OFFERS_ACTIVITY' THEN 'Activity'
            WHEN 'LOCATED_IN' THEN 'Location'
        END,
        target_key: target.key,
        target_name: target.name
    }
END) AS raw_facts
RETURN {
    id: p.id,
    name: p.name,
    is_local_business: p.is_local_business,
    local_business_type: p.local_business_type,
    source: p.source
} AS poi,
[fact IN raw_facts WHERE fact IS NOT NULL] AS facts;
