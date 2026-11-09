# Feature Specification: In-Planner Copilot POI Advice & Feasibility

## Capability: `copilot-poi-advice`
**Scope**: PB14 - In-Planner AI Travel Copilot  
**Author**: Nguyen (PB14 Owner)  
**Standard**: Behaviour-First Specification (specs-extractor canonical format)

---

### Requirement: Intelligent POI Advice & Feasibility Evaluation
The system MUST detect when a traveler asks an evaluation question about a specific Point of Interest (e.g., "tôi có nên đi bán đảo sơn trà không", "có nên ghé cầu rồng không", "chùa nam sơn có gì hay") and return a structured, expert travel assessment instead of a generic greeting.

#### Scenario: Traveler asks if they should visit Son Tra Peninsula
- **WHEN** the traveler sends chat message `"tôi có nên đi bán đảo sơn trà không"` or `"tôi có nên đi bán đảo sơn trà"`
- **THEN** `detect_copilot_intent` classifies the query as `intent = "poi_advice"`
- **AND** the system identifies the target POI as `"Bán Đảo Sơn Trà"` (matching `public.pois.name` or aliases)
- **AND** the response contains a definitive recommendation header ("Có — Bán đảo Sơn Trà rất đáng đi...")
- **AND** the response details 3 core evaluation dimensions:
  1. `Vì sao nên đi (Điểm mạnh)`: Toàn cảnh biển núi ngoạn mục, thiên nhiên hoang sơ, cách trung tâm chỉ 15–20 phút, phù hợp nửa ngày.
  2. `Khi nào không nên / Cân nhắc kỹ`: Gia đình có người già/trẻ nhỏ dễ say xe khi leo dốc cua; quy định cấm xe tay ga lên đỉnh Bàn Cờ/trạm Radar; thời tiết sương mù/mưa trơn trượt.
  3. `Kinh nghiệm đi an toàn & chuẩn xanh`: Đi sáng sớm (06:30 - 09:30) hoặc chiều mát (15:30 - 17:30); ưu tiên thuê xe ô tô đưa đón hoặc xe số có kinh nghiệm lái; không cho thú hoang/voọc ăn.
- **AND** the response returns `suggested_pois` containing the canonical `Bán Đảo Sơn Trà` POI card with `name`, `rating`, `eco_score`, `image_url`, `gallery_urls`, and estimated duration
- **AND** the response supplies contextual follow-up quick prompts: `["Lên lịch trình 3 tiếng Sơn Trà", "Nên đi xe số hay ô tô?", "Điểm ăn uống gần Sơn Trà"]`

#### Scenario: Traveler asks about another landmark in Da Nang or Hue
- **WHEN** the traveler asks about a recognized landmark such as `"Cầu Rồng"`, `"Chùa Nam Sơn"`, `"Ngũ Hành Sơn"`, or `"Đại Nội Huế"`
- **THEN** the system queries database metadata, generates localized pros/cons, best visiting hours, safety/eco tips, and returns the target POI card.

#### Scenario: Traveler asks an unresolvable or ambiguous place question
- **WHEN** the query asks advice about a place not found in the Da Nang & Hue POI registry
- **THEN** the system gracefully falls back to guiding the user to Da Nang - Hue destinations, offering the most popular eco-attractions as alternatives without throwing 500 errors.

---

### Requirement: High-Fidelity POI Gallery Integrity
The system MUST ensure that whenever a POI card or detail view is opened in the Planner, every slot in the 5-photo gallery displays a unique, high-resolution authentic photo without identical duplicates.

#### Scenario: Detail modal opened from Planner Recommendation or Copilot Card
- **WHEN** a traveler clicks on `Bán Đảo Sơn Trà`, `Cầu Rồng`, or `Chùa Nam Sơn`
- **THEN** the modal gallery displays 5 distinct perspectives of the place
- **AND** `TripOverviewView.tsx` preserves `gallery` from the recommendation response and `allPois`
- **AND** no placeholder cycling repeats the hero image into 4 identical slots when gallery images are available.
