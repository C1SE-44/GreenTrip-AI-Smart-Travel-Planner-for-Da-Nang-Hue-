import xml.etree.ElementTree as ET
import os

# ==============================================================================
# DRAW.IO CORE ENGINE (NATIVE DRAW.IO SHAPES - NO DOUBLE ESCAPING)
# ==============================================================================

def build_mxfile(diagrams):
    mxfile = ET.Element("mxfile", host="Electron", agent="Antigravity-IDE-Drawio", version="21.6.8", type="device")
    for page_id, page_name, graph_model in diagrams:
        diag = ET.SubElement(mxfile, "diagram", id=page_id, name=page_name)
        diag.append(graph_model)
    return mxfile

def save_diagram_file(filepath, page_id, page_name, graph_model):
    mxfile = build_mxfile([(page_id, page_name, graph_model)])
    tree = ET.ElementTree(mxfile)
    ET.indent(tree, space="  ")
    tree.write(filepath, encoding="utf-8", xml_declaration=True)
    print(f"Saved: {filepath}")

def create_graph_model(page_w=2000, page_h=1300):
    gm = ET.Element("mxGraphModel", dx="1422", dy="794", grid="1", gridSize="10", guides="1", tooltips="1",
                    connect="1", arrows="1", fold="1", page="1", pageWidth=str(page_w), pageHeight=str(page_h),
                    math="0", shadow="0")
    root = ET.SubElement(gm, "root")
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    return gm, root

# ==============================================================================
# NATIVE DRAW.IO DATABASE TABLE BUILDER (SWIMLANE + ROWS)
# ==============================================================================

def make_table_cell(parent, cell_id, title, columns, x, y, w, h=None, header_bg="#1565C0", header_fg="#FFFFFF", stroke="#0D47A1"):
    """
    Constructs a 100% native Draw.io Database Table using Draw.io's official
    tableLayout, tableRow, and partialRectangle primitives.
    This guarantees 0 HTML rendering artifacts, 0 double-escaping bugs,
    and allows direct text editing inside draw.io web (app.diagrams.net).
    """
    row_h = 24
    header_h = 30
    total_h = header_h + len(columns) * row_h
    
    # 1. Main Table Container
    tbl_style = (
        f"shape=table;startSize={header_h};container=1;collapsible=0;childLayout=tableLayout;"
        f"fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;fontSize=13;"
        f"fillColor={header_bg};strokeColor={stroke};fontColor={header_fg};"
        f"rounded=1;arcSize=8;shadow=1;strokeWidth=2;html=1;"
    )
    tbl = ET.SubElement(parent, "mxCell", id=cell_id, value=f"<b>{title}</b>", style=tbl_style, vertex="1", parent="1")
    ET.SubElement(tbl, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(total_h), **{"as": "geometry"})
    
    col1_w = int(w * 0.62)
    col2_w = w - col1_w
    
    for i, col in enumerate(columns):
        ktype, name, dtype = col
        row_id = f"{cell_id}_r{i}"
        row_y = header_h + i * row_h
        bg = "#FFFFFF" if i % 2 == 0 else "#F8F9FA"
        
        row_style = (
            f"shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;"
            f"top=0;left=0;bottom=1;right=0;collapsible=0;dropTarget=0;fillColor={bg};"
            f"points=[[0,0.5],[1,0.5]];portConstraint=eastwest;strokeColor=#ECEFF1;"
        )
        row = ET.SubElement(parent, "mxCell", id=row_id, value="", style=row_style, vertex="1", parent=cell_id)
        ET.SubElement(row, "mxGeometry", y=str(row_y), width=str(w), height=str(row_h), **{"as": "geometry"})
        
        # Col 1: Key badge + Column Name
        prefix = ""
        if "PK" in ktype and "FK" in ktype:
            prefix = "<font color='#B71C1C'><b>[PK, FK]</b></font> "
        elif "PK" in ktype:
            prefix = "<font color='#C62828'><b>[PK]</b></font> "
        elif "FK" in ktype:
            prefix = "<font color='#1565C0'><b>[FK]</b></font> "
        elif "UK" in ktype:
            prefix = "<font color='#2E7D32'><b>[UK]</b></font> "
        
        bold_name = f"<b>{name}</b>" if ktype else name
        val_left = f"{prefix}{bold_name}"
        
        c1_style = (
            "shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;"
            "align=left;spacingLeft=8;fontStyle=0;overflow=hidden;fontSize=11;fontColor=#263238;html=1;"
        )
        c1 = ET.SubElement(parent, "mxCell", id=f"{row_id}_c1", value=val_left, style=c1_style, vertex="1", parent=row_id)
        ET.SubElement(c1, "mxGeometry", width=str(col1_w), height=str(row_h), **{"as": "geometry"})
        
        # Col 2: Datatype
        c2_style = (
            "shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;"
            "align=right;spacingRight=8;fontStyle=0;overflow=hidden;fontSize=10;fontColor=#607D8B;fontFamily=monospace;html=1;"
        )
        c2 = ET.SubElement(parent, "mxCell", id=f"{row_id}_c2", value=dtype, style=c2_style, vertex="1", parent=row_id)
        ET.SubElement(c2, "mxGeometry", x=str(col1_w), width=str(col2_w), height=str(row_h), **{"as": "geometry"})
        
    return tbl

def make_connector(parent, edge_id, source_id, target_id, label="", exitX="1", exitY="0.5", entryX="0", entryY="0.5", color="#1565C0", dashed="0", strokeWidth="2"):
    style = f"edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;entryX={entryX};entryY={entryY};exitX={exitX};exitY={exitY};strokeColor={color};strokeWidth={strokeWidth};dashed={dashed};fontSize=11;fontStyle=1;labelBackgroundColor=#FFFFFF;"
    edge = ET.SubElement(parent, "mxCell", id=edge_id, value=label, style=style, edge="1", parent="1", source=source_id, target=target_id)
    ET.SubElement(edge, "mxGeometry", relative="1", **{"as": "geometry"})
    return edge

def make_banner(parent, cell_id, text, x=50, y=20, w=1400, h=45, fill="#ECEFF1", stroke="#90A4AE", fg="#263238"):
    style = f"rounded=1;arcSize=10;whiteSpace=wrap;html=1;fontStyle=1;fontSize=16;strokeWidth=1.5;fillColor={fill};strokeColor={stroke};fontColor={fg};shadow=1;align=center;html=1;"
    cell = ET.SubElement(parent, "mxCell", id=cell_id, value=f"<b>{text}</b>", style=style, vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})
    return cell

# ==============================================================================
# CHEN NOTATION BUILDERS
# ==============================================================================

def make_erd_entity(parent, cell_id, name, x, y, w=150, h=55, is_weak=False, fill="#FFFFFF", stroke="#000000"):
    style = f"rounded=0;whiteSpace=wrap;html=1;fontStyle=1;fontSize=13;strokeWidth=2;fillColor={fill};strokeColor={stroke};shadow=1;"
    if is_weak:
        style += "shape=ext;double=1;"
    cell = ET.SubElement(parent, "mxCell", id=cell_id, value=f"<b>{name}</b>", style=style, vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})
    return cell

def make_erd_relation(parent, cell_id, name, x, y, w=110, h=55, fill="#FFFFFF", stroke="#000000"):
    style = f"shape=rhombus;whiteSpace=wrap;html=1;fontStyle=1;fontSize=11;strokeWidth=2;fillColor={fill};strokeColor={stroke};shadow=1;"
    cell = ET.SubElement(parent, "mxCell", id=cell_id, value=name, style=style, vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})
    return cell

def make_erd_attribute(parent, cell_id, name, x, y, w=120, h=36, is_pk=False, fill="#FFFFFF", stroke="#000000"):
    disp = f"<u><b>{name}</b></u>" if is_pk else name
    style = f"ellipse;whiteSpace=wrap;html=1;fontSize=11;strokeWidth=1.5;fillColor={fill};strokeColor={stroke};"
    cell = ET.SubElement(parent, "mxCell", id=cell_id, value=disp, style=style, vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})
    return cell

def make_erd_edge(parent, edge_id, source_id, target_id, label=""):
    style = "endArrow=none;html=1;rounded=0;strokeWidth=1.5;strokeColor=#000000;fontSize=11;fontStyle=1;labelBackgroundColor=#FFFFFF;"
    edge = ET.SubElement(parent, "mxCell", id=edge_id, value=label, style=style, edge="1", parent="1", source=source_id, target=target_id)
    ET.SubElement(edge, "mxGeometry", relative="1", **{"as": "geometry"})
    return edge


