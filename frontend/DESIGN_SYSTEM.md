# GreenTrip AI - Hệ thống Thiết kế (Design System)

Tài liệu này đóng vai trò là "kim chỉ nam" cho toàn bộ giao diện của dự án GreenTrip AI (Smart Travel Planner for Da Nang – Hue). Mọi màn hình và luồng thao tác đều cần tuân thủ nghiêm ngặt các quy tắc dưới đây để đảm bảo tính đồng bộ, chuyên nghiệp và thân thiện với người dùng.

*Lưu ý: Tài liệu này sẽ được cập nhật liên tục trong quá trình phát triển.*

---

## 1. Tinh thần cốt lõi (Core Vibe)
- **Phong cách:** Thân thiện + Xanh (Môi trường) + Di sản miền Trung. 
- **Đặc điểm:** Không gian mở, khoảng thở (padding) rộng, bo góc lớn mềm mại, sử dụng hình ảnh thật (chất lượng cao). 
- **Mục tiêu:** Giao diện gần gũi, rõ ràng, tối ưu cho người dùng trẻ đi du lịch tự túc; không quá "sang chảnh" gây cảm giác xa cách.

## 2. Bảng Màu (Color Palette)
Hệ màu lấy cảm hứng từ thiên nhiên (Rừng, Biển, Cát) và di sản:

*   **Màu chủ đạo (Primary - Xanh Rừng):**
    *   `#1F8A5B` (Sáng/Tươi): Dùng cho Nút bấm chính (Call to action), trạng thái active, chip đang chọn, huy hiệu Eco.
    *   `#2F5D50` (Đậm): Dùng cho Logo, Tiêu đề, chữ nhấn mạnh.
*   **Màu điểm nhấn (Accent - Vàng Nắng & Nâu Gỗ):**
    *   `#F5A524` (Vàng nắng): Dùng cho Icon Ngôi sao (đánh giá), huy hiệu nổi bật, các điểm nhấn vui tươi.
    *   `#8B5E3C` (Nâu gỗ/Huế): Dùng cho các tag liên quan đến Huế, di sản, hoặc nút phụ.
*   **Màu nền & Bề mặt (Backgrounds):**
    *   `#FCFAF5` (Kem - Cream): Màu nền tổng thể của toàn bộ Web/App.
    *   `#FFFFFF` (Trắng ngà - Ivory): Dùng cho các thẻ (Cards), Form nổi, Popup.
    *   `#EFE6D6` (Beige): Dùng làm viền (border), đường chia (divider), ô input.
*   **Màu chữ (Typography):**
    *   `#2B2622` (Charcoal): Chữ nội dung chính (body text).
    *   `#7A6F65` (Muted): Chữ phụ, caption, mô tả phụ.
*   **Màu chức năng:**
    *   Đỏ Marker: `#D93A2B` (Dùng riêng cho dấu chấm trên bản đồ).
    *   Đà Nẵng: Xanh biển `#1AA7B8`.

## 3. Kiểu chữ (Typography)
- **Font chính (Body/UI):** `Be Vietnam Pro` - Đảm bảo hiển thị Tiếng Việt có dấu chuẩn xác, hiện đại và dễ đọc.
- **Font điểm nhấn (Display/Heading):** `Fraunces` - Chỉ dùng cho 1-2 tiêu đề thật lớn trên mỗi màn hình (ví dụ: Slogan trang đăng nhập) để tạo cảm giác sang trọng, di sản. Không lạm dụng cho mọi tiêu đề nhỏ.

## 4. UI Components (Thành phần giao diện)
- **Độ bo góc (Border Radius):** 
  - Card/Khối lớn: `rounded-2xl` (16px) hoặc `rounded-3xl` (24px).
  - Nút bấm/Input: `rounded-xl` (12px).
  - Chip/Tag: `rounded-full` (bo tròn hoàn toàn).
- **Bóng đổ (Shadow):** 
  - Đổ bóng cực kỳ mềm và nhạt (`shadow-soft` hoặc `shadow-card`).
  - Khi hover vào Card: Nâng nhẹ (`translate-y`) và tăng bóng đổ, viền chuyển sang màu xanh lá để phản hồi tương tác.
- **Hình ảnh:**
  - Sử dụng ảnh phong cảnh thật, chất lượng cao.
  - Các ảnh thumbnail/nền luôn áp dụng một lớp phủ (tint overlay hoặc mix-blend-multiply) nhẹ để làm đồng bộ màu sắc ảnh với tông màu tổng thể của App.

