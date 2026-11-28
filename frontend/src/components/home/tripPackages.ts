import { normalizePois, type BackendPoiItem, type Poi, type PoiCity } from '@/data/pois';
import type { DailyItineraryOutline } from '@/services/tripService';
import curatedPackagePoiRecords from '@/data/tripPackagePois.json';

type PackageStopSpec = {
  names: string[];
  timeSlot: string;
};

type PackageDaySpec = {
  city: PoiCity;
  theme: string;
  stops: PackageStopSpec[];
};

type PackageStaySpec = {
  city: PoiCity;
  names: string[];
};

type ResolvedPackageDay = Omit<PackageDaySpec, 'stops'> & {
  stops: Array<PackageStopSpec & { poi: Poi }>;
};

export interface TripPackageDefinition {
  id: string;
  title: string;
  destination: PoiCity | 'Đà Nẵng & Huế';
  theme: 'food' | 'heritage' | 'eco' | 'family' | 'luxury' | 'checkin' | 'budget' | 'coffee' | 'spiritual' | 'shopping' | 'couple' | 'adventure' | 'rainy' | 'route';
  label: string;
  summary: string;
  season: string;
  stays: PackageStaySpec[];
  days: PackageDaySpec[];
}

export interface ResolvedTripPackage {
  definition: TripPackageDefinition;
  stays: Poi[];
  days: ResolvedPackageDay[];
  coverPoi: Poi;
  coverImage: string;
  coverImageAlt: string;
  launch: TripPackageLaunch;
}

export interface TripPackageLaunch {
  title: string;
  destination: string;
  daysCount: number;
  poiIds: string[];
  coverImage: string;
  itineraryOutline: DailyItineraryOutline[];
}

