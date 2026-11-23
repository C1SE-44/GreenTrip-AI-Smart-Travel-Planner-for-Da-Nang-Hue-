MATCH (p:POI)
WHERE COALESCE(p.is_local_business, false) = true
  AND (
    p.local_business_type IN ['craft_workshop', 'eco_lodge', 'homestay', 'traditional_market']
    OR EXISTS {
      (p)-[:OFFERS_ACTIVITY]->(a:Activity)
      WHERE a.key IN ['cultural_sightseeing', 'heritage_tour', 'food_experience', 'nature_exploration']
    }
  )
RETURN p.id AS id
LIMIT 1000;
