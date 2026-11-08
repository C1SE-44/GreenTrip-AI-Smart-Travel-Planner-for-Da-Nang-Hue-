// Manual development sample only. This file is never run automatically.
// The sample:* identifiers cannot be confused with PostgreSQL POI UUIDs.

MERGE (heritage:Category {key: 'historical_culture'})
SET heritage.name = 'Di tích lịch sử và văn hóa'

MERGE (nature:Category {key: 'nature_landscape'})
SET nature.name = 'Cảnh quan và thiên nhiên'

MERGE (culture:Activity {key: 'cultural_sightseeing'})
SET culture.name = 'Cultural sightseeing'

MERGE (exploration:Activity {key: 'nature_exploration'})
SET exploration.name = 'Nature exploration'

MERGE (photography:Activity {key: 'photography'})
SET photography.name = 'Photography'

MERGE (hue:Location {key: 'HUE'})
SET hue.name = 'Hue', hue.level = 'city'

MERGE (danang:Location {key: 'DANANG'})
SET danang.name = 'Da Nang', danang.level = 'city'

MERGE (imperial:POI {id: 'sample:imperial-city'})
SET imperial.name = 'Sample Imperial City',
    imperial.is_local_business = false,
    imperial.source = 'sample'

MERGE (reserve:POI {id: 'sample:nature-reserve'})
SET reserve.name = 'Sample Nature Reserve',
    reserve.is_local_business = false,
    reserve.source = 'sample'

MERGE (museum:POI {id: 'sample:heritage-museum'})
SET museum.name = 'Sample Heritage Museum',
    museum.is_local_business = false,
    museum.source = 'sample'

MERGE (imperial)-[:IN_CATEGORY]->(heritage)
MERGE (imperial)-[:OFFERS_ACTIVITY]->(culture)
MERGE (imperial)-[:OFFERS_ACTIVITY]->(photography)
MERGE (imperial)-[:LOCATED_IN]->(hue)
MERGE (reserve)-[:IN_CATEGORY]->(nature)
MERGE (reserve)-[:OFFERS_ACTIVITY]->(exploration)
MERGE (reserve)-[:LOCATED_IN]->(danang)
MERGE (museum)-[:IN_CATEGORY]->(heritage)
MERGE (museum)-[:OFFERS_ACTIVITY]->(culture)
MERGE (museum)-[:LOCATED_IN]->(hue);
