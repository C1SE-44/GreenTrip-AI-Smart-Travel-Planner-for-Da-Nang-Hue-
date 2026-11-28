"""Tool Registry and execution dispatcher for GreenTrip AI Assistant."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any
from pydantic import BaseModel, ValidationError

from app.tools import implementations
from app.tools import schemas

logger = logging.getLogger(__name__)


class ToolDefinition(BaseModel):
    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]

    model_config = {"arbitrary_types_allowed": True}


class ToolRegistry:
    """Central registry and controlled execution sandbox for LLM tools."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, Callable[[Any], BaseModel]] = {}

    def register(
        self,
        name: str,
        description: str,
        input_model: type[BaseModel],
        output_model: type[BaseModel],
        handler: Callable[[Any], BaseModel],
    ) -> None:
        self._tools[name] = ToolDefinition(
            name=name,
            description=description,
            input_model=input_model,
            output_model=output_model,
        )
        self._handlers[name] = handler
        logger.debug("Registered tool: %s", name)

    def get_tool(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())

    def get_gemini_tool_declarations(self) -> list[dict[str, Any]]:
        """Export function calling declarations compatible with Gemini API."""
        declarations = []
        for name, tool in self._tools.items():
            schema = tool.input_model.model_json_schema()
            # Clean schema for Gemini function declaration
            declarations.append({
                "name": name,
                "description": tool.description,
                "parameters": {
                    "type": "OBJECT",
                    "properties": schema.get("properties", {}),
                    "required": schema.get("required", []),
                },
            })
        return declarations

    def execute_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Safely execute a tool with input schema validation and error isolation.
        Guarantees structured dict output, never raises uncaught exceptions to caller.
        """
        tool = self._tools.get(name)
        handler = self._handlers.get(name)

        if not tool or not handler:
            logger.warning("Attempted to execute unregistered tool: %s", name)
            return {
                "success": False,
                "error": f"Tool '{name}' is not registered or not permitted.",
                "tool_name": name,
            }

        # 1. Validate input schema
        try:
            validated_input = tool.input_model.model_validate(arguments)
        except ValidationError as val_err:
            logger.warning("Tool %s validation failed: %s", name, val_err)
            return {
                "success": False,
                "error": f"Invalid arguments for tool '{name}': {val_err.errors()}",
                "tool_name": name,
            }

        # 2. Execute handler in protected block
        try:
            raw_output = handler(validated_input)
            output_data = (
                raw_output.model_dump()
                if isinstance(raw_output, BaseModel)
                else dict(raw_output)
            )
            return {
                "success": True,
                "tool_name": name,
                "data": output_data,
            }
        except Exception as exc:
            logger.exception("Error executing tool %s: %s", name, exc)
            return {
                "success": False,
                "error": f"Execution error in tool '{name}': {str(exc)}",
                "tool_name": name,
            }


_default_registry: ToolRegistry | None = None


def get_default_tool_registry() -> ToolRegistry:
    """Factory creating and caching the global tool registry with all GreenTrip tools."""
    global _default_registry
    if _default_registry is not None:
        return _default_registry

    registry = ToolRegistry()

    # Tool 1: search_pois
    registry.register(
        name="search_pois",
        description="Tìm kiếm danh sách địa điểm theo từ khóa, thành phố (Danang/Hue) hoặc danh mục.",
        input_model=schemas.SearchPoisInput,
        output_model=schemas.SearchPoisOutput,
        handler=implementations.search_pois,
    )

    # Tool 2: get_poi_details
    registry.register(
        name="get_poi_details",
        description="Lấy thông tin chi tiết đầy đủ của một địa điểm du lịch bằng POI ID.",
        input_model=schemas.GetPoiDetailsInput,
        output_model=schemas.GetPoiDetailsOutput,
        handler=implementations.get_poi_details,
    )

    # Tool 3: recommend_pois
    registry.register(
        name="recommend_pois",
        description="Gợi ý danh sách địa điểm phù hợp theo sở thích du khách (ẩm thực, di sản, thiên nhiên, chay...) và ngân sách.",
        input_model=schemas.RecommendPoisInput,
        output_model=schemas.RecommendPoisOutput,
        handler=implementations.recommend_pois,
    )

    # Tool 4: get_poi_explanation
    registry.register(
        name="get_poi_explanation",
        description="Truy vấn Knowledge Graph (Neo4j) để giải thích lý do vì sao địa điểm được đề xuất (kinh doanh bản địa, danh mục di sản, hoạt động văn hóa...).",
        input_model=schemas.GetPoiExplanationInput,
        output_model=schemas.GetPoiExplanationOutput,
        handler=implementations.get_poi_explanation,
    )

    # Tool 5: calculate_trip_cost
    registry.register(
        name="calculate_trip_cost",
        description="Tính toán ước tính chi phí chuyến đi và phân bổ ngân sách (lưu trú, ăn uống, di chuyển xanh, vé tham quan).",
        input_model=schemas.CalculateTripCostInput,
        output_model=schemas.CalculateTripCostOutput,
        handler=implementations.calculate_trip_cost,
    )

    # Tool 6: get_route_information
    registry.register(
        name="get_route_information",
        description="Tính khoảng cách thực tế (mét) và thời gian di chuyển (giây) giữa 2 tọa độ theo đường bộ (OSRM).",
        input_model=schemas.GetRouteInformationInput,
        output_model=schemas.GetRouteInformationOutput,
        handler=implementations.get_route_information,
    )

    # Tool 7: get_carbon_estimate
    registry.register(
        name="get_carbon_estimate",
        description="Tính lượng phát thải CO2 theo quãng đường di chuyển và gợi ý phương tiện xanh thay thế.",
        input_model=schemas.GetCarbonEstimateInput,
        output_model=schemas.GetCarbonEstimateOutput,
        handler=implementations.get_carbon_estimate,
    )

    # Tool 8: rag_travel_knowledge
    registry.register(
        name="rag_travel_knowledge",
        description="Truy xuất dữ liệu văn bản kiểm chứng (RAG) về lịch sử, văn hóa, ẩm thực chay, mẹo du lịch xanh tại Đà Nẵng và Huế kèm nguồn trích dẫn.",
        input_model=schemas.RAGTravelKnowledgeInput,
        output_model=schemas.RAGTravelKnowledgeOutput,
        handler=implementations.rag_travel_knowledge,
    )

    # Tool 9: generate_itinerary
    registry.register(
        name="generate_itinerary",
        description="Khởi tạo lịch trình du lịch xanh chi tiết theo ngày tại Đà Nẵng và Huế (tối ưu hóa quãng đường di chuyển, ngân sách, khí thải CO2, giờ mở cửa và sở thích du khách).",
        input_model=schemas.GenerateItineraryInput,
        output_model=schemas.GenerateItineraryOutput,
        handler=implementations.generate_itinerary,
    )

    # Tool 10: update_itinerary
    registry.register(
        name="update_itinerary",
        description="Cập nhật hoặc tinh chỉnh lịch trình hiện tại theo yêu cầu hội thoại (giảm số điểm dừng, bỏ điểm dừng cụ thể, thêm quán ăn, đổi phương tiện xanh hoặc điều chỉnh ngân sách).",
        input_model=schemas.UpdateItineraryInput,
        output_model=schemas.UpdateItineraryOutput,
        handler=implementations.update_itinerary,
    )

    # Tool 11: recommend_transport_mode
    registry.register(
        name="recommend_transport_mode",
        description="Đề xuất và so sánh đa tiêu chí các phương tiện di chuyển (đi bộ, xe buýt điện, xe máy, taxi, tàu hỏa Đà Nẵng-Huế) giữa 2 điểm hoặc theo cự ly, tối ưu thời gian, chi phí và phát thải CO2.",
        input_model=schemas.RecommendTransportModeInput,
        output_model=schemas.RecommendTransportModeOutput,
        handler=implementations.recommend_transport_mode,
    )

    _default_registry = registry
    return _default_registry