# ==============================================================================
# SPRINT 1 IMPLEMENTATION
# ==============================================================================

def generate_sprint_1_schema():
    gm, root = create_graph_model(1700, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 1: Table Relationship Diagram (Physical Schema)", 50, 20, 1500, 45, "#E3F2FD", "#1565C0", "#0D47A1")
    
    users_cols = [
        ("PK", "user_id", "uuid"),
        ("UK", "email", "varchar(255)"),
        ("", "full_name", "varchar(150)"),
        ("", "phone", "varchar(20)"),
        ("", "password_hash", "text"),
        ("UK", "google_id", "varchar(128)"),
        ("", "role", "varchar(20)"),
        ("", "status", "varchar(20)"),
    ]
    make_table_cell(root, "tbl_users", "users", users_cols, 60, 100, 250, header_bg="#1A237E", stroke="#0D47A1")

    email_otps_cols = [
        ("PK", "id", "bigint"),
        ("FK", "email", "varchar(255)"),
        ("", "otp_code", "char(6)"),
        ("", "purpose", "varchar(30)"),
        ("", "attempts", "smallint"),
        ("", "expires_at", "timestamptz"),
        ("", "is_used", "boolean"),
    ]
    make_table_cell(root, "tbl_email_otps", "email_otps", email_otps_cols, 380, 100, 240, header_bg="#283593", stroke="#1A237E")

    cities_cols = [
        ("PK", "city_id", "uuid"),
        ("UK", "code", "varchar(20)"),
        ("", "name", "varchar(100)"),
        ("", "center_lat", "float8"),
        ("", "center_lng", "float8"),
        ("", "default_zoom", "smallint"),
    ]
    make_table_cell(root, "tbl_cities", "cities", cities_cols, 690, 100, 240, header_bg="#006064", stroke="#004D40")

    cat_cols = [
        ("PK", "category_id", "uuid"),
        ("UK", "category_key", "varchar(50)"),
        ("UK", "name", "varchar(100)"),
        ("", "is_green_category", "boolean"),
    ]
    make_table_cell(root, "tbl_poi_categories", "poi_categories", cat_cols, 1000, 100, 260, header_bg="#1B5E20", stroke="#0E3813")

    pois_cols = [
        ("PK", "poi_id", "uuid"),
        ("FK", "city_id", "uuid"),
        ("FK", "category_id", "uuid"),
        ("", "name", "varchar(200)"),
        ("", "name_unaccented", "varchar(200)"),
        ("", "cuisine", "varchar(50)"),
        ("", "is_vegetarian_friendly", "boolean"),
        ("", "geom", "geography(Point)"),
        ("", "estimated_cost", "numeric(12,2)"),
        ("", "green_score", "numeric(5,2)"),
        ("", "eco_features", "text[]"),
        ("", "external_booking_url", "text"),
        ("", "is_active", "boolean"),
    ]
    make_table_cell(root, "tbl_pois", "pois", pois_cols, 630, 360, 320, header_bg="#2E7D32", stroke="#1B5E20")

    hours_cols = [
        ("PK", "opening_hour_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "day_of_week", "smallint"),
        ("", "open_time", "time"),
        ("", "close_time", "time"),
        ("", "is_closed", "boolean"),
    ]
    make_table_cell(root, "tbl_poi_opening_hours", "poi_opening_hours", hours_cols, 1060, 360, 260, header_bg="#388E3C", stroke="#1B5E20")

    sources_cols = [
        ("PK", "source_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "source_type", "varchar(30)"),
        ("", "source_name", "varchar(150)"),
        ("", "ai_assisted_flag", "boolean"),
        ("", "retrieved_at", "timestamptz"),
    ]
    make_table_cell(root, "tbl_poi_sources", "poi_sources", sources_cols, 1060, 580, 260, header_bg="#43A047", stroke="#2E7D32")

    # Connectors
    make_connector(root, "fk_users_otps", "tbl_users", "tbl_email_otps", "1 : N (email)", "1", "0.25", "0", "0.25", "#283593")
    make_connector(root, "fk_cities_pois", "tbl_cities", "tbl_pois", "1 : N (city_id)", "0.5", "1", "0.3", "0", "#006064")
    make_connector(root, "fk_cats_pois", "tbl_poi_categories", "tbl_pois", "1 : N (category_id)", "0.3", "1", "0.7", "0", "#1B5E20")
    make_connector(root, "fk_pois_hours", "tbl_pois", "tbl_poi_opening_hours", "1 : N (poi_id)", "1", "0.3", "0", "0.3", "#2E7D32")
    make_connector(root, "fk_pois_sources", "tbl_pois", "tbl_poi_sources", "1 : N (poi_id)", "1", "0.7", "0", "0.3", "#2E7D32")

    return gm

def generate_sprint_1_erd():
    gm, root = create_graph_model(1800, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 1: Entity Relationship Diagram (Chen Notation)", 50, 20, 1600, 45, "#E8F5E9", "#2E7D32", "#1B5E20")

    make_erd_entity(root, "ent_users", "users", 180, 200, 140, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_email_otps", "email_otps", 480, 200, 140, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_cities", "cities", 180, 500, 140, 50, False, "#E0F7FA", "#006064")
    make_erd_entity(root, "ent_poi_categories", "poi_categories", 880, 200, 160, 50, False, "#E8F5E9", "#1B5E20")
    make_erd_entity(root, "ent_pois", "pois", 600, 500, 160, 50, False, "#E8F5E9", "#2E7D32")
    make_erd_entity(root, "ent_poi_hours", "poi_opening_hours", 380, 780, 170, 50, False, "#E8F5E9", "#388E3C")
    make_erd_entity(root, "ent_poi_sources", "poi_sources", 820, 780, 160, 50, False, "#E8F5E9", "#43A047")

    make_erd_relation(root, "rel_verifies", "verifies", 340, 200, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_contains", "contains", 380, 500, 100, 50, "#E0F2F1", "#00796B")
    make_erd_relation(root, "rel_classifies", "classifies", 760, 330, 100, 50, "#C8E6C9", "#388E3C")
    make_erd_relation(root, "rel_has_hours", "has_hours", 480, 650, 100, 50, "#C8E6C9", "#388E3C")
    make_erd_relation(root, "rel_has_source", "has_source", 740, 650, 100, 50, "#C8E6C9", "#388E3C")

    make_erd_edge(root, "e1", "ent_users", "rel_verifies", "1")
    make_erd_edge(root, "e2", "rel_verifies", "ent_email_otps", "N")
    make_erd_edge(root, "e3", "ent_cities", "rel_contains", "1")
    make_erd_edge(root, "e4", "rel_contains", "ent_pois", "N")
    make_erd_edge(root, "e5", "ent_poi_categories", "rel_classifies", "1")
    make_erd_edge(root, "e6", "rel_classifies", "ent_pois", "N")
    make_erd_edge(root, "e7", "ent_pois", "rel_has_hours", "1")
    make_erd_edge(root, "e8", "rel_has_hours", "ent_poi_hours", "N")
    make_erd_edge(root, "e9", "ent_pois", "rel_has_source", "1")
    make_erd_edge(root, "e10", "rel_has_source", "ent_poi_sources", "N")

    # users attrs
    make_erd_attribute(root, "a_u1", "user_id", 80, 110, 100, 32, True)
    make_erd_attribute(root, "a_u2", "email", 200, 100, 100, 32)
    make_erd_attribute(root, "a_u3", "full_name", 40, 190, 100, 32)
    make_erd_attribute(root, "a_u4", "password_hash", 40, 250, 110, 32)
    make_erd_attribute(root, "a_u5", "google_id", 120, 300, 100, 32)
    make_erd_attribute(root, "a_u6", "role", 230, 300, 80, 32)
    for aid in ["a_u1", "a_u2", "a_u3", "a_u4", "a_u5", "a_u6"]:
        make_erd_edge(root, f"ue_{aid}", aid, "ent_users")

    # otps attrs
    make_erd_attribute(root, "a_o1", "id", 450, 100, 80, 32, True)
    make_erd_attribute(root, "a_o2", "otp_code", 560, 100, 90, 32)
    make_erd_attribute(root, "a_o3", "purpose", 650, 160, 90, 32)
    make_erd_attribute(root, "a_o4", "attempts", 650, 220, 90, 32)
    make_erd_attribute(root, "a_o5", "expires_at", 580, 280, 90, 32)
    make_erd_attribute(root, "a_o6", "is_used", 470, 280, 80, 32)
    for aid in ["a_o1", "a_o2", "a_o3", "a_o4", "a_o5", "a_o6"]:
        make_erd_edge(root, f"oe_{aid}", aid, "ent_email_otps")

    # cities attrs
    make_erd_attribute(root, "a_c1", "city_id", 40, 440, 90, 32, True)
    make_erd_attribute(root, "a_c2", "code", 150, 410, 80, 32)
    make_erd_attribute(root, "a_c3", "name", 40, 520, 90, 32)
    make_erd_attribute(root, "a_c4", "center_lat", 60, 580, 90, 32)
    make_erd_attribute(root, "a_c5", "center_lng", 170, 600, 90, 32)
    make_erd_attribute(root, "a_c6", "default_zoom", 230, 540, 100, 32)
    for aid in ["a_c1", "a_c2", "a_c3", "a_c4", "a_c5", "a_c6"]:
        make_erd_edge(root, f"ce_{aid}", aid, "ent_cities")

    # categories attrs
    make_erd_attribute(root, "a_cat1", "category_id", 840, 100, 100, 32, True)
    make_erd_attribute(root, "a_cat2", "category_key", 980, 90, 100, 32)
    make_erd_attribute(root, "a_cat3", "name", 1100, 140, 80, 32)
    make_erd_attribute(root, "a_cat4", "is_green_category", 1090, 210, 130, 32)
    make_erd_attribute(root, "a_cat5", "description", 1020, 270, 90, 32)
    for aid in ["a_cat1", "a_cat2", "a_cat3", "a_cat4", "a_cat5"]:
        make_erd_edge(root, f"cate_{aid}", aid, "ent_poi_categories")

    # pois attrs
    make_erd_attribute(root, "a_p1", "poi_id", 520, 420, 90, 32, True)
    make_erd_attribute(root, "a_p2", "name_unaccented", 630, 420, 120, 32)
    make_erd_attribute(root, "a_p3", "cuisine", 780, 440, 90, 32)
    make_erd_attribute(root, "a_p4", "is_vegetarian_friendly", 820, 500, 140, 32)
    make_erd_attribute(root, "a_p5", "estimated_cost", 820, 560, 110, 32)
    make_erd_attribute(root, "a_p6", "green_score", 760, 610, 100, 32)
    make_erd_attribute(root, "a_p7", "eco_features", 640, 620, 100, 32)
    make_erd_attribute(root, "a_p8", "external_booking_url", 510, 600, 140, 32)
    for aid in ["a_p1", "a_p2", "a_p3", "a_p4", "a_p5", "a_p6", "a_p7", "a_p8"]:
        make_erd_edge(root, f"pe_{aid}", aid, "ent_pois")

    # hours attrs
    make_erd_attribute(root, "a_h1", "opening_hour_id", 200, 750, 130, 32, True)
    make_erd_attribute(root, "a_h2", "day_of_week", 210, 810, 100, 32)
    make_erd_attribute(root, "a_h3", "open_time", 280, 870, 90, 32)
    make_erd_attribute(root, "a_h4", "close_time", 400, 880, 90, 32)
    make_erd_attribute(root, "a_h5", "is_closed", 510, 860, 90, 32)
    for aid in ["a_h1", "a_h2", "a_h3", "a_h4", "a_h5"]:
        make_erd_edge(root, f"he_{aid}", aid, "ent_poi_hours")

    # sources attrs
    make_erd_attribute(root, "a_s1", "source_id", 720, 870, 90, 32, True)
    make_erd_attribute(root, "a_s2", "source_type", 830, 880, 90, 32)
    make_erd_attribute(root, "a_s3", "source_name", 950, 870, 100, 32)
    make_erd_attribute(root, "a_s4", "ai_assisted_flag", 1020, 800, 120, 32)
    make_erd_attribute(root, "a_s5", "retrieved_at", 1010, 730, 100, 32)
    for aid in ["a_s1", "a_s2", "a_s3", "a_s4", "a_s5"]:
        make_erd_edge(root, f"se_{aid}", aid, "ent_poi_sources")

    return gm


# ==============================================================================
# SPRINT 2 IMPLEMENTATION
# ==============================================================================

def generate_sprint_2_schema():
    gm, root = create_graph_model(1700, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 2: Table Relationship Diagram (Physical Schema)", 50, 20, 1500, 45, "#FFF3E0", "#E65100", "#BF360C")

    users_cols = [
        ("PK", "user_id", "uuid"),
        ("UK", "email", "varchar"),
        ("", "full_name", "varchar"),
        ("", "role", "varchar"),
    ]
    make_table_cell(root, "tbl_users", "users", users_cols, 60, 100, 240, header_bg="#1A237E", stroke="#0D47A1")

    tm_cols = [
        ("PK", "transport_mode_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "is_green_mode", "boolean"),
        ("", "emission_factor_co2e", "numeric"),
    ]
    make_table_cell(root, "tbl_transport_modes", "transport_modes", tm_cols, 60, 300, 250, header_bg="#006064", stroke="#004D40")

    pref_cols = [
        ("PK", "preference_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("FK", "itinerary_id", "uuid"),
        ("", "destination_scope", "varchar"),
        ("", "trip_days", "smallint"),
        ("", "num_people", "smallint"),
        ("", "budget_mode", "varchar"),
        ("", "total_budget", "numeric"),
        ("", "daily_budget_per_person", "numeric"),
        ("", "food_preferences", "text[]"),
        ("", "nature_activity_prefs", "text[]"),
        ("", "itinerary_type", "varchar"),
        ("FK", "transport_mode_id", "uuid"),
        ("", "green_priority", "numeric"),
    ]
    make_table_cell(root, "tbl_trip_preferences", "trip_preferences", pref_cols, 360, 100, 290, header_bg="#1565C0", stroke="#0D47A1")

    pi_cols = [
        ("PK, FK", "preference_id", "uuid"),
        ("PK, FK", "interest_id", "uuid"),
        ("", "selection_weight", "numeric"),
    ]
    make_table_cell(root, "tbl_preference_interests", "preference_interests", pi_cols, 700, 100, 250, header_bg="#6A1B9A", stroke="#4A148C")

    interests_cols = [
        ("PK", "interest_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "category_group", "varchar"),
        ("", "is_green_tag", "boolean"),
    ]
    make_table_cell(root, "tbl_interests", "interests", interests_cols, 1000, 100, 250, header_bg="#00897B", stroke="#004D40")

    poi_int_cols = [
        ("PK, FK", "poi_id", "uuid"),
        ("PK, FK", "interest_id", "uuid"),
        ("", "match_strength", "numeric"),
    ]
    make_table_cell(root, "tbl_poi_interests", "poi_interests", poi_int_cols, 1000, 310, 250, header_bg="#D84315", stroke="#BF360C")

    pois_cols = [
        ("PK", "poi_id", "uuid"),
        ("", "name", "varchar"),
        ("", "is_vegetarian_friendly", "boolean"),
        ("", "green_score", "numeric"),
        ("", "eco_features", "text[]"),
    ]
    make_table_cell(root, "tbl_pois", "pois", pois_cols, 680, 520, 270, header_bg="#2E7D32", stroke="#1B5E20")

    kg_cols = [
        ("PK", "(:POI {id})", "Node Label"),
        ("", "(:Location {key})", "Node Label"),
        ("", "(:Category {key})", "Node Label"),
        ("", "(:Activity {key})", "Node Label"),
        ("", "(:Feature {key})", "Node Label"),
    ]
    make_table_cell(root, "tbl_neo4j", "neo4j_kg_projection (Neo4j / KG)", kg_cols, 1000, 520, 270, header_bg="#546E7A", stroke="#37474F")

    # Connectors
    make_connector(root, "fk_u_pref", "tbl_users", "tbl_trip_preferences", "1 : N (user_id)", "1", "0.3", "0", "0.2", "#1A237E")
    make_connector(root, "fk_tm_pref", "tbl_transport_modes", "tbl_trip_preferences", "1 : N (transport_mode_id)", "1", "0.3", "0", "0.8", "#006064")
    make_connector(root, "fk_pref_pi", "tbl_trip_preferences", "tbl_preference_interests", "1 : N (preference_id)", "1", "0.2", "0", "0.3", "#1565C0")
    make_connector(root, "fk_int_pi", "tbl_interests", "tbl_preference_interests", "1 : N (interest_id)", "0", "0.3", "1", "0.3", "#00897B")
    make_connector(root, "fk_int_poi_int", "tbl_interests", "tbl_poi_interests", "1 : N (interest_id)", "0.5", "1", "0.5", "0", "#00897B")
    make_connector(root, "fk_poi_poi_int", "tbl_pois", "tbl_poi_interests", "1 : N (poi_id)", "1", "0.3", "0.2", "1", "#2E7D32")
    make_connector(root, "fk_poi_neo4j", "tbl_pois", "tbl_neo4j", "Graph Projection", "1", "0.6", "0", "0.6", "#546E7A", dashed="1")

    return gm

def generate_sprint_2_erd():
    gm, root = create_graph_model(1800, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 2: Entity Relationship Diagram (Chen Notation)", 50, 20, 1600, 45, "#FFF8E1", "#FFA000", "#FF6F00")

    make_erd_entity(root, "ent_users", "users", 180, 180, 150, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_trip_preferences", "trip_preferences", 180, 460, 170, 55, False, "#E3F2FD", "#1565C0")
    make_erd_entity(root, "ent_transport_modes", "transport_modes", 180, 750, 170, 50, False, "#E0F7FA", "#006064")
    make_erd_entity(root, "ent_preference_interests", "preference_interests", 550, 460, 180, 50, True, "#F3E5F5", "#6A1B9A")
    make_erd_entity(root, "ent_interests", "interests", 880, 460, 150, 50, False, "#E0F2F1", "#00897B")
    make_erd_entity(root, "ent_poi_interests", "poi_interests", 1190, 460, 160, 50, True, "#FBE9E7", "#D84315")
    make_erd_entity(root, "ent_pois", "pois", 1190, 750, 160, 50, False, "#E8F5E9", "#2E7D32")

    make_erd_relation(root, "rel_submits", "submits", 230, 320, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_prefers", "prefers", 230, 610, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_selects", "selects", 410, 460, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_maps_to", "maps_to", 760, 460, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_tagged_by", "tagged_by", 1060, 460, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_describes", "describes", 1230, 610, 100, 50, "#FFF9C4", "#F57F17")

    make_erd_edge(root, "e1", "ent_users", "rel_submits", "1")
    make_erd_edge(root, "e2", "rel_submits", "ent_trip_preferences", "N")
    make_erd_edge(root, "e3", "ent_trip_preferences", "rel_prefers", "N")
    make_erd_edge(root, "e4", "rel_prefers", "ent_transport_modes", "1")
    make_erd_edge(root, "e5", "ent_trip_preferences", "rel_selects", "1")
    make_erd_edge(root, "e6", "rel_selects", "ent_preference_interests", "N")
    make_erd_edge(root, "e7", "ent_preference_interests", "rel_maps_to", "N")
    make_erd_edge(root, "e8", "rel_maps_to", "ent_interests", "1")
    make_erd_edge(root, "e9", "ent_interests", "rel_tagged_by", "1")
    make_erd_edge(root, "e10", "rel_tagged_by", "ent_poi_interests", "N")
    make_erd_edge(root, "e11", "ent_pois", "rel_describes", "1")
    make_erd_edge(root, "e12", "rel_describes", "ent_poi_interests", "N")

    # Attributes - users
    make_erd_attribute(root, "a_u1", "user_id", 80, 100, 90, 32, True)
    make_erd_attribute(root, "a_u2", "email", 180, 90, 80, 32)
    make_erd_attribute(root, "a_u3", "full_name", 270, 100, 90, 32)
    make_erd_attribute(root, "a_u4", "status", 60, 180, 80, 32)
    for a in ["a_u1", "a_u2", "a_u3", "a_u4"]:
        make_erd_edge(root, f"ue_{a}", a, "ent_users")

    # Attributes - trip_preferences
    make_erd_attribute(root, "a_tp1", "preference_id", 40, 390, 110, 32, True)
    make_erd_attribute(root, "a_tp2", "destination_scope", 30, 440, 120, 32)
    make_erd_attribute(root, "a_tp3", "trip_days", 40, 490, 90, 32)
    make_erd_attribute(root, "a_tp4", "num_people", 50, 540, 90, 32)
    make_erd_attribute(root, "a_tp5", "budget_mode", 370, 380, 100, 32)
    make_erd_attribute(root, "a_tp6", "total_budget", 380, 540, 100, 32)
    make_erd_attribute(root, "a_tp7", "green_priority", 280, 570, 100, 32)
    make_erd_attribute(root, "a_tp8", "food_preferences", 420, 490, 120, 32)
    for a in ["a_tp1", "a_tp2", "a_tp3", "a_tp4", "a_tp5", "a_tp6", "a_tp7", "a_tp8"]:
        make_erd_edge(root, f"tpe_{a}", a, "ent_trip_preferences")

    # Attributes - transport_modes
    make_erd_attribute(root, "a_tm1", "transport_mode_id", 40, 710, 130, 32, True)
    make_erd_attribute(root, "a_tm2", "code", 60, 820, 80, 32)
    make_erd_attribute(root, "a_tm3", "name", 160, 840, 80, 32)
    make_erd_attribute(root, "a_tm4", "is_green_mode", 260, 840, 110, 32)
    make_erd_attribute(root, "a_tm5", "emission_co2e", 350, 790, 110, 32)
    for a in ["a_tm1", "a_tm2", "a_tm3", "a_tm4", "a_tm5"]:
        make_erd_edge(root, f"tme_{a}", a, "ent_transport_modes")

    # Attributes - preference_interests
    make_erd_attribute(root, "a_pi1", "preference_id", 490, 380, 110, 32, True)
    make_erd_attribute(root, "a_pi2", "interest_id", 610, 380, 100, 32, True)
    make_erd_attribute(root, "a_pi3", "selection_weight", 580, 550, 120, 32)
    for a in ["a_pi1", "a_pi2", "a_pi3"]:
        make_erd_edge(root, f"pie_{a}", a, "ent_preference_interests")

    # Attributes - interests
    make_erd_attribute(root, "a_i1", "interest_id", 840, 360, 90, 32, True)
    make_erd_attribute(root, "a_i2", "code", 940, 360, 80, 32)
    make_erd_attribute(root, "a_i3", "category_group", 830, 550, 110, 32)
    make_erd_attribute(root, "a_i4", "is_green_tag", 950, 550, 100, 32)
    for a in ["a_i1", "a_i2", "a_i3", "a_i4"]:
        make_erd_edge(root, f"ie_{a}", a, "ent_interests")

    # Attributes - poi_interests
    make_erd_attribute(root, "a_poi_i1", "poi_id", 1140, 370, 80, 32, True)
    make_erd_attribute(root, "a_poi_i2", "interest_id", 1240, 370, 90, 32, True)
    make_erd_attribute(root, "a_poi_i3", "match_strength", 1330, 440, 110, 32)
    for a in ["a_poi_i1", "a_poi_i2", "a_poi_i3"]:
        make_erd_edge(root, f"poie_{a}", a, "ent_poi_interests")

    # Attributes - pois
    make_erd_attribute(root, "a_p1", "poi_id", 1080, 710, 80, 32, True)
    make_erd_attribute(root, "a_p2", "name", 1070, 810, 80, 32)
    make_erd_attribute(root, "a_p3", "green_score", 1170, 840, 90, 32)
    make_erd_attribute(root, "a_p4", "is_vegetarian_friendly", 1280, 840, 140, 32)
    make_erd_attribute(root, "a_p5", "eco_features", 1380, 800, 100, 32)
    make_erd_attribute(root, "a_p6", "estimated_cost", 1380, 730, 110, 32)
    for a in ["a_p1", "a_p2", "a_p3", "a_p4", "a_p5", "a_p6"]:
        make_erd_edge(root, f"pe_{a}", a, "ent_pois")

    return gm


# ==============================================================================
# SPRINT 3 IMPLEMENTATION
# ==============================================================================

def generate_sprint_3_schema():
    gm, root = create_graph_model(1800, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 3: Table Relationship Diagram (Physical Schema)", 50, 20, 1600, 45, "#EDE7F6", "#6A1B9A", "#4A148C")

    users_cols = [
        ("PK", "user_id", "uuid"),
        ("UK", "email", "varchar"),
        ("", "full_name", "varchar"),
        ("", "status", "varchar"),
    ]
    make_table_cell(root, "tbl_users", "users", users_cols, 60, 100, 230, header_bg="#1A237E", stroke="#0D47A1")

    sp_cols = [
        ("PK", "saved_place_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "notes", "text"),
        ("", "created_at", "timestamptz"),
    ]
    make_table_cell(root, "tbl_saved_places", "saved_places", sp_cols, 350, 100, 250, header_bg="#00838F", stroke="#006064")

    itin_cols = [
        ("PK", "itinerary_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("", "title", "varchar"),
        ("", "destination_scope", "varchar"),
        ("", "itinerary_type", "varchar"),
        ("", "total_days", "smallint"),
        ("", "num_people", "smallint"),
        ("", "budget_mode", "varchar"),
        ("", "total_estimated_cost", "numeric"),
        ("", "total_carbon_co2e", "numeric"),
        ("", "status", "varchar"),
    ]
    make_table_cell(root, "tbl_itineraries", "itineraries", itin_cols, 670, 100, 290, header_bg="#6A1B9A", stroke="#4A148C")

    score_cols = [
        ("PK, FK", "itinerary_id", "uuid"),
        ("", "time_score", "numeric"),
        ("", "cost_score", "numeric"),
        ("", "carbon_score", "numeric"),
        ("", "crowding_score", "numeric"),
        ("", "satisfaction_score", "numeric"),
        ("", "local_biz_score", "numeric"),
        ("", "total_weighted_score", "numeric"),
    ]
    make_table_cell(root, "tbl_itinerary_scores", "itinerary_scores", score_cols, 1030, 100, 260, header_bg="#4A148C", stroke="#311B92")

    pois_cols = [
        ("PK", "poi_id", "uuid"),
        ("UK", "name", "varchar"),
        ("", "is_vegetarian_friendly", "boolean"),
        ("", "green_score", "numeric"),
        ("", "external_booking_url", "text"),
    ]
    make_table_cell(root, "tbl_pois", "pois", pois_cols, 60, 420, 260, header_bg="#2E7D32", stroke="#1B5E20")

    days_cols = [
        ("PK", "itinerary_day_id", "uuid"),
        ("FK", "itinerary_id", "uuid"),
        ("FK", "focus_city_id", "uuid"),
        ("", "day_number", "smallint"),
        ("", "theme", "varchar"),
        ("", "route_geometry", "geography(LineString)"),
    ]
    make_table_cell(root, "tbl_itinerary_days", "itinerary_days", days_cols, 370, 420, 270, header_bg="#7B1FA2", stroke="#4A148C")

    stops_cols = [
        ("PK", "itinerary_stop_id", "uuid"),
        ("FK", "itinerary_day_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "sequence_no", "smallint"),
        ("", "time_slot", "varchar"),
        ("FK", "transport_mode_id", "uuid"),
        ("", "is_green_activity", "boolean"),
        ("", "is_vegetarian_meal", "boolean"),
        ("", "external_booking_url", "text"),
        ("", "estimated_cost", "numeric"),
        ("", "estimated_carbon_co2e", "numeric"),
    ]
    make_table_cell(root, "tbl_itinerary_stops", "itinerary_stops", stops_cols, 700, 450, 290, header_bg="#8E24AA", stroke="#6A1B9A")

    tm_cols = [
        ("PK", "transport_mode_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "is_green_mode", "boolean"),
        ("", "emission_factor_co2e", "numeric"),
    ]
    make_table_cell(root, "tbl_transport_modes", "transport_modes", tm_cols, 1060, 450, 250, header_bg="#006064", stroke="#004D40")

    # Connectors
    make_connector(root, "fk_u_sp", "tbl_users", "tbl_saved_places", "1 : N (user_id)", "1", "0.3", "0", "0.3", "#1A237E")
    make_connector(root, "fk_poi_sp", "tbl_pois", "tbl_saved_places", "1 : N (poi_id)", "0.5", "0", "0.3", "1", "#2E7D32")
    make_connector(root, "fk_u_itin", "tbl_users", "tbl_itineraries", "1 : N (user_id)", "0.5", "0", "0.5", "0", "#1A237E")
    make_connector(root, "fk_itin_scores", "tbl_itineraries", "tbl_itinerary_scores", "1 : 1 (itinerary_id)", "1", "0.3", "0", "0.3", "#6A1B9A")
    make_connector(root, "fk_itin_days", "tbl_itineraries", "tbl_itinerary_days", "1 : N (itinerary_id)", "0.3", "1", "0.8", "0", "#6A1B9A")
    make_connector(root, "fk_days_stops", "tbl_itinerary_days", "tbl_itinerary_stops", "1 : N (day_id)", "1", "0.5", "0", "0.3", "#7B1FA2")
    make_connector(root, "fk_poi_stops", "tbl_pois", "tbl_itinerary_stops", "1 : N (poi_id)", "0.8", "1", "0.3", "1", "#2E7D32")
    make_connector(root, "fk_tm_stops", "tbl_transport_modes", "tbl_itinerary_stops", "1 : N (transport_id)", "0", "0.4", "1", "0.4", "#006064")

    return gm

def generate_sprint_3_erd():
    gm, root = create_graph_model(1800, 1100)
    make_banner(root, "banner", "GreenTrip AI — Sprint 3: Entity Relationship Diagram (Chen Notation)", 50, 20, 1600, 45, "#EDE7F6", "#7E57C2", "#512DA8")

    make_erd_entity(root, "ent_users", "users", 160, 200, 150, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_saved_places", "saved_places", 520, 200, 160, 50, True, "#E0F7FA", "#00838F")
    make_erd_entity(root, "ent_pois", "pois", 920, 200, 150, 50, False, "#E8F5E9", "#2E7D32")
    make_erd_entity(root, "ent_itineraries", "itineraries", 160, 560, 160, 50, False, "#F3E5F5", "#6A1B9A")
    make_erd_entity(root, "ent_itinerary_scores", "itinerary_scores", 560, 560, 170, 50, True, "#EDE7F6", "#4A148C")
    make_erd_entity(root, "ent_itinerary_days", "itinerary_days", 560, 850, 160, 50, False, "#F3E5F5", "#7B1FA2")
    make_erd_entity(root, "ent_itinerary_stops", "itinerary_stops", 950, 850, 170, 50, False, "#F3E5F5", "#8E24AA")

    make_erd_relation(root, "rel_bookmarks", "bookmarks", 360, 200, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_refs_poi", "refs_poi", 750, 200, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_owns", "owns", 190, 380, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_score", "has_score", 390, 560, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_day", "has_day", 390, 720, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_stop", "has_stop", 780, 850, 100, 50, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_visits_poi", "visits_poi", 980, 560, 100, 50, "#FFF9C4", "#F57F17")

    make_erd_edge(root, "e1", "ent_users", "rel_bookmarks", "1")
    make_erd_edge(root, "e2", "rel_bookmarks", "ent_saved_places", "N")
    make_erd_edge(root, "e3", "ent_saved_places", "rel_refs_poi", "N")
    make_erd_edge(root, "e4", "rel_refs_poi", "ent_pois", "1")
    make_erd_edge(root, "e5", "ent_users", "rel_owns", "1")
    make_erd_edge(root, "e6", "rel_owns", "ent_itineraries", "N")
    make_erd_edge(root, "e7", "ent_itineraries", "rel_has_score", "1")
    make_erd_edge(root, "e8", "rel_has_score", "ent_itinerary_scores", "1")
    make_erd_edge(root, "e9", "ent_itineraries", "rel_has_day", "1")
    make_erd_edge(root, "e10", "rel_has_day", "ent_itinerary_days", "N")
    make_erd_edge(root, "e11", "ent_itinerary_days", "rel_has_stop", "1")
    make_erd_edge(root, "e12", "rel_has_stop", "ent_itinerary_stops", "N")
    make_erd_edge(root, "e13", "ent_pois", "rel_visits_poi", "1")
    make_erd_edge(root, "e14", "rel_visits_poi", "ent_itinerary_stops", "N")

    # users attrs
    make_erd_attribute(root, "a_u1", "user_id", 80, 120, 80, 32, True)
    make_erd_attribute(root, "a_u2", "email", 180, 110, 80, 32)
    make_erd_attribute(root, "a_u3", "full_name", 270, 120, 90, 32)
    for a in ["a_u1", "a_u2", "a_u3"]:
        make_erd_edge(root, f"ue_{a}", a, "ent_users")

    # saved_places attrs
    make_erd_attribute(root, "a_sp1", "saved_place_id", 460, 110, 110, 32, True)
    make_erd_attribute(root, "a_sp2", "user_id", 580, 110, 80, 32)
    make_erd_attribute(root, "a_sp3", "poi_id", 670, 120, 80, 32)
    make_erd_attribute(root, "a_sp4", "notes", 470, 290, 80, 32)
    make_erd_attribute(root, "a_sp5", "created_at", 580, 290, 90, 32)
    for a in ["a_sp1", "a_sp2", "a_sp3", "a_sp4", "a_sp5"]:
        make_erd_edge(root, f"spe_{a}", a, "ent_saved_places")

    # pois attrs
    make_erd_attribute(root, "a_p1", "poi_id", 870, 110, 80, 32, True)
    make_erd_attribute(root, "a_p2", "name", 970, 100, 80, 32)
    make_erd_attribute(root, "a_p3", "green_score", 1070, 130, 90, 32)
    make_erd_attribute(root, "a_p4", "is_vegetarian_friendly", 1100, 200, 140, 32)
    make_erd_attribute(root, "a_p5", "external_booking_url", 1090, 270, 130, 32)
    for a in ["a_p1", "a_p2", "a_p3", "a_p4", "a_p5"]:
        make_erd_edge(root, f"pe_{a}", a, "ent_pois")

    # itineraries attrs
    make_erd_attribute(root, "a_it1", "itinerary_id", 40, 500, 100, 32, True)
    make_erd_attribute(root, "a_it2", "user_id", 40, 550, 80, 32)
    make_erd_attribute(root, "a_it3", "title", 40, 600, 80, 32)
    make_erd_attribute(root, "a_it4", "destination_scope", 30, 650, 120, 32)
    make_erd_attribute(root, "a_it5", "itinerary_type", 40, 710, 100, 32)
    make_erd_attribute(root, "a_it6", "total_days", 130, 750, 90, 32)
    make_erd_attribute(root, "a_it7", "num_people", 230, 750, 90, 32)
    make_erd_attribute(root, "a_it8", "budget_mode", 250, 690, 100, 32)
    make_erd_attribute(root, "a_it9", "total_estimated_cost", 220, 630, 130, 32)
    for a in ["a_it1", "a_it2", "a_it3", "a_it4", "a_it5", "a_it6", "a_it7", "a_it8", "a_it9"]:
        make_erd_edge(root, f"ite_{a}", a, "ent_itineraries")

    # scores attrs
    make_erd_attribute(root, "a_sc1", "itinerary_id", 510, 480, 100, 32, True)
    make_erd_attribute(root, "a_sc2", "time_score", 620, 470, 90, 32)
    make_erd_attribute(root, "a_sc3", "cost_score", 720, 480, 90, 32)
    make_erd_attribute(root, "a_sc4", "carbon_score", 740, 540, 100, 32)
    make_erd_attribute(root, "a_sc5", "crowding_score", 740, 600, 110, 32)
    make_erd_attribute(root, "a_sc6", "satisfaction_score", 720, 660, 120, 32)
    make_erd_attribute(root, "a_sc7", "local_biz_score", 610, 660, 110, 32)
    make_erd_attribute(root, "a_sc8", "total_weighted_score", 470, 650, 130, 32)
    for a in ["a_sc1", "a_sc2", "a_sc3", "a_sc4", "a_sc5", "a_sc6", "a_sc7", "a_sc8"]:
        make_erd_edge(root, f"sce_{a}", a, "ent_itinerary_scores")

    # days attrs
    make_erd_attribute(root, "a_id1", "itinerary_day_id", 430, 810, 120, 32, True)
    make_erd_attribute(root, "a_id2", "itinerary_id", 420, 870, 100, 32)
    make_erd_attribute(root, "a_id3", "focus_city_id", 440, 930, 100, 32)
    make_erd_attribute(root, "a_id4", "day_number", 530, 960, 90, 32)
    make_erd_attribute(root, "a_id5", "theme", 640, 960, 80, 32)
    make_erd_attribute(root, "a_id6", "route_geometry", 720, 930, 110, 32)
    for a in ["a_id1", "a_id2", "a_id3", "a_id4", "a_id5", "a_id6"]:
        make_erd_edge(root, f"ide_{a}", a, "ent_itinerary_days")

    # stops attrs
    make_erd_attribute(root, "a_is1", "itinerary_stop_id", 1140, 810, 120, 32, True)
    make_erd_attribute(root, "a_is2", "sequence_no", 1150, 870, 90, 32)
    make_erd_attribute(root, "a_is3", "time_slot", 1150, 920, 80, 32)
    make_erd_attribute(root, "a_is4", "is_green_activity", 1080, 960, 120, 32)
    make_erd_attribute(root, "a_is5", "is_vegetarian_meal", 950, 970, 130, 32)
    make_erd_attribute(root, "a_is6", "external_booking_url", 840, 960, 130, 32)
    for a in ["a_is1", "a_is2", "a_is3", "a_is4", "a_is5", "a_is6"]:
        make_erd_edge(root, f"ise_{a}", a, "ent_itinerary_stops")

    return gm


# ==============================================================================
# SPRINT 4 IMPLEMENTATION (FULL 17 TABLES)
# ==============================================================================

def generate_sprint_4_schema():
    gm, root = create_graph_model(2100, 1300)
    make_banner(root, "banner", "GreenTrip AI — Sprint 4: Relational Schema (17 Tables Complete Domain Model)", 50, 20, 1900, 45, "#E8F5E9", "#2E7D32", "#1B5E20")

    # Col 1: Users, Auth, Saved, Transport
    u_cols = [
        ("PK", "user_id", "uuid"),
        ("UK", "email", "varchar"),
        ("", "full_name", "varchar"),
        ("", "role", "varchar"),
        ("", "status", "varchar"),
    ]
    make_table_cell(root, "tbl_users", "users", u_cols, 50, 100, 230, header_bg="#1A237E", stroke="#0D47A1")

    otp_cols = [
        ("PK", "id", "bigint"),
        ("FK", "email", "varchar"),
        ("", "otp_code", "char(6)"),
        ("", "purpose", "varchar"),
        ("", "is_used", "boolean"),
    ]
    make_table_cell(root, "tbl_email_otps", "email_otps", otp_cols, 50, 300, 230, header_bg="#283593", stroke="#1A237E")

    sp_cols = [
        ("PK", "saved_place_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "notes", "text"),
    ]
    make_table_cell(root, "tbl_saved_places", "saved_places", sp_cols, 50, 490, 230, header_bg="#00838F", stroke="#006064")

    tm_cols = [
        ("PK", "transport_mode_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "is_green_mode", "boolean"),
        ("", "emission_co2e", "numeric"),
    ]
    make_table_cell(root, "tbl_transport_modes", "transport_modes", tm_cols, 50, 670, 230, header_bg="#006064", stroke="#004D40")

    # Col 2: Preferences, Itineraries, Cities
    tp_cols = [
        ("PK", "preference_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("FK", "itinerary_id", "uuid"),
        ("", "destination_scope", "varchar"),
        ("", "trip_days", "smallint"),
        ("", "num_people", "smallint"),
        ("", "budget_mode", "varchar"),
        ("", "total_budget", "numeric"),
        ("", "food_preferences", "text[]"),
        ("", "itinerary_type", "varchar"),
        ("FK", "transport_mode_id", "uuid"),
    ]
    make_table_cell(root, "tbl_trip_preferences", "trip_preferences", tp_cols, 340, 100, 270, header_bg="#1565C0", stroke="#0D47A1")

    itin_cols = [
        ("PK", "itinerary_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("", "title", "varchar"),
        ("", "itinerary_type", "varchar"),
        ("", "total_days", "smallint"),
        ("", "budget_mode", "varchar"),
        ("", "total_estimated_cost", "numeric"),
    ]
    make_table_cell(root, "tbl_itineraries", "itineraries", itin_cols, 340, 440, 270, header_bg="#6A1B9A", stroke="#4A148C")

    city_cols = [
        ("PK", "city_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "center_lat", "float8"),
        ("", "center_lng", "float8"),
        ("", "default_zoom", "smallint"),
    ]
    make_table_cell(root, "tbl_cities", "cities", city_cols, 340, 700, 240, header_bg="#00695C", stroke="#004D40")

    # Col 3: Preference Interests, Scores, Days, Stops
    pi_cols = [
        ("PK, FK", "preference_id", "uuid"),
        ("PK, FK", "interest_id", "uuid"),
        ("", "selection_weight", "numeric"),
    ]
    make_table_cell(root, "tbl_preference_interests", "preference_interests", pi_cols, 660, 100, 250, header_bg="#7B1FA2", stroke="#4A148C")

    sc_cols = [
        ("PK, FK", "itinerary_id", "uuid"),
        ("", "time_score", "numeric"),
        ("", "cost_score", "numeric"),
        ("", "carbon_score", "numeric"),
        ("", "crowding_score", "numeric"),
        ("", "satisfaction_score", "numeric"),
        ("", "local_biz_score", "numeric"),
        ("", "total_weighted_score", "numeric"),
    ]
    make_table_cell(root, "tbl_itinerary_scores", "itinerary_scores", sc_cols, 660, 260, 250, header_bg="#4A148C", stroke="#311B92")

    days_cols = [
        ("PK", "itinerary_day_id", "uuid"),
        ("FK", "itinerary_id", "uuid"),
        ("FK", "focus_city_id", "uuid"),
        ("", "day_number", "smallint"),
        ("", "route_geometry", "text"),
    ]
    make_table_cell(root, "tbl_itinerary_days", "itinerary_days", days_cols, 660, 520, 250, header_bg="#8E24AA", stroke="#6A1B9A")

    stops_cols = [
        ("PK", "itinerary_stop_id", "uuid"),
        ("FK", "itinerary_day_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "sequence_no", "smallint"),
        ("", "time_slot", "varchar"),
        ("FK", "transport_mode_id", "uuid"),
        ("", "is_green_activity", "boolean"),
        ("", "is_vegetarian_meal", "boolean"),
        ("", "external_booking_url", "varchar"),
    ]
    make_table_cell(root, "tbl_itinerary_stops", "itinerary_stops", stops_cols, 660, 720, 280, header_bg="#AB47BC", stroke="#7B1FA2")

    # Col 4: Interests, POI Interests, POIs, Categories
    int_cols = [
        ("PK", "interest_id", "uuid"),
        ("UK", "code", "varchar"),
        ("", "name", "varchar"),
        ("", "is_green_tag", "boolean"),
    ]
    make_table_cell(root, "tbl_interests", "interests", int_cols, 980, 100, 240, header_bg="#00897B", stroke="#004D40")

    p_int_cols = [
        ("PK, FK", "poi_id", "uuid"),
        ("PK, FK", "interest_id", "uuid"),
        ("", "match_strength", "numeric"),
    ]
    make_table_cell(root, "tbl_poi_interests", "poi_interests", p_int_cols, 980, 290, 240, header_bg="#D84315", stroke="#BF360C")

    p_cols = [
        ("PK", "poi_id", "uuid"),
        ("FK", "city_id", "uuid"),
        ("FK", "category_id", "uuid"),
        ("", "name", "varchar"),
        ("", "name_unaccented", "varchar"),
        ("", "is_vegetarian_friendly", "boolean"),
        ("", "green_score", "numeric"),
        ("", "eco_features", "text[]"),
        ("", "external_booking_url", "text"),
    ]
    make_table_cell(root, "tbl_pois", "pois", p_cols, 980, 460, 280, header_bg="#2E7D32", stroke="#1B5E20")

    p_cat_cols = [
        ("PK", "category_id", "uuid"),
        ("UK", "category_key", "varchar"),
        ("", "name", "varchar"),
        ("", "is_green_category", "boolean"),
    ]
    make_table_cell(root, "tbl_poi_categories", "poi_categories", p_cat_cols, 980, 760, 250, header_bg="#1B5E20", stroke="#0E3813")

    # Col 5: Hours, Sources
    h_cols = [
        ("PK", "opening_hour_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "day_of_week", "smallint"),
        ("", "open_time", "time"),
        ("", "close_time", "time"),
    ]
    make_table_cell(root, "tbl_poi_opening_hours", "poi_opening_hours", h_cols, 1310, 460, 250, header_bg="#388E3C", stroke="#1B5E20")

    src_cols = [
        ("PK", "source_id", "uuid"),
        ("FK", "poi_id", "uuid"),
        ("", "source_type", "varchar"),
        ("", "ai_assisted_flag", "boolean"),
        ("", "notes", "text"),
    ]
    make_table_cell(root, "tbl_poi_sources", "poi_sources", src_cols, 1310, 660, 250, header_bg="#43A047", stroke="#2E7D32")

    # Connectors
    make_connector(root, "c1", "tbl_users", "tbl_email_otps", "1:N", "0.5", "1", "0.5", "0", "#1A237E")
    make_connector(root, "c2", "tbl_users", "tbl_saved_places", "1:N", "0.3", "1", "0.3", "0", "#1A237E")
    make_connector(root, "c3", "tbl_users", "tbl_trip_preferences", "1:N", "1", "0.3", "0", "0.3", "#1A237E")
    make_connector(root, "c4", "tbl_users", "tbl_itineraries", "1:N", "1", "0.7", "0", "0.3", "#1A237E")
    make_connector(root, "c5", "tbl_transport_modes", "tbl_trip_preferences", "1:N", "1", "0.3", "0", "0.8", "#006064")
    make_connector(root, "c6", "tbl_transport_modes", "tbl_itinerary_stops", "1:N", "1", "0.8", "0", "0.8", "#006064")
    make_connector(root, "c7", "tbl_trip_preferences", "tbl_preference_interests", "1:N", "1", "0.2", "0", "0.3", "#1565C0")
    make_connector(root, "c8", "tbl_interests", "tbl_preference_interests", "1:N", "0", "0.3", "1", "0.3", "#00897B")
    make_connector(root, "c9", "tbl_interests", "tbl_poi_interests", "1:N", "0.5", "1", "0.5", "0", "#00897B")
    make_connector(root, "c10", "tbl_pois", "tbl_poi_interests", "1:N", "0.5", "0", "0.5", "1", "#2E7D32")
    make_connector(root, "c11", "tbl_itineraries", "tbl_itinerary_scores", "1:1", "1", "0.3", "0", "0.3", "#6A1B9A")
    make_connector(root, "c12", "tbl_itineraries", "tbl_itinerary_days", "1:N", "1", "0.7", "0", "0.3", "#6A1B9A")
    make_connector(root, "c13", "tbl_itinerary_days", "tbl_itinerary_stops", "1:N", "0.5", "1", "0.5", "0", "#8E24AA")
    make_connector(root, "c14", "tbl_pois", "tbl_itinerary_stops", "1:N", "0", "0.7", "1", "0.4", "#2E7D32")
    make_connector(root, "c15", "tbl_pois", "tbl_saved_places", "1:N", "0", "0.3", "1", "0.5", "#2E7D32")
    make_connector(root, "c16", "tbl_cities", "tbl_pois", "1:N", "1", "0.5", "0", "0.9", "#00695C")
    make_connector(root, "c17", "tbl_poi_categories", "tbl_pois", "1:N", "0.5", "0", "0.5", "1", "#1B5E20")
    make_connector(root, "c18", "tbl_pois", "tbl_poi_opening_hours", "1:N", "1", "0.3", "0", "0.3", "#2E7D32")
    make_connector(root, "c19", "tbl_pois", "tbl_poi_sources", "1:N", "1", "0.7", "0", "0.3", "#2E7D32")

    return gm

def generate_sprint_4_erd():
    gm, root = create_graph_model(2000, 1200)
    make_banner(root, "banner", "GreenTrip AI — Sprint 4: Database Domain Model (Chen ERD)", 50, 20, 1800, 45, "#E8F5E9", "#388E3C", "#1B5E20")

    make_erd_entity(root, "ent_users", "users", 140, 140, 140, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_email_otps", "email_otps", 460, 140, 140, 50, False, "#E8EAF6", "#1A237E")
    make_erd_entity(root, "ent_saved_places", "saved_places", 460, 360, 150, 50, True, "#E0F7FA", "#00838F")
    make_erd_entity(root, "ent_trip_preferences", "trip_preferences", 780, 140, 170, 50, False, "#E3F2FD", "#1565C0")
    make_erd_entity(root, "ent_interests", "interests", 1120, 140, 140, 50, False, "#E0F2F1", "#00897B")
    make_erd_entity(root, "ent_transport_modes", "transport_modes", 140, 580, 160, 50, False, "#E0F7FA", "#006064")
    make_erd_entity(root, "ent_itineraries", "itineraries", 460, 580, 150, 50, False, "#F3E5F5", "#6A1B9A")
    make_erd_entity(root, "ent_itinerary_scores", "itinerary_scores", 460, 800, 160, 50, True, "#EDE7F6", "#4A148C")
    make_erd_entity(root, "ent_itinerary_days", "itinerary_days", 780, 800, 160, 50, False, "#F3E5F5", "#7B1FA2")
    make_erd_entity(root, "ent_itinerary_stops", "itinerary_stops", 1100, 580, 160, 50, False, "#F3E5F5", "#8E24AA")
    make_erd_entity(root, "ent_cities", "cities", 780, 420, 130, 50, False, "#E0F2F1", "#00695C")
    make_erd_entity(root, "ent_pois", "pois", 1420, 580, 140, 50, False, "#E8F5E9", "#2E7D32")
    make_erd_entity(root, "ent_poi_categories", "poi_categories", 1420, 260, 160, 50, False, "#E8F5E9", "#1B5E20")
    make_erd_entity(root, "ent_poi_hours", "poi_opening_hours", 1260, 820, 160, 50, False, "#E8F5E9", "#388E3C")
    make_erd_entity(root, "ent_poi_sources", "poi_sources", 1560, 820, 150, 50, False, "#E8F5E9", "#43A047")

    make_erd_relation(root, "rel_has_otp", "has_otp", 310, 140, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_pref", "has_pref", 550, 80, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_interest", "has_interest", 980, 140, 100, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_saves_poi", "saves_poi", 310, 260, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_creates", "creates", 310, 580, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_used_in", "used_in", 250, 700, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_scores", "has_scores", 490, 700, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_days", "has_days", 630, 700, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_stops", "has_stops", 950, 700, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_visits", "visits", 1280, 580, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_targets", "targets", 800, 280, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_for_city", "for_city", 640, 520, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_contains", "contains", 1120, 420, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_cat", "has_category", 1450, 420, 100, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_has_hours", "has_hours", 1310, 710, 90, 45, "#FFF9C4", "#F57F17")
    make_erd_relation(root, "rel_comes_from", "comes_from", 1520, 710, 90, 45, "#FFF9C4", "#F57F17")

    make_erd_edge(root, "e1", "ent_users", "rel_has_otp", "1")
    make_erd_edge(root, "e2", "rel_has_otp", "ent_email_otps", "N")
    make_erd_edge(root, "e3", "ent_users", "rel_has_pref", "1")
    make_erd_edge(root, "e4", "rel_has_pref", "ent_trip_preferences", "N")
    make_erd_edge(root, "e5", "ent_trip_preferences", "rel_has_interest", "M")
    make_erd_edge(root, "e6", "rel_has_interest", "ent_interests", "M")
    make_erd_edge(root, "e7", "ent_users", "rel_saves_poi", "1")
    make_erd_edge(root, "e8", "rel_saves_poi", "ent_saved_places", "N")
    make_erd_edge(root, "e9", "ent_users", "rel_creates", "1")
    make_erd_edge(root, "e10", "rel_creates", "ent_itineraries", "N")
    make_erd_edge(root, "e11", "ent_transport_modes", "rel_used_in", "1")
    make_erd_edge(root, "e12", "rel_used_in", "ent_itineraries", "N")
    make_erd_edge(root, "e13", "ent_itineraries", "rel_has_scores", "1")
    make_erd_edge(root, "e14", "rel_has_scores", "ent_itinerary_scores", "1")
    make_erd_edge(root, "e15", "ent_itineraries", "rel_has_days", "1")
    make_erd_edge(root, "e16", "rel_has_days", "ent_itinerary_days", "N")
    make_erd_edge(root, "e17", "ent_itinerary_days", "rel_has_stops", "1")
    make_erd_edge(root, "e18", "rel_has_stops", "ent_itinerary_stops", "N")
    make_erd_edge(root, "e19", "ent_itinerary_stops", "rel_visits", "N")
    make_erd_edge(root, "e20", "rel_visits", "ent_pois", "1")
    make_erd_edge(root, "e21", "ent_trip_preferences", "rel_targets", "1")
    make_erd_edge(root, "e22", "rel_targets", "ent_cities", "1")
    make_erd_edge(root, "e23", "ent_itineraries", "rel_for_city", "N")
    make_erd_edge(root, "e24", "rel_for_city", "ent_cities", "1")
    make_erd_edge(root, "e25", "ent_cities", "rel_contains", "1")
    make_erd_edge(root, "e26", "rel_contains", "ent_pois", "N")
    make_erd_edge(root, "e27", "ent_pois", "rel_has_cat", "N")
    make_erd_edge(root, "e28", "rel_has_cat", "ent_poi_categories", "1")
    make_erd_edge(root, "e29", "ent_pois", "rel_has_hours", "1")
    make_erd_edge(root, "e30", "rel_has_hours", "ent_poi_hours", "N")
    make_erd_edge(root, "e31", "ent_pois", "rel_comes_from", "1")
    make_erd_edge(root, "e32", "rel_comes_from", "ent_poi_sources", "N")

    return gm


# ==============================================================================
# MAIN EXECUTION: GENERATE ALL FILES INTO D:\diagram
# ==============================================================================

def main():
    out_dir = r"D:\diagram"
    os.makedirs(out_dir, exist_ok=True)

    print("Generating diagrams directly into D:\\diagram...")

    # 1. Sprint 1
    s1_schema = generate_sprint_1_schema()
    save_diagram_file(os.path.join(out_dir, "sprint_1_relational_schema.drawio"), "s1_schema", "Sprint 1 Relational Schema", s1_schema)

    s1_erd = generate_sprint_1_erd()
    save_diagram_file(os.path.join(out_dir, "sprint_1_chen_erd.drawio"), "s1_erd", "Sprint 1 Chen ERD", s1_erd)

    # 2. Sprint 2
    s2_schema = generate_sprint_2_schema()
    save_diagram_file(os.path.join(out_dir, "sprint_2_relational_schema.drawio"), "s2_schema", "Sprint 2 Relational Schema", s2_schema)

    s2_erd = generate_sprint_2_erd()
    save_diagram_file(os.path.join(out_dir, "sprint_2_chen_erd.drawio"), "s2_erd", "Sprint 2 Chen ERD", s2_erd)

    # 3. Sprint 3
    s3_schema = generate_sprint_3_schema()
    save_diagram_file(os.path.join(out_dir, "sprint_3_relational_schema.drawio"), "s3_schema", "Sprint 3 Relational Schema", s3_schema)

    s3_erd = generate_sprint_3_erd()
    save_diagram_file(os.path.join(out_dir, "sprint_3_chen_erd.drawio"), "s3_erd", "Sprint 3 Chen ERD", s3_erd)

    # 4. Sprint 4
    s4_schema = generate_sprint_4_schema()
    save_diagram_file(os.path.join(out_dir, "sprint_4_relational_schema.drawio"), "s4_schema", "Sprint 4 Relational Schema (17 Tables)", s4_schema)

    s4_erd = generate_sprint_4_erd()
    save_diagram_file(os.path.join(out_dir, "sprint_4_domain_model_erd.drawio"), "s4_erd", "Sprint 4 Domain Model Chen ERD", s4_erd)

    # 5. Consolidated Master Multi-Tab File
    master_diagrams = [
        ("s1_schema", "Sprint 1 - Schema", s1_schema),
        ("s1_erd", "Sprint 1 - Chen ERD", s1_erd),
        ("s2_schema", "Sprint 2 - Schema", s2_schema),
        ("s2_erd", "Sprint 2 - Chen ERD", s2_erd),
        ("s3_schema", "Sprint 3 - Schema", s3_schema),
        ("s3_erd", "Sprint 3 - Chen ERD", s3_erd),
        ("s4_schema", "Sprint 4 - Full Schema (17 Tables)", s4_schema),
        ("s4_erd", "Sprint 4 - Domain Model ERD", s4_erd),
    ]
    master_mxfile = build_mxfile(master_diagrams)
    master_tree = ET.ElementTree(master_mxfile)
    ET.indent(master_tree, space="  ")
    master_path = os.path.join(out_dir, "greentrip_database_master.drawio")
    master_tree.write(master_path, encoding="utf-8", xml_declaration=True)
    print(f"Saved master file with 8 tabs: {master_path}")

    print("All diagrams generated successfully in D:\\diagram!")

if __name__ == "__main__":
    main()
