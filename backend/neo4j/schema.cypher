// GreenTrip AI Knowledge Graph schema for Neo4j 5 / AuraDB.
// This file contains schema objects only. It does not import data.

CREATE CONSTRAINT poi_id_unique IF NOT EXISTS
FOR (p:POI)
REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT category_key_unique IF NOT EXISTS
FOR (c:Category)
REQUIRE c.key IS UNIQUE;

CREATE CONSTRAINT activity_key_unique IF NOT EXISTS
FOR (a:Activity)
REQUIRE a.key IS UNIQUE;

CREATE CONSTRAINT location_key_unique IF NOT EXISTS
FOR (l:Location)
REQUIRE l.key IS UNIQUE;

// POI names are not unique, but this index supports optional name lookup.
CREATE INDEX poi_name_index IF NOT EXISTS
FOR (p:POI)
ON (p.name);
