# User Flow: In-Planner Copilot POI Advice & Feasibility

This user flow maps the complete interaction journey of a traveler asking qualitative advice about attractions within the Planner Copilot.

```mermaid
flowchart TD
    Start([Du khách mở tab Trợ lý AI trên Planner]) --> InputMsg[/Nhập câu hỏi: 'tôi có nên đi bán đảo sơn trà không'/]
    InputMsg --> SubmitClick[Bấm nút Gửi hoặc ấn Enter]
    
    SubmitClick --> ClientOptimistic[Frontend hiển thị tin nhắn user ngay lập tức]
    ClientOptimistic --> CallBackend[POST /api/v1/trips/copilot/chat]
    
    subgraph Backend_Routing["Backend Intent Routing (detect_copilot_intent)"]
        CallBackend --> MatchKeyword{Khớp pattern hỏi ý kiến/tư vấn?<br/>'có nên đi', 'có nên ghé', 'có gì hay'}
        MatchKeyword -- Có --> IntentPoiAdvice[intent = 'poi_advice']
        MatchKeyword -- Không --> CheckOtherIntents{Khớp meal, rainy, late, night?}
        CheckOtherIntents -- Có --> RunExistingHandler[Chạy handler tương ứng]
        CheckOtherIntents -- Không --> FallbackGeneral[Trả về general_chat hướng dẫn]
    end
    
    subgraph POI_Advisor_Handler["POI Advice Handler (handle_poi_advice)"]
        IntentPoiAdvice --> ExtractPoiName[Trích xuất tên địa danh: 'Bán Đảo Sơn Trà']
        ExtractPoiName --> QueryDb[(Truy vấn PostgreSQL public.pois)]
        QueryDb --> MatchFound{Tìm thấy POI?}
        
        MatchFound -- Có --> GenAdvice[Tạo phản hồi tư vấn 3 phần:<br/>1. Nhận định 'Có/Nên'<br/>2. Vì sao nên đi<br/>3. Lưu ý & Khi nào cân nhắc]
        GenAdvice --> AttachPoiCard[Đính kèm POI Card với 5 ảnh gallery, rating, eco-score]
        AttachPoiCard --> GenQuickChips[Tạo 3 quick prompt chips liên quan]
        
        MatchFound -- Không --> SuggestFallback[Gợi ý danh thắng nổi bật Đà Nẵng - Huế]
    end
    
    GenQuickChips --> ReturnJson[/Trả về CopilotChatResponse JSON/]
    ReturnJson --> RenderAssistantMsg[Frontend hiển thị câu trả lời có định dạng]
    RenderAssistantMsg --> RenderCardInChat[Hiển thị thẻ POI card trực quan ngay trong tin nhắn chat]
    
    subgraph User_Action_Options["Tương tác của người dùng trên thẻ POI"]
        RenderCardInChat --> ClickMap[Bấm 'Xem trên bản đồ']
        RenderCardInChat --> ClickAdd[Bấm 'Thêm vào ngày X' hoặc 'Lưu vào ý tưởng']
        RenderCardInChat --> ClickDetail[Bấm vào ảnh thẻ để xem chi tiết lớn]
        RenderCardInChat --> ClickChip[Bấm chọn 1 trong 3 câu hỏi gợi ý tiếp theo]
    end
    
    ClickMap --> CenterMap[Bản đồ bên phải tự động bay tới tọa độ POI & mở InfoWindow]
    ClickAdd --> MutateTrip[Cập nhật state chuyến đi & Timeline ngày hiện tại]
    ClickDetail --> OpenDetailModal[Mở PoiDetailSection modal với 5 ảnh gallery riêng biệt]
    ClickChip --> AutoSendQuery[Tự động điền & gửi câu hỏi mới vào Copilot]
    
    CenterMap --> Done([Hoàn tất tương tác])
    MutateTrip --> Done
    OpenDetailModal --> Done
    AutoSendQuery --> SubmitClick
```