const PACKAGE_DEFINITIONS: TripPackageDefinition[] = [
  {
    id: 'danang-food-and-sea-3d',
    title: 'Đà Nẵng 3 ngày: Ẩm thực, biển và sông Hàn',
    destination: 'Đà Nẵng',
    theme: 'food',
    label: 'Ẩm thực & biển',
    summary: 'Ba ngày theo chủ đề riêng: món địa phương, bãi biển và trải nghiệm chợ đêm.',
    season: 'Tháng 2–8; xem dự báo thời tiết trước chuyến đi.',
    stays: [{ city: 'Đà Nẵng', names: ['Seahorse Signature Da Nang Hotel By Sujet of Haviland'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Ẩm thực địa phương và chợ truyền thống', stops: [
        { names: ['Chợ Cồn'], timeSlot: '08:30 - 10:00' },
        { names: ['Mì Quảng Bà Mua'], timeSlot: '11:00 - 12:00' },
        { names: ['Bánh Tráng Kẹp Dì Hoa'], timeSlot: '15:30 - 16:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Biển và hải sản', stops: [
        { names: ['Bãi Biển Non Nước'], timeSlot: '08:00 - 10:00' },
        { names: ['Hải Sản Năm Đảnh'], timeSlot: '17:30 - 19:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Đặc sản và chợ đêm', stops: [
        { names: ['Chợ Bắc Mỹ An (Thiên Đường Ăn Vặt Giá Sinh Viên)'], timeSlot: '09:00 - 10:30' },
        { names: ['Chè Sầu Liên'], timeSlot: '14:30 - 15:30' },
        { names: ['Chợ Đêm Helio'], timeSlot: '19:00 - 20:30' },
      ] },
    ],
  },
  {
    id: 'hue-heritage-3d',
    title: 'Huế 3 ngày: Di sản, vườn nhà và ẩm thực',
    destination: 'Huế',
    theme: 'heritage',
    label: 'Di sản & văn hóa',
    summary: 'Lịch trình di sản cụ thể gồm Đại Nội, nhà vườn An Hiên và hai lăng tẩm.',
    season: 'Tháng 1–4 và tháng 8–9; chú ý dự báo mưa lớn cuối năm.',
    stays: [{ city: 'Huế', names: ['Dạ Homestay Huế'] }],
    days: [
      { city: 'Huế', theme: 'Kinh thành và cổ vật triều Nguyễn', stops: [
        { names: ['Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)'], timeSlot: '08:30 - 11:00' },
        { names: ['Bảo Tàng Cổ Vật Cung Đình Huế'], timeSlot: '14:00 - 15:30' },
      ] },
      { city: 'Huế', theme: 'Nhà vườn và nhịp sống bên sông Hương', stops: [
        { names: ['Nhà Vườn An Hiên (Bảo Tàng Sống Về Kiến Trúc Nhà Vườn Quan Lại Xứ Huế)'], timeSlot: '10:00 - 11:30' },
        { names: ['Cụm Kiến Trúc Nghinh Lương Đình & Phu Văn Lâu (Hình Ảnh Trên Tờ Tiền 50.000 VNĐ)'], timeSlot: '16:00 - 17:00' },
      ] },
      { city: 'Huế', theme: 'Kiến trúc lăng tẩm', stops: [
        { names: ['Lăng Khải Định (Ứng Lăng)'], timeSlot: '08:30 - 10:30' },
        { names: ['Lăng Minh Mạng (Hiếu Lăng)'], timeSlot: '13:30 - 15:30' },
      ] },
    ],
  },
  {
    id: 'sontra-eco-3d',
    title: 'Đà Nẵng 3 ngày: Thiên nhiên Sơn Trà',
    destination: 'Đà Nẵng',
    theme: 'eco',
    label: 'Thiên nhiên & biển',
    summary: 'Ba ngày khám phá vùng núi, bán đảo và bãi tự nhiên; cần kiểm tra thời tiết, đường đi và quy định khu vực.',
    season: 'Tháng 2–8; kiểm tra thời tiết và điều kiện đường Sơn Trà.',
    stays: [{ city: 'Đà Nẵng', names: ['Làng Toom Sara Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Khám phá sinh thái Hòa Bắc', stops: [
        { names: ['Khe Răm & Suối Tiên Hòa Bắc (Tắm Suối Tự Nhiên)'], timeSlot: '08:00 - 11:00' },
        { names: ['Du Lịch Cộng Đồng Thôn Tà Lang - Giàn Bí'], timeSlot: '14:00 - 16:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Bán đảo Sơn Trà và chùa Linh Ứng', stops: [
        { names: ['Cây Đa Ngàn Năm Sơn Trà (Cây Di Sản Việt Nam)'], timeSlot: '08:00 - 09:30' },
        { names: ['Mũi Nghê (Nơi Đón Ánh Bình Minh Đầu Tiên Của Đà Nẵng)'], timeSlot: '10:30 - 13:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Bờ biển và dấu tích tự nhiên', stops: [
        { names: ['Rạn Nam Ô (Ghềnh Đá Rêu Xanh)'], timeSlot: '06:30 - 08:30' },
        { names: ['Bãi Tiên Sa'], timeSlot: '14:00 - 16:00' },
      ] },
    ],
  },
  {
    id: 'danang-family-2d',
    title: 'Đà Nẵng 2 ngày: Gia đình và vui chơi',
    destination: 'Đà Nẵng',
    theme: 'family',
    label: 'Gia đình & vui chơi',
    summary: 'Dành một ngày cho khu Sun World Bà Nà Hills và một ngày cho bảo tàng tương tác, biển.',
    season: 'Tháng 2–8; xác nhận giờ hoạt động và vé Sun World trước khi đi.',
    stays: [{ city: 'Đà Nẵng', names: ['Sena homestay Cầu Rồng Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Dành trọn ngày khám phá Bà Nà Hills', stops: [
        { names: ['Cầu Vàng (Sun World Bà Nà Hills)'], timeSlot: '09:00 - 10:00' },
        { names: ['Bảo Tàng Tượng Sáp Bà Nà Hills (Wax Museum)'], timeSlot: '10:30 - 11:30' },
        { names: ['Chùa Linh Ứng Bà Nà'], timeSlot: '13:30 - 14:30' },
        { names: ['Đỉnh Núi Chúa – Sun World Bà Nà Hills'], timeSlot: '15:00 - 16:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Trải nghiệm trong nhà và công viên giải trí', stops: [
        { names: ['Bảo Tàng Tranh 3D Art In Paradise Đà Nẵng'], timeSlot: '09:30 - 11:30' },
        { names: ['Tổ Hợp Da Nang Downtown (Công Viên Châu Á – Vòng Quay Sun Wheel)'], timeSlot: '16:00 - 19:00' },
      ] },
    ],
  },
  {
    id: 'danang-luxury-3d',
    title: 'Đà Nẵng 3 ngày: Nghỉ dưỡng cao cấp',
    destination: 'Đà Nẵng',
    theme: 'luxury',
    label: 'Nghỉ dưỡng cao cấp',
    summary: 'Lưu trú tại Naman Retreat; các điểm chọn lọc theo cụm Ngũ Hành Sơn và trung tâm.',
    season: 'Tháng 2–8; xem dự báo thời tiết trước chuyến đi.',
    stays: [{ city: 'Đà Nẵng', names: ['Naman Retreat'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Danh thắng Ngũ Hành Sơn', stops: [
        { names: ['Danh thắng Ngũ Hành Sơn'], timeSlot: '08:30 - 10:30' },
        { names: ['Chùa Quán Thế Âm (Ngũ Hành Sơn)'], timeSlot: '14:30 - 15:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Ẩm thực cao cấp', stops: [
        { names: ['La Maison 1888 – InterContinental Danang Sun Peninsula Resort (Đạt 1 Sao MICHELIN)'], timeSlot: '18:00 - 20:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Ngắm vịnh và thư giãn', stops: [
        { names: ['Sơn Trà Marina'], timeSlot: '08:30 - 10:00' },
        { names: ['Horizon Bar – Four Points by Sheraton Danang (Rooftop Tầng 36)'], timeSlot: '17:00 - 18:30' },
      ] },
    ],
  },
  {
    id: 'danang-checkin-2d',
    title: 'Đà Nẵng 2 ngày: Check-in biểu tượng',
    destination: 'Đà Nẵng',
    theme: 'checkin',
    label: 'Check-in biểu tượng',
    summary: 'Các cây cầu, công viên kiến trúc và quảng trường thành phố; không bao gồm tuyến xa Bà Nà Hills.',
    season: 'Tháng 2–8; xác nhận lịch hoạt động của từng điểm.',
    stays: [{ city: 'Đà Nẵng', names: ['Sena homestay Cầu Rồng Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Các cây cầu trung tâm', stops: [
        { names: ['Cầu Tình Yêu & Tượng Cá Chép Hóa Rồng'], timeSlot: '17:00 - 18:00' },
        { names: ['Cầu Rồng'], timeSlot: '18:00 - 19:00' },
        { names: ['Cầu Trần Thị Lý & Cầu Đi Bộ Nguyễn Văn Trỗi'], timeSlot: '19:30 - 20:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Không gian công cộng và kiến trúc', stops: [
        { names: ['Công Viên APEC (Vòm Kiến Trúc "Cánh Diều Bay Cao")'], timeSlot: '08:00 - 09:00' },
        { names: ['Nhà Trưng Bày Hoàng Sa'], timeSlot: '09:30 - 11:00' },
        { names: ['Cầu Thuận Phước (Cầu Treo Dây Võng Dài Nhất Việt Nam)'], timeSlot: '16:30 - 17:30' },
      ] },
    ],
  },
  {
    id: 'hue-budget-2d',
    title: 'Huế 2 ngày: Tiết kiệm và đặc sản địa phương',
    destination: 'Huế',
    theme: 'budget',
    label: 'Tiết kiệm',
    summary: 'Ưu tiên chợ, món bình dân và không gian công cộng; chi phí món ăn/vé chưa được bảo đảm trong dữ liệu.',
    season: 'Tháng 1–4 và tháng 8–9; chú ý dự báo mưa lớn cuối năm.',
    stays: [{ city: 'Huế', names: ['RubyHome Hotel'] }],
    days: [
      { city: 'Huế', theme: 'Chợ địa phương và bờ sông', stops: [
        { names: ['Chợ An Cựu'], timeSlot: '08:30 - 10:00' },
        { names: ['Bún Bò Bà Gái'], timeSlot: '11:00 - 12:00' },
        { names: ['Ga Huế (Một Trong Những Nhà Ga Cổ Và Đẹp Nhất Việt Nam)'], timeSlot: '16:00 - 17:00' },
      ] },
      { city: 'Huế', theme: 'Ẩm thực và đời sống trong kinh thành', stops: [
        { names: ['Chợ Bến Ngự'], timeSlot: '08:30 - 10:00' },
        { names: ['Cơm Hến Hoa Đông (Cồn Hến)'], timeSlot: '11:00 - 12:00' },
        { names: ['Công Viên Thương Bạc & Cồn Dã Viên'], timeSlot: '16:00 - 17:00' },
      ] },
    ],
  },
  {
    id: 'hue-coffee-chill-2d',
    title: 'Huế 2 ngày: Cà phê và ngắm cảnh',
    destination: 'Huế',
    theme: 'coffee',
    label: 'Cà phê & chill',
    summary: 'Mỗi ngày một quán cà phê khác nhau, kèm thời gian thư thả bên sông và khu phố cổ.',
    season: 'Tháng 1–4 và tháng 8–9; ưu tiên ngày khô ráo cho Đồi Vọng Cảnh.',
    stays: [{ city: 'Huế', names: ['CODO Boutique Stay'] }],
    days: [
      { city: 'Huế', theme: 'Cà phê phố và dạo bờ sông', stops: [
        { names: ['Gác Trịnh – Không Gian Văn Hóa & Cafe Nhạc Trịnh Công Sơn'], timeSlot: '09:00 - 10:00' },
        { names: ['Cầu Dã Viên & Cồn Dã Viên (Điểm Ngắm Hoàng Hôn Sông Hương Đẹp Nhất)'], timeSlot: '16:30 - 17:30' },
      ] },
      { city: 'Huế', theme: 'Đồi Vọng Cảnh và cà phê sân vườn', stops: [
        { names: ['Huế Cafe Roastery'], timeSlot: '09:00 - 10:00' },
        { names: ['Phố Cổ Bao Vinh'], timeSlot: '16:00 - 17:30' },
      ] },
    ],
  },
  {
    id: 'hue-spiritual-2d',
    title: 'Huế 2 ngày: Chùa và không gian thiền',
    destination: 'Huế',
    theme: 'spiritual',
    label: 'Tâm linh & thiền',
    summary: 'Các điểm chùa và cơ sở tín ngưỡng cụ thể; kiểm tra quy định thăm viếng và chọn trang phục phù hợp.',
    season: 'Tháng 1–4 và tháng 8–9; kiểm tra thời tiết trước khi đi.',
    stays: [{ city: 'Huế', names: ['Khách Sạn Pilgrimage Village'] }],
    days: [
      { city: 'Huế', theme: 'Không gian thiền phía tây nam thành phố', stops: [
        { names: ['Chùa Từ Hiếu & Làng Mai'], timeSlot: '08:00 - 09:30' },
        { names: ['Chùa Thiền Lâm (Chùa Phật Đứng)'], timeSlot: '10:00 - 11:30' },
        { names: ['Đan Viện Thiên An (Tu Viện Dòng Biển Đức Giữa Rừng Thông)'], timeSlot: '14:00 - 15:30' },
      ] },
      { city: 'Huế', theme: 'Chùa cổ và tín ngưỡng ven sông', stops: [
        { names: ['Quốc Tự Diệu Đế (Nơi Có Bức Bích Họa Rồng Lớn Nhất Việt Nam)'], timeSlot: '08:00 - 09:00' },
        { names: ['Điện Hòn Chén (Huệ Nam Điện – Thánh Địa Tín Ngưỡng Thờ Mẫu Xứ Huế)'], timeSlot: '14:00 - 16:00' },
      ] },
    ],
  },
  {
    id: 'hue-markets-2d',
    title: 'Huế 2 ngày: Làng nghề và quà thủ công',
    destination: 'Huế',
    theme: 'shopping',
    label: 'Làng nghề & quà tặng',
    summary: 'Ghé các làng nghề có tên cụ thể trong danh mục; hỏi cơ sở về giờ mở cửa và khả năng mua sản phẩm tại chỗ.',
    season: 'Tháng 1–4 và tháng 8–9; xác nhận giờ hoạt động của chợ.',
    stays: [{ city: 'Huế', names: ['SaLa Hotel Huế'] }],
    days: [
      { city: 'Huế', theme: 'Làng hương và thủ công', stops: [
        { names: ['Làng Hương Thủy Xuân'], timeSlot: '09:00 - 10:30' },
        { names: ['Làng Nghề Đúc Đồng Phường Đúc'], timeSlot: '14:00 - 15:30' },
      ] },
      { city: 'Huế', theme: 'Làng hoa và phố đêm', stops: [
        { names: ['Làng Hoa Giấy Thanh Tiên'], timeSlot: '09:00 - 11:00' },
        { names: ['Phố Đêm Hoàng Thành Huế & Phố Đi Bộ Chu Văn An – Phạm Ngũ Lão – Võ Thị Sáu'], timeSlot: '18:00 - 20:00' },
      ] },
    ],
  },
  {
    id: 'hue-couple-2d',
    title: 'Huế 2 ngày: Dành cho hai người, nhẹ nhàng và lãng mạn',
    destination: 'Huế',
    theme: 'couple',
    label: 'Cặp đôi & thư thả',
    summary: 'Hai buổi tối có hoạt động văn hóa và ngắm cảnh; nơi lưu trú có thông tin liên hệ, không giả định tiện ích riêng.',
    season: 'Tháng 1–4 và tháng 8–9; chọn ngày khô ráo để ngắm cảnh ngoài trời.',
    stays: [{ city: 'Huế', names: ['Ancient Huế Garden Houses'] }],
    days: [
      { city: 'Huế', theme: 'Ngắm hoàng hôn và nghe ca Huế', stops: [
        { names: ['Đồi Vọng Cảnh'], timeSlot: '16:00 - 17:30' },
        { names: ['Ca Huế Trên Sông Hương (Bến Tòa Khâm)'], timeSlot: '19:00 - 20:30' },
      ] },
      { city: 'Huế', theme: 'Phố cũ và bờ sông', stops: [
        { names: ['Bến Bán Nguyệt (Bến Me)'], timeSlot: '08:30 - 09:30' },
        { names: ['Nhà Hát Sông Hương (Biểu Tượng Nghệ Thuật Đương Đại Bên Sông Hương)'], timeSlot: '16:30 - 18:00' },
      ] },
    ],
  },
  {
    id: 'danang-adventure-2d',
    title: 'Đà Nẵng 2 ngày: SUP, suối và hoạt động ngoài trời',
    destination: 'Đà Nẵng',
    theme: 'adventure',
    label: 'Phiêu lưu ngoài trời',
    summary: 'Có điểm chèo SUP và khu du lịch sinh thái Hòa Phú Thành; cần tự xác nhận thời tiết, dịch vụ hoạt động và điều kiện an toàn.',
    season: 'Ngày khô ráo; xác nhận tình trạng hoạt động trực tiếp với đơn vị trước khi khởi hành.',
    stays: [{ city: 'Đà Nẵng', names: ['Dhami Farmstay - Yoga Retreat'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Hoạt động nước ở Hòa Phú Thành', stops: [
        { names: ['Khu Du Lịch Sinh Thái Hòa Phú Thành'], timeSlot: '08:00 - 12:00' },
        { names: ['Khe Răm & Suối Tiên Hòa Bắc (Tắm Suối Tự Nhiên)'], timeSlot: '14:00 - 16:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Chèo SUP và khám phá Sơn Trà', stops: [
        { names: ['Bãi biển Mân Thái (Chèo SUP đón bình minh)'], timeSlot: '05:30 - 08:00' },
        { names: ['Bãi Bụt Sơn Trà'], timeSlot: '09:30 - 11:30' },
      ] },
    ],
  },
  {
    id: 'hue-rainy-day-2d',
    title: 'Huế 2 ngày: Bảo tàng và trải nghiệm trong nhà',
    destination: 'Huế',
    theme: 'rainy',
    label: 'Ngày mưa · trong nhà',
    summary: 'Ưu tiên bảo tàng, không gian nghệ thuật và chương trình biểu diễn; cần kiểm tra giờ mở cửa/lịch diễn trước khi đi.',
    season: 'Dùng làm phương án dự phòng khi mưa; giờ hoạt động cần xác nhận với từng địa điểm.',
    stays: [{ city: 'Huế', names: ['Hue 1962 INN'] }],
    days: [
      { city: 'Huế', theme: 'Bảo tàng và không gian nghệ thuật', stops: [
        { names: ['Bảo Tàng Đại Tướng Nguyễn Chí Thanh'], timeSlot: '09:00 - 10:30' },
        { names: ['Không Gian Nghệ Thuật Điềm Phùng Thị'], timeSlot: '14:00 - 15:30' },
      ] },
      { city: 'Huế', theme: 'Lịch sử và biểu diễn', stops: [
        { names: ['Bảo Tàng Lịch Sử Thừa Thiên Huế'], timeSlot: '09:00 - 10:30' },
        { names: ['Áo Dài Show Huế'], timeSlot: '18:00 - 19:30' },
      ] },
    ],
  },
  {
    id: 'danang-hue-route-3d',
    title: 'Đà Nẵng – Huế 3 ngày: Qua đèo Hải Vân',
    destination: 'Đà Nẵng & Huế',
    theme: 'route',
    label: 'Tuyến Đà Nẵng · Huế',
    summary: 'Một ngày ở Đà Nẵng, một ngày dành cho chặng liên tỉnh qua Hải Vân và một ngày khám phá Huế; có nơi lưu trú ở cả hai thành phố.',
    season: 'Tháng 2–8; kiểm tra mưa, sương mù và tình trạng đèo trước khi đi.',
    stays: [
      { city: 'Đà Nẵng', names: ['Doha Central Bliss Da Nang Hotel a Salve by Haviland'] },
      { city: 'Huế', names: ['Dạ Homestay Huế'] },
    ],
    days: [
      { city: 'Đà Nẵng', theme: 'Thành phố và bờ sông', stops: [
        { names: ['Bảo Tàng Đà Nẵng (Thành Điện Hải)'], timeSlot: '09:00 - 11:00' },
        { names: ['Cầu Quay Sông Hàn'], timeSlot: '17:00 - 18:00' },
      ] },
      { city: 'Huế', theme: 'Di chuyển qua đèo Hải Vân đến Huế', stops: [
        { names: ['Đỉnh Đèo Hải Vân & Di Tích Hải Vân Quan (Phía Bắc – Huế)'], timeSlot: '09:00 - 11:00' },
      ] },
      { city: 'Huế', theme: 'Kinh thành và ẩm thực Huế', stops: [
        { names: ['Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)'], timeSlot: '08:30 - 11:00' },
        { names: ['Bánh Khoái Hạnh'], timeSlot: '12:00 - 13:00' },
        { names: ['Cầu Trường Tiền (Cầu Tràng Tiền)'], timeSlot: '17:00 - 18:00' },
      ] },
    ],
  },
  {
    id: 'hue-local-food-2d',
    title: 'Huế 2 ngày: Món địa phương và chợ xứ Huế',
    destination: 'Huế',
    theme: 'food',
    label: 'Ẩm thực địa phương',
    summary: 'Thử bánh khoái, cơm hến và bún bò; ghé hai chợ địa phương theo lịch riêng từng ngày.',
    season: 'Tháng 1–4 và tháng 8–9; kiểm tra thời tiết và giờ phục vụ trước khi đi.',
    stays: [{ city: 'Huế', names: ['Dạ Homestay Huế'] }],
    days: [
      { city: 'Huế', theme: 'Chợ và món ăn sáng', stops: [
        { names: ['Chợ Bến Ngự'], timeSlot: '08:00 - 09:30' },
        { names: ['Bún Bò Bà Gái'], timeSlot: '10:00 - 11:00' },
        { names: ['Bánh Khoái Hạnh'], timeSlot: '17:00 - 18:00' },
      ] },
      { city: 'Huế', theme: 'Cơm hến và nhịp sống bên sông', stops: [
        { names: ['Cơm Hến Hoa Đông (Cồn Hến)'], timeSlot: '09:00 - 10:00' },
        { names: ['Chợ An Cựu'], timeSlot: '15:00 - 16:00' },
      ] },
    ],
  },
  {
    id: 'danang-urban-culture-2d',
    title: 'Đà Nẵng 2 ngày: Bảo tàng và dấu ấn thành phố',
    destination: 'Đà Nẵng',
    theme: 'heritage',
    label: 'Văn hóa đô thị',
    summary: 'Tìm hiểu lịch sử tại Thành Điện Hải và Nhà trưng bày Hoàng Sa, kết hợp các không gian công cộng trung tâm.',
    season: 'Tháng 2–8; kiểm tra lịch mở cửa của không gian trưng bày.',
    stays: [{ city: 'Đà Nẵng', names: ['Doha Central Bliss Da Nang Hotel a Salve by Haviland'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Thành Điện Hải và kiến trúc bên sông', stops: [
        { names: ['Bảo Tàng Đà Nẵng (Thành Điện Hải)'], timeSlot: '09:00 - 11:00' },
        { names: ['Công Viên APEC (Vòm Kiến Trúc "Cánh Diều Bay Cao")'], timeSlot: '16:00 - 17:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Câu chuyện biển đảo và cầu sông Hàn', stops: [
        { names: ['Nhà Trưng Bày Hoàng Sa'], timeSlot: '09:00 - 10:30' },
        { names: ['Cầu Quay Sông Hàn'], timeSlot: '17:00 - 18:00' },
      ] },
    ],
  },
  {
    id: 'danang-coastal-eco-2d',
    title: 'Đà Nẵng 2 ngày: Bờ biển và thiên nhiên bản địa',
    destination: 'Đà Nẵng',
    theme: 'eco',
    label: 'Thiên nhiên ven biển',
    summary: 'Dành thời gian ngoài trời ở Non Nước, Mân Thái và Bãi Bụt; chọn ngày biển êm và tuân thủ hướng dẫn tại điểm.',
    season: 'Tháng 2–8; tránh biển động và xác nhận điều kiện tiếp cận trước khi đi.',
    stays: [{ city: 'Đà Nẵng', names: ['Làng Toom Sara Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Bờ biển phía nam', stops: [
        { names: ['Bãi Biển Non Nước'], timeSlot: '07:00 - 09:00' },
        { names: ['Danh thắng Ngũ Hành Sơn'], timeSlot: '09:30 - 11:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Bán đảo và bãi biển', stops: [
        { names: ['Bãi biển Mân Thái (Chèo SUP đón bình minh)'], timeSlot: '06:00 - 08:00' },
        { names: ['Bãi Bụt Sơn Trà'], timeSlot: '09:00 - 11:00' },
      ] },
    ],
  },
  {
    id: 'danang-family-discovery-2d',
    title: 'Đà Nẵng 2 ngày: Gia đình khám phá và vui chơi',
    destination: 'Đà Nẵng',
    theme: 'family',
    label: 'Gia đình · khám phá',
    summary: 'Một ngày trải nghiệm Bà Nà Hills và một ngày dành cho Art in Paradise cùng Da Nang Downtown; vé cần mua riêng.',
    season: 'Tháng 2–8; kiểm tra thời tiết, giờ hoạt động và giá vé của các khu vui chơi.',
    stays: [{ city: 'Đà Nẵng', names: ['Sena homestay Cầu Rồng Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Bà Nà Hills', stops: [
        { names: ['Cầu Vàng (Sun World Bà Nà Hills)'], timeSlot: '09:00 - 10:00' },
        { names: ['Đỉnh Núi Chúa – Sun World Bà Nà Hills'], timeSlot: '10:30 - 12:00' },
        { names: ['Chùa Linh Ứng Bà Nà'], timeSlot: '13:30 - 14:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Trải nghiệm tương tác và vòng quay', stops: [
        { names: ['Bảo Tàng Tranh 3D Art In Paradise Đà Nẵng'], timeSlot: '09:30 - 11:30' },
        { names: ['Tổ Hợp Da Nang Downtown (Công Viên Châu Á – Vòng Quay Sun Wheel)'], timeSlot: '16:00 - 18:30' },
      ] },
    ],
  },
  {
    id: 'hue-garden-retreat-3d',
    title: 'Huế 3 ngày: Nghỉ dưỡng vườn nhà và di sản',
    destination: 'Huế',
    theme: 'luxury',
    label: 'Nghỉ dưỡng di sản',
    summary: 'Lưu trú tại Ancient Huế Garden Houses; kết hợp lăng tẩm, nhà vườn và trải nghiệm văn hóa bên sông.',
    season: 'Tháng 1–4 và tháng 8–9; đặt dịch vụ và xác nhận giá trực tiếp với cơ sở.',
    stays: [{ city: 'Huế', names: ['Ancient Huế Garden Houses'] }],
    days: [
      { city: 'Huế', theme: 'Lăng tẩm triều Nguyễn', stops: [
        { names: ['Lăng Minh Mạng (Hiếu Lăng)'], timeSlot: '08:30 - 10:30' },
        { names: ['Lăng Khải Định (Ứng Lăng)'], timeSlot: '14:00 - 16:00' },
      ] },
      { city: 'Huế', theme: 'Nhà vườn và không gian hoàng gia', stops: [
        { names: ['Nhà Vườn An Hiên (Bảo Tàng Sống Về Kiến Trúc Nhà Vườn Quan Lại Xứ Huế)'], timeSlot: '09:00 - 10:30' },
        { names: ['Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)'], timeSlot: '14:00 - 16:30' },
      ] },
      { city: 'Huế', theme: 'Ngắm cảnh và thưởng thức nghệ thuật', stops: [
        { names: ['Đồi Vọng Cảnh'], timeSlot: '16:00 - 17:30' },
        { names: ['Ca Huế Trên Sông Hương (Bến Tòa Khâm)'], timeSlot: '19:00 - 20:30' },
      ] },
    ],
  },
  {
    id: 'danang-seaside-checkin-2d',
    title: 'Đà Nẵng 2 ngày: Check-in biển và bán đảo',
    destination: 'Đà Nẵng',
    theme: 'checkin',
    label: 'Check-in biển',
    summary: 'Chụp ảnh bình minh ở Mân Thái, Bãi Bụt và ngắm cảnh biển từ Sơn Trà Marina; kiểm tra thời tiết trước chuyến đi.',
    season: 'Tháng 2–8; đi sớm để tránh nắng và xác nhận tình trạng đường bán đảo.',
    stays: [{ city: 'Đà Nẵng', names: ['Sena homestay Cầu Rồng Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Bình minh và bãi biển Sơn Trà', stops: [
        { names: ['Bãi biển Mân Thái (Chèo SUP đón bình minh)'], timeSlot: '05:30 - 07:30' },
        { names: ['Bãi Bụt Sơn Trà'], timeSlot: '08:30 - 10:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Cảnh biển và cầu ven sông', stops: [
        { names: ['Sơn Trà Marina'], timeSlot: '15:30 - 17:00' },
        { names: ['Cầu Thuận Phước (Cầu Treo Dây Võng Dài Nhất Việt Nam)'], timeSlot: '17:30 - 18:30' },
      ] },
    ],
  },
  {
    id: 'danang-budget-city-2d',
    title: 'Đà Nẵng 2 ngày: Thành phố tiết kiệm',
    destination: 'Đà Nẵng',
    theme: 'budget',
    label: 'Tiết kiệm · trung tâm',
    summary: 'Ở khách sạn có nhãn ngân sách thấp trong danh mục; ưu tiên không gian công cộng và chợ, chi phí ăn uống/vé tính riêng.',
    season: 'Tháng 2–8; kiểm tra giờ chợ và thời tiết trước khi đi.',
    stays: [{ city: 'Đà Nẵng', names: ['Doha Central Bliss Da Nang Hotel a Salve by Haviland'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Công viên và bờ sông', stops: [
        { names: ['Công Viên APEC (Vòm Kiến Trúc "Cánh Diều Bay Cao")'], timeSlot: '08:00 - 09:00' },
        { names: ['Cầu Quay Sông Hàn'], timeSlot: '17:00 - 18:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Chợ địa phương và cầu trung tâm', stops: [
        { names: ['Chợ Cồn'], timeSlot: '09:00 - 10:30' },
        { names: ['Cầu Tình Yêu & Tượng Cá Chép Hóa Rồng'], timeSlot: '17:00 - 18:00' },
      ] },
    ],
  },
  {
    id: 'danang-coffee-and-river-2d',
    title: 'Đà Nẵng 2 ngày: Cà phê biển và rooftop',
    destination: 'Đà Nẵng',
    theme: 'coffee',
    label: 'Cà phê & ngắm cảnh',
    summary: 'Hai điểm cà phê có trong danh mục, kết hợp ngắm biển và sông Hàn; gọi cơ sở để xác nhận giờ hoạt động.',
    season: 'Tháng 2–8; chọn buổi chiều trời quang để ngắm cảnh.',
    stays: [{ city: 'Đà Nẵng', names: ['Seahorse Signature Da Nang Hotel By Sujet of Haviland'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Cà phê ngắm bán đảo', stops: [
        { names: ['Sơn Trà Marina'], timeSlot: '15:30 - 17:00' },
        { names: ['Cầu Tình Yêu & Tượng Cá Chép Hóa Rồng'], timeSlot: '17:30 - 18:30' },
      ] },
      { city: 'Đà Nẵng', theme: 'Rooftop và sông Hàn', stops: [
        { names: ['Horizon Bar – Four Points by Sheraton Danang (Rooftop Tầng 36)'], timeSlot: '17:00 - 18:30' },
        { names: ['Cầu Quay Sông Hàn'], timeSlot: '19:00 - 20:00' },
      ] },
    ],
  },
  {
    id: 'danang-spiritual-2d',
    title: 'Đà Nẵng 2 ngày: Chùa và không gian thanh tịnh',
    destination: 'Đà Nẵng',
    theme: 'spiritual',
    label: 'Tâm linh Đà Nẵng',
    summary: 'Thăm chùa Quán Thế Âm và chùa Linh Ứng Bà Nà; chú ý khoảng cách giữa các khu vực và trang phục phù hợp.',
    season: 'Tháng 2–8; kiểm tra thời tiết, đường đi và quy định thăm viếng.',
    stays: [{ city: 'Đà Nẵng', names: ['Naman Retreat'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Ngũ Hành Sơn', stops: [
        { names: ['Chùa Quán Thế Âm (Ngũ Hành Sơn)'], timeSlot: '08:30 - 10:00' },
        { names: ['Danh thắng Ngũ Hành Sơn'], timeSlot: '10:30 - 12:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Không gian tâm linh trên Bà Nà', stops: [
        { names: ['Chùa Linh Ứng Bà Nà'], timeSlot: '13:30 - 14:30' },
        { names: ['Đỉnh Núi Chúa – Sun World Bà Nà Hills'], timeSlot: '15:00 - 16:00' },
      ] },
    ],
  },
  {
    id: 'danang-market-shopping-2d',
    title: 'Đà Nẵng 2 ngày: Chợ địa phương và quà mang về',
    destination: 'Đà Nẵng',
    theme: 'shopping',
    label: 'Chợ & mua sắm',
    summary: 'Ghé chợ Cồn, chợ Bắc Mỹ An và chợ đêm Helio; kiểm tra giờ hoạt động và tự xác nhận giá sản phẩm.',
    season: 'Quanh năm; nên xác nhận giờ chợ và lịch chợ đêm trước khi đến.',
    stays: [{ city: 'Đà Nẵng', names: ['Sena homestay Cầu Rồng Đà Nẵng'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Chợ trung tâm và đặc sản', stops: [
        { names: ['Chợ Bắc Mỹ An (Thiên Đường Ăn Vặt Giá Sinh Viên)'], timeSlot: '09:00 - 10:30' },
        { names: ['Chợ Cồn'], timeSlot: '15:30 - 17:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Chợ đêm và phố ven sông', stops: [
        { names: ['Chợ Đêm Helio'], timeSlot: '18:00 - 20:00' },
        { names: ['Cầu Rồng'], timeSlot: '20:00 - 21:00' },
      ] },
    ],
  },
  {
    id: 'danang-couple-evening-2d',
    title: 'Đà Nẵng 2 ngày: Hẹn hò bên sông và biển',
    destination: 'Đà Nẵng',
    theme: 'couple',
    label: 'Cặp đôi · biển và sông',
    summary: 'Lịch trình nhẹ với bờ biển, cầu đi bộ và điểm ngắm cảnh; không giả định dịch vụ riêng cho cặp đôi.',
    season: 'Tháng 2–8; chọn ngày khô ráo và xác nhận giờ hoạt động của quán.',
    stays: [{ city: 'Đà Nẵng', names: ['Naman Retreat'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Biển và cầu đi bộ', stops: [
        { names: ['Bãi Biển Non Nước'], timeSlot: '16:00 - 17:30' },
        { names: ['Cầu Trần Thị Lý & Cầu Đi Bộ Nguyễn Văn Trỗi'], timeSlot: '18:00 - 19:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Ngắm thành phố về đêm', stops: [
        { names: ['Cầu Tình Yêu & Tượng Cá Chép Hóa Rồng'], timeSlot: '17:30 - 18:30' },
        { names: ['Cầu Rồng'], timeSlot: '19:00 - 20:00' },
      ] },
    ],
  },
  {
    id: 'sontra-adventure-2d',
    title: 'Đà Nẵng 2 ngày: Trekking và cung đường Sơn Trà',
    destination: 'Đà Nẵng',
    theme: 'adventure',
    label: 'Phiêu lưu · Sơn Trà',
    summary: 'Kết hợp cung đường đến Cây Đa Ngàn Năm, Mũi Nghê và Bãi Tiên Sa; địa hình và đường đi cần được kiểm tra trước.',
    season: 'Ngày khô ráo; xác nhận điều kiện đường, thời tiết và hướng dẫn an toàn tại địa phương.',
    stays: [{ city: 'Đà Nẵng', names: ['Dhami Farmstay - Yoga Retreat'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Đường rừng Sơn Trà', stops: [
        { names: ['Cây Đa Ngàn Năm Sơn Trà (Cây Di Sản Việt Nam)'], timeSlot: '07:00 - 09:00' },
        { names: ['Bãi Tiên Sa'], timeSlot: '10:00 - 12:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Cung đường đến Mũi Nghê', stops: [
        { names: ['Mũi Nghê (Nơi Đón Ánh Bình Minh Đầu Tiên Của Đà Nẵng)'], timeSlot: '05:30 - 08:30' },
        { names: ['Bãi Bụt Sơn Trà'], timeSlot: '10:00 - 11:30' },
      ] },
    ],
  },
  {
    id: 'danang-rainy-museums-2d',
    title: 'Đà Nẵng 2 ngày: Bảo tàng và trải nghiệm trong nhà',
    destination: 'Đà Nẵng',
    theme: 'rainy',
    label: 'Ngày mưa · trong nhà',
    summary: 'Phương án mưa với bảo tàng thành phố, không gian Hoàng Sa và Art in Paradise; xác nhận giờ mở cửa trước khi đi.',
    season: 'Dùng làm phương án dự phòng ngày mưa; kiểm tra lịch hoạt động của từng điểm.',
    stays: [{ city: 'Đà Nẵng', names: ['Seahorse Signature Da Nang Hotel By Sujet of Haviland'] }],
    days: [
      { city: 'Đà Nẵng', theme: 'Lịch sử thành phố và nghệ thuật tương tác', stops: [
        { names: ['Nhà Trưng Bày Hoàng Sa'], timeSlot: '09:00 - 10:30' },
        { names: ['Bảo Tàng Tranh 3D Art In Paradise Đà Nẵng'], timeSlot: '14:00 - 16:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Bảo tàng và di tích trung tâm', stops: [
        { names: ['Bảo Tàng Đà Nẵng (Thành Điện Hải)'], timeSlot: '09:00 - 11:00' },
        { names: ['Chùa Quán Thế Âm (Ngũ Hành Sơn)'], timeSlot: '14:00 - 15:30' },
      ] },
    ],
  },
  {
    id: 'hue-danang-route-reverse-3d',
    title: 'Huế – Đà Nẵng 3 ngày: Di sản rồi qua đèo Hải Vân',
    destination: 'Đà Nẵng & Huế',
    theme: 'route',
    label: 'Huế · Đà Nẵng',
    summary: 'Bắt đầu ở Huế, dành ngày riêng cho chặng 2–3 giờ qua đèo Hải Vân rồi khám phá Đà Nẵng; có lưu trú tại cả hai thành phố.',
    season: 'Tháng 2–8; kiểm tra mưa, sương mù, tình trạng đèo và thời gian di chuyển.',
    stays: [
      { city: 'Huế', names: ['Dạ Homestay Huế'] },
      { city: 'Đà Nẵng', names: ['Doha Central Bliss Da Nang Hotel a Salve by Haviland'] },
    ],
    days: [
      { city: 'Huế', theme: 'Nhà vườn và di sản', stops: [
        { names: ['Nhà Vườn An Hiên (Bảo Tàng Sống Về Kiến Trúc Nhà Vườn Quan Lại Xứ Huế)'], timeSlot: '09:00 - 10:30' },
        { names: ['Lăng Khải Định (Ứng Lăng)'], timeSlot: '14:00 - 16:00' },
      ] },
      { city: 'Huế', theme: 'Chặng đường qua đèo Hải Vân', stops: [
        { names: ['Đỉnh Đèo Hải Vân & Di Tích Hải Vân Quan (Phía Bắc – Huế)'], timeSlot: '09:00 - 11:00' },
      ] },
      { city: 'Đà Nẵng', theme: 'Biển và món ăn địa phương', stops: [
        { names: ['Bãi Biển Non Nước'], timeSlot: '08:00 - 10:00' },
        { names: ['Mì Quảng Bà Mua'], timeSlot: '11:30 - 12:30' },
        { names: ['Cầu Rồng'], timeSlot: '17:00 - 18:00' },
      ] },
    ],
  },
];

function isGenericFallbackImage(image: string | undefined): boolean {
  return Boolean(image && image.includes('images.unsplash.com'));
}

function destinationCoverImage(destination: TripPackageDefinition['destination']): string {
  if (destination === 'Đà Nẵng & Huế') return '/images/danang_hue_banner.jpg';
  return destination === 'Huế'
    ? '/images/landing/hue-hero-640.webp'
    : '/images/landing/danang-hero-640.webp';
}

const CURATED_PACKAGE_POIS = normalizePois(curatedPackagePoiRecords as unknown as BackendPoiItem[]);

/** Keeps package source records available when a local API/DB has not loaded them yet. */
export function mergeTripPackagePois(pois: Poi[]): Poi[] {
  const mergedById = new Map(CURATED_PACKAGE_POIS.map((poi) => [poi.id, poi]));

  pois.forEach((poi) => {
    const curatedPoi = mergedById.get(poi.id);
    // A few older catalogs classify lodging as a landscape; retain the curated stay record in that case.
    if (curatedPoi?.category === 'luu-tru' && poi.category !== 'luu-tru') return;
    if (!curatedPoi) {
      mergedById.set(poi.id, poi);
      return;
    }

    const curatedImages = [curatedPoi.image, ...(curatedPoi.gallery || [])].filter((image) => !isGenericFallbackImage(image));
    const apiImages = [poi.image, ...(poi.gallery || [])].filter((image) => !isGenericFallbackImage(image));
    const image = curatedImages[0] || apiImages[0] || poi.image;
    const gallery = [...new Set([...curatedImages.slice(1), ...apiImages.filter((candidate) => candidate !== image)])];
    mergedById.set(poi.id, {
      ...curatedPoi,
      ...poi,
      image,
      gallery: gallery.length > 0 ? gallery : undefined,
    });
  });

  return Array.from(mergedById.values());
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findPoiByName(pois: Poi[], city: PoiCity, names: string[]): Poi | undefined {
  const normalizedNames = new Set(names.map(normalizeName));
  return pois.find((poi) => poi.city === city && normalizedNames.has(normalizeName(poi.name)));
}

function hasContactInfo(poi: Poi): boolean {
  return Boolean(
    poi.phone_number?.trim()
    || (poi.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(poi.email.trim()))
    || (poi.website_url?.trim() && /^https?:\/\//i.test(poi.website_url.trim()))
    || Object.values(poi.social_links || {}).some((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim())),
  );
}

export function resolveTripPackages(pois: Poi[]): ResolvedTripPackage[] {
  const availablePois = mergeTripPackagePois(pois);
  const resolvedPackages = PACKAGE_DEFINITIONS.flatMap((definition) => {
    const stays = definition.stays.map((stay) => findPoiByName(availablePois, stay.city, stay.names));
    if (stays.some((stay) => !stay || stay.category !== 'luu-tru' || !hasContactInfo(stay))) return [];

    const resolvedDays = definition.days.map((day) => {
      const stops = day.stops.map((stop) => {
        const poi = findPoiByName(availablePois, day.city, stop.names);
        return poi && poi.category !== 'luu-tru' ? { ...stop, poi } : null;
      });
      if (stops.some((stop) => !stop)) return null;
      return { ...day, stops: stops.filter((stop): stop is PackageDaySpec['stops'][number] & { poi: Poi } => stop !== null) };
    });
    if (resolvedDays.some((day) => !day)) return [];

    const validStays = stays.filter((stay): stay is Poi => stay !== undefined);
    const days = resolvedDays.filter((day): day is NonNullable<typeof day> => day !== null);
    const itineraryOutline: DailyItineraryOutline[] = days.map((day, index) => {
      const hotel = validStays.find((stay) => stay.city === day.city) || validStays[0];
      return {
        day: index + 1,
        theme: day.theme,
        focus_city: day.city,
        hotel: {
          name: hotel.name,
          checkInNote: 'Gợi ý nơi lưu trú; vui lòng liên hệ trực tiếp để xác nhận giá, tình trạng phòng và giờ nhận phòng.',
        },
        stops: day.stops.map(({ poi, timeSlot }, stopIndex) => ({
          id: `${definition.id}-day-${index + 1}-stop-${stopIndex + 1}`,
          poiId: poi.id,
          timeSlot,
          name: poi.name,
          category: poi.category,
          image: poi.image,
        })),
        assistant_tip: 'Khung giờ trong gói là gợi ý; hãy kiểm tra giờ mở cửa và điều kiện đi lại trước ngày khởi hành.',
      };
    });
    const poiIds = [...new Set([
      ...days.flatMap((day) => day.stops.map((stop) => stop.poi.id)),
      ...validStays.map((stay) => stay.id),
    ])];

    return [{
      definition,
      stays: validStays,
      days,
      coverPoi: days[0].stops[0].poi,
      coverImage: days[0].stops[0].poi.image,
      coverImageAlt: days[0].stops[0].poi.cleanName || days[0].stops[0].poi.name,
      launch: {
        title: definition.title,
        destination: definition.destination,
        daysCount: days.length,
        poiIds,
        coverImage: days[0]?.stops[0]?.poi.image || validStays[0].image,
        itineraryOutline,
      },
    }];
  });

  const usedCoverImages = new Set<string>();
  return resolvedPackages.map((tripPackage) => {
    const coverCandidates = tripPackage.days.flatMap((day) => day.stops.map(({ poi }) => poi));
    const distinctCover = coverCandidates
      .flatMap((poi) => [poi.image, ...(poi.gallery || [])].map((image) => ({ poi, image })))
      .find(({ image }) => image && !isGenericFallbackImage(image) && !usedCoverImages.has(image));
    const coverPoi = distinctCover?.poi || tripPackage.coverPoi;
    const coverImage = distinctCover?.image || destinationCoverImage(tripPackage.definition.destination);
    const coverImageAlt = distinctCover
      ? `Ảnh ${coverPoi.cleanName || coverPoi.name}`
      : `Ảnh minh họa ${tripPackage.definition.destination}`;
    usedCoverImages.add(coverImage);

    return {
      ...tripPackage,
      coverPoi,
      coverImage,
      coverImageAlt,
      launch: { ...tripPackage.launch, coverImage },
    };
  });
}

export function packageBudgetLabel(stay: Poi): string {
  if (stay.budget_tier === '$') return '₫ Tiết kiệm';
  if (stay.budget_tier === '$$') return '₫₫ Vừa phải';
  if (stay.budget_tier === '$$$') return '₫₫₫ Cao cấp';
  if (stay.budget_tier === 'free') return 'Miễn phí';
  return 'Liên hệ để biết giá';
}

export function packageNightlyPrice(stay: Poi): string | null {
  const value = stay.ai_metadata?.price_range_display;
  return typeof value === 'string' && /\/\s*(đêm|night)/i.test(value) ? value : null;
}

export function hasPoiContactInfo(poi: Poi): boolean {
  return hasContactInfo(poi);
}
