import { Compass, Sparkles, ShieldCheck, Leaf } from 'lucide-react';
import TripParametersForm from '@/components/planner/TripParametersForm';

export default function PlannerPage() {
  return (
    <div className="min-h-screen bg-[#FCFAF5] pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      {/* Hero Header */}
      <div className="mx-auto max-w-4xl text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-forest-100/70 border border-forest-200 px-4 py-1.5 text-xs font-bold text-forest-800 mb-4 shadow-2xs">
          <Leaf size={14} className="text-forest-600" />
          <span>GreenTrip AI • Trợ Lý Du Lịch Thông Minh & Bền Vững</span>
        </div>
        
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-forest-900 leading-tight">
          Lập Kế Hoạch Chuyến Đi <br className="hidden sm:inline" />
          <span className="text-forest-600">Đà Nẵng & Cố Đô Huế</span>
        </h1>
        
        <p className="mt-4 text-sm sm:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
          Tự động tính toán ngân sách, tối ưu số ngày và phân bổ thời gian hợp lý dựa trên 
          thuật toán vận trù học và các tiêu chí du lịch xanh thân thiện với môi trường.
        </p>

        {/* Feature Highlights */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs font-medium text-stone-600">
          <span className="flex items-center gap-1.5 bg-white/80 border border-stone-200 px-3 py-1 rounded-full shadow-2xs">
            <Sparkles size={13} className="text-amber-500" /> Tính toán ngân sách chính xác
          </span>
          <span className="flex items-center gap-1.5 bg-white/80 border border-stone-200 px-3 py-1 rounded-full shadow-2xs">
            <Compass size={13} className="text-forest-600" /> Gợi ý lộ trình không góc chết
          </span>
          <span className="flex items-center gap-1.5 bg-white/80 border border-stone-200 px-3 py-1 rounded-full shadow-2xs">
            <ShieldCheck size={13} className="text-blue-600" /> Xác thực dữ liệu tức thì
          </span>
        </div>
      </div>

      {/* Main Interactive Form Component */}
      <TripParametersForm />
    </div>
  );
}