## 5. Quy chuẩn Bản đồ (Map Standards)
- **Nguồn bản đồ:** Google Maps (để có màu nước biển xanh, cây cỏ và đường sá quen thuộc).
- **Style:** Clean (Sạch). Phải ẩn toàn bộ các biểu tượng rác (POIs - `s.t:2`, Transit - `s.t:4`, Icons - `s.e:l.i`) để không làm nhiễu dữ liệu.
- Các địa điểm của App luôn là "Chấm đỏ" nổi bật nhất trên nền bản đồ.

---
*(Phần dưới này dành để bổ sung các tài liệu và quy chuẩn luồng thao tác sắp tới...)*

## 6. Quy tắc UX/UI (Cập nhật từ tài liệu tham khảo đợt 1)
Dựa trên các best-practice về trải nghiệm người dùng, các thành phần tương tác cần tuân thủ:

1. **Hiệu ứng tải dữ liệu (Loading State):** 
   - Tuyệt đối sử dụng **Skeleton Loading** (các khối xám mờ nhấp nháy mô phỏng hình dáng nội dung) thay vì dùng vòng quay (Spinner) cổ điển. Điều này giúp giảm cảm giác chờ đợi và giữ cấu trúc layout ổn định.
2. **Quy tắc Bo góc lồng nhau (Nested Border Radius):**
   - Khi đặt một phần tử có bo góc vào bên trong một thẻ (card) cũng có bo góc, **bán kính bo góc của phần tử bên trong phải nhỏ hơn phần tử bên ngoài** để tạo cảm giác thuận mắt. (Ví dụ: Card ngoài bo `24px` -> Ảnh bên trong bo `16px`).
3. **Khoảng cách nhóm thông tin (Grouping & Spacing):**
   - Áp dụng quy tắc khoảng cách để thể hiện sự liên quan. Tiêu đề của ô nhập liệu (Label) phải nằm gần ô nhập liệu đó hơn (VD: `12px`) so với khoảng cách đến nhóm nhập liệu phía trên (VD: `24px`).
4. **Bộ lọc dải giá trị (Range Filters):**
   - Luôn ưu tiên sử dụng **Thanh trượt (Slider)** trực quan cho các bộ lọc khoảng giá trị (như Ngân sách, Quãng đường, Điểm số) thay vì bắt người dùng gõ tay vào hai ô nhập liệu (Từ... Đến...).
5. **Lựa chọn số lượng ít (Options Selection):**
   - Nếu một trường dữ liệu chỉ có 2-3 tùy chọn (Ví dụ: Có/Không, Nam/Nữ), hãy phơi bày tất cả ra bằng **Radio Button** hoặc **Segmented Control** thay vì giấu chúng vào trong một Dropdown (Select box) bắt người dùng phải tốn thêm 1 click để mở.

6. **Kiểu dáng Ô nhập liệu (Input Fields):**
   - Luôn sử dụng **khối hộp có viền (Box/Border)** bao quanh toàn bộ ô nhập liệu. Hạn chế sử dụng kiểu gạch dưới (Underline) vì kiểu hộp có viền giúp người dùng xác định rõ ràng hơn vùng có thể click vào.
7. **Tìm kiếm trong Danh sách (Searchable Dropdown):**
   - Với các danh sách thả xuống (Dropdown/Select) dài như chọn Tỉnh/Thành, Quốc gia,... luôn **cho phép người dùng gõ từ khóa để tìm kiếm (Search and Scroll)** thay vì chỉ bắt họ cuộn tay tìm thủ công.
8. **Khoảng cách trong Lưới (Consistent Grid Gaps):**
   - Khi thiết kế các dạng lưới (Grid) như danh sách địa điểm, luôn sử dụng **khoảng cách (gap) đồng nhất** giữa các hàng và các cột (Ví dụ: `gap-4` cho cả chiều ngang và dọc) để tạo sự cân đối và gọn gàng.
9. **Lựa chọn từ Danh sách dài (Toggle Tokens/Chips):**
   - Khi người dùng cần chọn nhiều mục từ một danh sách dài (Ví dụ: Chọn Sở thích, Tiêu chí lọc), hãy chuyển chúng thành dạng **Các thẻ tag/chip (Toggle Tokens)** xếp thành lưới gọn gàng, thay vì dùng một danh sách dài các ô Checkbox dọc từ trên xuống dưới.
