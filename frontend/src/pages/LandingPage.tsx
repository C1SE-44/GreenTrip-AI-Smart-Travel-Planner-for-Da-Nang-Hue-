import { Link } from "react-router-dom";
import {
  CalendarCheck,
  Compass,
  MapPin,
  Navigation,
  Leaf,
  Star,
  ChevronDown,
  Check,
  Bell,
  Instagram,
  Twitter,
  Facebook,
  Github,
} from "lucide-react";

export default function LandingPage() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const features = [
    {
      id: "hoc-hoi",
      label: "Học hỏi",
      bgColor: "bg-[#0f1f63]",
      gradient: "from-[#0f1f63]",
      title: (
        <span className="text-[#F9DED6] text-[1.25em] leading-[0.95] block mt-8">
          Học hỏi
          <br />
          phong cách
          <br />
          của bạn.
        </span>
      ),
      desc: "Hãy chia sẻ những điều quan trọng với bạn. Trợ lý du lịch cá nhân của bạn sẽ ghi nhớ cách bạn thích đi du lịch, vì vậy bạn không cần phải bắt đầu lại từ đầu mỗi lần. Và bạn càng sử dụng nhiều, hệ thống càng giỏi hơn trong việc tìm kiếm những địa điểm thực sự phù hợp với bạn.",
      img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80",
      widgets: (
        <>
          <div className="absolute top-12 left-4 lg:-left-12 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Star size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Địa điểm ăn uống ngon, nhưng thân thiện với trẻ em.
              </p>
            </div>
          </div>
          <div
            className="absolute top-[40%] right-4 lg:right-0 -translate-y-1/2 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Star size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Thức ăn đường phố hơn là nhà hàng sang trọng
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-32 left-4 lg:left-4 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Star size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Chỉ những viên ngọc quý địa phương
              </p>
            </div>
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full bg-white/90 backdrop-blur-xl border border-white/60 shadow-2xl hover:scale-105 transition-transform cursor-pointer z-10">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-4 bg-gray-800 rounded-full animate-pulseRing"></div>
              <div
                className="w-1 h-8 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "100ms" }}
              ></div>
              <div
                className="w-1 h-5 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "200ms" }}
              ></div>
              <div
                className="w-1 h-3 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "150ms" }}
              ></div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: "toi-uu",
      label: "Tối ưu",
      bgColor: "bg-[#9e472a]",
      gradient: "from-[#9e472a]",
      title: (
        <span className="text-[#FDE68A] text-[1.25em] leading-[0.95] block mt-8">
          Tối ưu hóa
          <br />
          mọi quyết
          <br />
          định.
        </span>
      ),
      desc: "Trợ lý du lịch có thể giúp bạn sắp xếp thứ tự điểm đến, phương tiện và nhà hàng — tự động tính toán bằng thuật toán vận trù học để tối ưu chi phí và thời gian. Khi bạn đã sẵn sàng, hãy tự tin khởi hành với một lịch trình không có góc chết.",
      img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80",
      widgets: (
        <>
          <div className="absolute top-12 left-4 lg:-left-12 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Lộ trình ngắn nhất: Tiết kiệm 15km.
              </p>
            </div>
          </div>
          <div
            className="absolute top-[40%] right-4 lg:right-0 -translate-y-1/2 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Đã né tuyến đường đang thi công.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-32 left-4 lg:left-4 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Thời gian tham quan đã được tối ưu.
              </p>
            </div>
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full bg-white/90 backdrop-blur-xl border border-white/60 shadow-2xl hover:scale-105 transition-transform cursor-pointer z-10">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-4 bg-gray-800 rounded-full animate-pulseRing"></div>
              <div
                className="w-1 h-8 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "100ms" }}
              ></div>
              <div
                className="w-1 h-5 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "200ms" }}
              ></div>
              <div
                className="w-1 h-3 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "150ms" }}
              ></div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: "thich-nghi",
      label: "Thích nghi",
      bgColor: "bg-[#22362b]",
      gradient: "from-[#22362b]",
      title: (
        <span className="text-[#D1FAE5] text-[1.25em] leading-[0.95] block mt-8">
          Thích nghi
          <br />
          với nhịp
          <br />
          đập xanh.
        </span>
      ),
      desc: "Trợ lý du lịch luôn để mắt đến các chi tiết để bạn không cần bận tâm. Từ việc đánh giá Eco Score của từng địa điểm đến các cảnh báo thay đổi lịch trình linh hoạt, giúp chuyến đi miền Trung của bạn luôn trọn vẹn và bền vững.",
      img: "https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80",
      widgets: (
        <>
          <div className="absolute top-12 left-4 lg:-left-12 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Leaf size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Eco Score 90: Quán sử dụng 100% hữu cơ.
              </p>
            </div>
          </div>
          <div
            className="absolute top-[40%] right-4 lg:right-0 -translate-y-1/2 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Bell size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Có mưa rào ở Lăng Cô chiều nay.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-32 left-4 lg:left-4 rounded-[24px] border border-white/60 bg-white/90 p-4 backdrop-blur-3xl shadow-2xl animate-slideUp z-10"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-gray-200"></div>
              </div>
              <p className="text-[13px] font-bold text-gray-800 whitespace-nowrap">
                Đã tự động gợi ý điểm đến trong nhà.
              </p>
            </div>
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full bg-white/90 backdrop-blur-xl border border-white/60 shadow-2xl hover:scale-105 transition-transform cursor-pointer z-10">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-4 bg-gray-800 rounded-full animate-pulseRing"></div>
              <div
                className="w-1 h-8 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "100ms" }}
              ></div>
              <div
                className="w-1 h-5 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "200ms" }}
              ></div>
              <div
                className="w-1 h-3 bg-gray-800 rounded-full animate-pulseRing"
                style={{ animationDelay: "150ms" }}
              ></div>
            </div>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 1. HERO SECTION */}
      <section className="relative flex min-h-screen flex-col items-center justify-end overflow-hidden pb-12 text-center bg-white">
        <div className="absolute top-0 left-0 right-0 h-[80vh] z-0">
          <img
            src="https://images.unsplash.com/photo-1471922694854-ff1b63b20054?auto=format&fit=crop&q=80"
            alt="Mặt nước biển từ trên cao"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-[30vh] bg-gradient-to-t from-white via-white/90 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 mt-auto">
          <h1 className="font-heading text-5xl font-black tracking-tighter text-black sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[1.05]">
            Khám phá Đà Nẵng, Huế.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base font-normal text-gray-500 sm:text-[1.05rem] leading-relaxed">
            Gặp gỡ trợ lý cá nhân giúp tự động tối ưu hóa từng kilomet di
            chuyển, tiết kiệm thời gian và mở ra những trải nghiệm sinh thái
            tuyệt vời nhất.
          </p>

          <div className="mt-8 mb-2">
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 rounded-full bg-black px-10 py-4 text-base font-bold text-white transition-transform hover:scale-105 hover:bg-gray-900 shadow-xl"
            >
              Thiết lập lịch trình của bạn
            </Link>
          </div>
        </div>

        <div className="absolute bottom-4 z-10 animate-bounce">
          <ChevronDown size={24} className="text-black/40" />
        </div>
      </section>

      {/* 2. THREE SEPARATE SECTIONS WITH IN-PAGE SCROLL NAV */}
      <div className="flex flex-col gap-8 pt-24 pb-12">
        {features.map((feature) => (
          <section
            key={feature.id}
            id={feature.id}
            className="px-4 md:px-8 scroll-mt-[57px]"
          >
            <div
              className={`relative mx-auto max-w-[1200px] overflow-hidden rounded-[40px] text-white min-h-[500px] ${feature.bgColor}`}
            >
              <div className="flex flex-col lg:flex-row min-h-[500px]">
                <div className="flex flex-col justify-center p-8 lg:p-12 lg:w-1/2 z-20">
                  <div className="mt-16 mb-8 flex flex-wrap gap-3">
                    {features.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => scrollTo(f.id)}
                        className={`rounded-full px-5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                          f.id === feature.id
                            ? "border border-white bg-transparent text-white"
                            : "text-white/50 hover:text-white/80 hover:bg-white/5"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <h2 className="font-heading text-5xl font-extrabold leading-tight tracking-tight lg:text-7xl">
                    {feature.title}
                  </h2>
                  <p className="mt-8 max-w-sm text-[15px] font-light text-white leading-[1.7]">
                    {feature.desc}
                  </p>
                </div>

                <div className="relative lg:w-1/2 min-h-[400px]">
                  <img
                    src={feature.img}
                    alt={feature.label}
                    className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-luminosity"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${feature.gradient} to-transparent lg:w-32`}
                  />
                  {feature.widgets}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="bg-gradient-to-b from-white via-[#F5F5F7] via-15% to-[#EAEAEF] rounded-b-[40px] lg:rounded-b-[80px] relative z-20 pb-[200px]">
        {/* 3. GRID FEATURES */}
        <section className="px-4 pt-16 md:px-8">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-10 text-left flex flex-col items-start">
              <h2 className="font-heading text-4xl font-extrabold tracking-tight text-black sm:text-5xl lg:text-[4.5rem] leading-[1.05] max-w-4xl">
                Tận dụng tối đa trợ lý du lịch của bạn.
              </h2>
              <p className="mt-6 text-xl font-light text-gray-500 max-w-3xl">
                Luôn chủ động, lên kế hoạch, đặt chỗ và khám phá với sự hỗ trợ
                từ một trợ lý hiểu rõ cách bạn đi du lịch.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1: Tiết kiệm */}
              <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                <div className="mb-4 text-black">
                  <Bell size={22} strokeWidth={2.5} />
                </div>
                <h3 className="mb-3 text-xl font-bold text-black">Cảnh báo</h3>
                <p className="text-[13px] font-light text-gray-500 leading-relaxed">
                  Luôn cập nhật thông tin với các cảnh báo ùn tắc, tính toán lại
                  lịch trình theo thời gian thực.
                </p>

                <div className="absolute -bottom-6 left-0 right-0 flex flex-col items-center justify-end pb-4 space-y-3 pointer-events-none">
                  <div className="w-[85%] bg-white rounded-2xl shadow-xl border border-gray-100 p-3 flex items-center gap-3 rotate-[-2deg]">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                      <Bell size={20} className="text-orange-600" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900">
                        Mưa rào lúc 15:00
                      </div>
                      <div className="text-[10px] text-green-600 font-light">
                        Đã điều chỉnh lịch
                      </div>
                    </div>
                  </div>
                  <div className="w-[85%] bg-black rounded-[20px] shadow-2xl p-3 flex items-center gap-3 translate-y-4 rotate-[1deg]">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Navigation size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        Tránh kẹt xe
                      </div>
                      <div className="text-[10px] text-gray-400 font-light">
                        Tiết kiệm 20 phút
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Xây dựng */}
              <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                <div className="mb-4 text-black">
                  <CalendarCheck size={22} strokeWidth={2.5} />
                </div>
                <h3 className="mb-3 text-xl font-bold text-black">Xây dựng</h3>
                <p className="text-[13px] font-light text-gray-500 leading-relaxed">
                  Lập kế hoạch chuyên sâu dựa trên thói quen và lưu trữ toàn bộ
                  lịch trình ở cùng một nơi.
                </p>

                <div className="absolute -bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
                  <div className="w-[80%] bg-white rounded-3xl shadow-2xl border border-gray-100 p-3 relative translate-y-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-[11px] font-bold text-black">
                        Lịch trình Huế 3 ngày
                      </div>
                      <div className="w-5 h-5 rounded-full bg-blue-100 text-[9px] flex items-center justify-center font-bold">
                        +
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex gap-2 items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-1.5 w-[70%] bg-gray-200 rounded-full"></div>
                          <div className="h-1 w-[40%] bg-gray-100 rounded-full"></div>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-1.5 w-[50%] bg-gray-200 rounded-full"></div>
                          <div className="h-1 w-[80%] bg-gray-100 rounded-full"></div>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-1.5 w-[90%] bg-gray-200 rounded-full"></div>
                          <div className="h-1 w-[30%] bg-gray-100 rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Sinh thái */}
              <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                <div className="mb-4 text-black">
                  <Leaf size={22} strokeWidth={2.5} />
                </div>
                <h3 className="mb-3 text-xl font-bold text-black">Sinh thái</h3>
                <p className="text-[13px] font-light text-gray-500 leading-relaxed">
                  Theo dõi lượng phát thải và quy đổi thành Eco Score, giúp bạn
                  chọn các hoạt động bảo vệ môi trường.
                </p>

                <div className="absolute -bottom-2 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
                  <div className="flex gap-2">
                    <div className="bg-[#e6f4ea] text-green-700 text-[11px] font-bold px-4 py-2 rounded-full border border-green-200 shadow-sm rotate-[-3deg]">
                      Di chuyển xanh
                    </div>
                    <div className="bg-[#e6f4ea] text-green-700 text-[11px] font-bold px-4 py-2 rounded-full border border-green-200 shadow-sm rotate-[4deg]">
                      Quán chay
                    </div>
                  </div>
                  <div className="w-[85%] bg-white rounded-[20px] shadow-2xl border border-gray-100 p-4 flex justify-between items-center translate-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-green-500 w-8 h-8 rounded-full flex items-center justify-center">
                        <Leaf size={14} className="text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-black">
                          Eco Score
                        </div>
                        <div className="text-[10px] text-gray-500 font-light">
                          +150 điểm
                        </div>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-sm">
                      ✨
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Khám phá */}
              <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                <div className="mb-4 text-black">
                  <Compass size={22} strokeWidth={2.5} />
                </div>
                <h3 className="mb-3 text-xl font-bold text-black">Khám phá</h3>
                <p className="text-[13px] font-light text-gray-500 leading-relaxed">
                  Bản đồ đa lớp (Multi-layer map) giúp tìm những địa điểm, sự
                  kiện thú vị xung quanh bạn.
                </p>

                <div className="absolute -bottom-10 left-4 right-4 h-32 flex items-center justify-start pointer-events-none">
                  <div className="absolute left-[10%] w-[42%] rotate-[-6deg] translate-y-0 z-0">
                    <div className="bg-white p-1.5 rounded-2xl shadow-xl border border-gray-100">
                      <img
                        src="https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=80"
                        className="aspect-square w-full object-cover rounded-xl bg-gray-100"
                      />
                      <div className="px-2 py-2 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] font-bold text-black">
                            Đại Nội
                          </div>
                          <div className="text-[8px] text-gray-500 font-medium mt-0.5">
                            Huế
                          </div>
                        </div>
                        <div className="text-[8px] font-bold text-gray-300">
                          ⭐
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute left-[30%] w-[42%] rotate-[12deg] translate-y-6 z-10">
                    <div className="bg-white p-1.5 rounded-2xl shadow-2xl border border-gray-100">
                      <img
                        src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80"
                        className="aspect-square w-full object-cover rounded-xl bg-gray-100"
                      />
                      <div className="px-2 py-2 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] font-bold text-black">
                            Phố Cổ
                          </div>
                          <div className="text-[8px] text-gray-500 font-medium mt-0.5">
                            Hội An
                          </div>
                        </div>
                        <div className="text-[8px] font-bold text-gray-300">
                          ⭐
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute right-[5%] top-0 w-12 h-12 bg-[#1a1a1a] rounded-full shadow-2xl flex items-center justify-center border-4 border-white rotate-[15deg]">
                    <MapPin size={20} className="text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 4. DESTINATIONS CAROUSEL */}
      <section className="px-4 py-20 md:px-8 bg-white">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight text-charcoal sm:text-5xl lg:text-6xl max-w-3xl leading-[1.1]">
            Từ Đại Nội cổ kính đến Cầu Rồng rực lửa.
          </h2>
          <p className="mt-6 text-lg font-light text-muted max-w-2xl mb-12">
            Miền Trung ẩn chứa hàng trăm điểm đến chưa được khai phá. GreenTrip
            giúp bạn tìm ra con đường riêng của mình — xanh hơn, thú vị hơn.
          </p>

          <div className="flex gap-4">
            {[
              {
                title: "Cầu Rồng phun lửa",
                location: "Đà Nẵng, Việt Nam",
                tag: "Biểu tượng",
                img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80",
                count: "12 điểm",
              },
              {
                title: "Đại Nội Kinh thành Huế",
                location: "Huế, Việt Nam",
                tag: "Di sản UNESCO",
                img: "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=80",
                count: "8 điểm",
              },
              {
                title: "Phố cổ Hội An về đêm",
                location: "Hội An, Việt Nam",
                tag: "Phố lồng đèn",
                img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80",
                count: "15 điểm",
              },
              {
title: 'Bà Nà Hills & Cầu Vàng',
                location: 'Đà Nẵng, Việt Nam',
                tag: 'Kỳ quan',
                img: 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&q=80',
                count: '6 điểm',
              },
              {
                title: "Lăng Cô & Đèo Hải Vân",
                location: "Thừa Thiên Huế",
                tag: "Thiên nhiên",
                img: "https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80",
                count: "5 điểm",
              },
            ].map((item, i) => (
              <div key={i} className="flex-1 group cursor-pointer min-w-0">
                <div className="relative h-[260px] overflow-hidden rounded-[18px] mb-3">
                  <img
                    src={item.img}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white">
                    {item.count}
                  </div>
                </div>
                <h4 className="text-[14px] font-bold text-charcoal leading-snug line-clamp-2">
                  {item.title}
                </h4>
                <p className="text-[12px] font-light text-muted mt-1 flex items-center gap-1">
                  <MapPin size={11} className="shrink-0" /> {item.location}
                </p>
                <span className="inline-block mt-1.5 text-[10px] font-light text-muted bg-gray-100 px-2 py-0.5 rounded-full">
                  {item.tag}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mt-10">
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 rounded-full bg-black px-7 py-3.5 text-[15px] font-bold text-white hover:bg-gray-900 transition-colors"
            >
              Khám phá địa điểm
            </Link>
            <Link
              to="/onboarding"
              className="text-[15px] font-light text-charcoal hover:underline"
            >
              Xem lịch trình mẫu miễn phí →
            </Link>
          </div>
        </div>
      </section>

      {/* 6. FINAL CTA */}
      <section className="px-4 py-24 md:px-8 bg-white">
        <div className="relative mx-auto max-w-[1260px] overflow-hidden rounded-[40px] text-white text-center flex flex-col justify-center min-h-[680px] p-12 md:p-20 shadow-2xl">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&q=80"
              alt="Resort Pool"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
          </div>

          <div className="relative z-10 mx-auto max-w-3xl">
            <h2 className="font-heading text-5xl font-extrabold leading-tight tracking-tight lg:text-[5.5rem] drop-shadow-lg">
              Mỗi chuyến đi,
              <br />
              nhiều bản sắc hơn.
            </h2>
            <div className="mt-20">
              <p className="mx-auto max-w-3xl text-[18px] font-light text-white drop-shadow-md leading-relaxed">
                Trả lời vài câu hỏi để giúp GreenTrip hiểu hơn về phong cách của
                bạn. Trợ lý du lịch sẽ học hỏi những điều bạn quan tâm và giúp
                mọi chuyến đi trở nên mượt mà hơn.
              </p>
              <div className="mt-8">
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[17px] font-normal text-black transition-transform hover:scale-105 shadow-xl"
                >
                  Thiết lập lịch trình ngay
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="bg-white px-4 py-16 md:px-8 border-t border-gray-100">
        <div className="mx-auto max-w-[1200px] grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Leaf size={28} className="text-forest-600" />
              <span className="font-heading text-2xl font-bold tracking-tight text-forest-900">
                GreenTrip<span className="text-forest-600">.</span>
              </span>
            </div>
            <p className="text-muted text-sm max-w-xs mb-6">
              Nền tảng Lập lịch trình thông minh (Smart) và Du lịch bền vững
              (Green) tiên phong tại Đà Nẵng - Huế.
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="text-muted hover:text-charcoal transition-colors"
              >
                <Instagram size={20} />
              </a>
              <a
                href="#"
                className="text-muted hover:text-charcoal transition-colors"
              >
                <Twitter size={20} />
              </a>
              <a
                href="#"
                className="text-muted hover:text-charcoal transition-colors"
              >
                <Facebook size={20} />
              </a>
              <a
                href="#"
                className="text-muted hover:text-charcoal transition-colors"
              >
                <Github size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-charcoal mb-4">Khám phá</h4>
            <ul className="space-y-3 text-sm text-muted">
              <li>
                <a href="#" className="hover:text-forest-600">
                  Đà Nẵng
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Thừa Thiên Huế
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Quán ăn Eco
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Khách sạn
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-charcoal mb-4">Giải pháp</h4>
            <ul className="space-y-3 text-sm text-muted">
              <li>
                <a href="#" className="hover:text-forest-600">
                  Thuật toán OR-Tools
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  AI Đề xuất
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Cách tính Eco Score
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-charcoal mb-4">Công ty</h4>
            <ul className="space-y-3 text-sm text-muted">
              <li>
                <a href="#" className="hover:text-forest-600">
                  Về dự án
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Đội ngũ
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-600">
                  Liên hệ
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-[1200px] mt-16 pt-8 border-t border-gray-100 text-center text-sm text-muted/70">
          © 2026 GreenTrip AI. All rights reserved. Capstone Project for Da Nang
          - Hue.
        </div>
      </footer>
    </div>
  );
}