10. **Gợi ý trong ô Tìm kiếm (Search Placeholders):**
    - Đừng chỉ để chữ "Tìm kiếm" hay "Search" chung chung. Hãy đặt placeholder cụ thể **gợi ý cho người dùng biết họ có thể tìm gì**. (Ví dụ: thay vì "Tìm kiếm", hãy dùng *"Tìm địa điểm, món ăn, chùa chiền..."* - App GreenTrip hiện tại đang làm rất tốt quy tắc này).

11. **Tuyệt đối không dùng Placeholder thay thế cho Label:**
    - Mỗi ô nhập liệu luôn phải có Tiêu đề (Label) nằm bên ngoài (thường là phía trên). Placeholder bên trong chỉ đóng vai trò làm mẫu (Ví dụ: Label "Email", Placeholder "vi_du@gmail.com"). Không ép người dùng phải nhớ ô đó dùng để nhập gì sau khi họ đã gõ chữ vào.
12. **Nút "Đọc thêm" (Read More) cho văn bản dài:**
    - Không bao giờ hiển thị một khối văn bản quá dài trên thẻ (card) hoặc popup. Hãy cắt gọn (truncate) ở khoảng 3-4 dòng đầu tiên và đặt thêm nút/link "Đọc thêm" hoặc "Xem thêm" để người dùng tự quyết định có muốn mở rộng hay không.
13. **Hệ thống Cấp bậc Thông tin (Visual Hierarchy & Prioritization):**
    - Phải phân rõ chính - phụ. Số liệu hoặc thông tin quan trọng nhất phải được thiết kế to, đậm và nổi bật nhất. Các nhãn dán (Label) hoặc mô tả phụ nên được làm nhỏ lại và có màu nhạt hơn (Ví dụ: Số tiền lớn, chữ "Doanh thu" nhỏ).
14. **Giao diện Input theo đặc thù dữ liệu (OTP/Code):**
    - Thiết kế hình dáng của ô nhập liệu khớp với loại dữ liệu mong muốn. Ví dụ kinh điển nhất: Khi yêu cầu nhập mã OTP 4 số hoặc 6 số, hãy tách chúng thành 4 hoặc 6 ô vuông rời nhau, thay vì gộp chung vào một thanh input dài ngoẵng.
15. **Duy nhất một Nút bấm Chính (Primary Button):**
    - Trong mọi luồng hành động (đặc biệt là các hộp thoại/popup xác nhận), chỉ được phép có **DUY NHẤT một nút bấm chính (Primary Button)** mang màu nền nổi bật. Các nút phụ trợ (như "Hủy", "Bỏ qua") phải được làm chìm xuống (dùng màu xám nhạt, màu viền hoặc text link) để tránh gây rối loạn thị giác và hành vi bấm nhầm.

16. **Nhất quán Phong cách (Style Consistency):**
    - Trong cùng một nhóm chức năng (như danh sách tùy chọn, danh sách nút bấm), phải giữ phong cách thiết kế **đồng nhất hoàn toàn** về màu sắc, bo góc và trạng thái (fill/outline). Không được trộn lẫn các thẻ (chips) có màu nền lộn xộn hoặc kiểu dáng khác nhau trong cùng một cụm.
17. **Ngôn từ Nút bấm (Actionable Button Text):**
    - Chữ trên nút bấm phải là một **Động từ chỉ hành động cụ thể** (Ví dụ: "Gửi", "Hủy", "Xóa", "Lưu"). Hạn chế tối đa việc dùng các từ chung chung như "Có / Không" (Yes / No) trong các hộp thoại xác nhận, vì người dùng thường lười đọc câu hỏi mà chỉ nhìn vào nút.
18. **Tiết chế độ rực rỡ (Color Saturation):**
    - Đặc biệt trong giao diện tối (Dark Mode) hoặc trên nền màu tối, **tuyệt đối không dùng các màu quá rực (neon/chói)** cho nút bấm. Hãy giảm độ bão hòa (saturation) xuống một chút để màu sắc dịu lại, tránh gây nhức mắt cho người dùng. (Ví dụ: Nút xanh `Forest` của chúng ta đã được pha thêm chút sắc xám/đen để nhìn dịu hơn).
19. **Vị trí Nút CTA trên Mobile (Thumb Zone):**
    - Nút bấm hành động chính (Call To Action) của một khối nội dung hoặc một màn hình trên điện thoại phải luôn được đặt **ở phía dưới cùng**. Đây là "vùng ngón cái" (Thumb area), giúp người dùng dễ dàng chạm tới bằng một tay mà không cần rướn ngón tay lên trên cùng của màn hình.
