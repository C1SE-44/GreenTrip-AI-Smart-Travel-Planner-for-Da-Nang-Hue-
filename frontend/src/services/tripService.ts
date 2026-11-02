import { API_BASE_URL } from '../lib/api';

export interface TripParametersPayload {
  destination: string;
  days: number;
  total_budget: number;
  num_people: number;
  start_date?: string | null;
  preferences?: string[];
}

export interface CostBreakdown {
  accommodation: number;
  food_and_beverage: number;
  transportation: number;
  activities_and_tickets: number;
  percentage_breakdown?: {
    accommodation?: number;
    food_and_beverage?: number;
    transportation?: number;
    activities_and_tickets?: number;
  };
}

export interface MatchedPOI {
  name: string;
  category: string;
  city: string;
  address: string;
  description: string;
  highlight_tag: string;
  estimated_price_range: string;
  eco_features?: string[];
  green_score?: number | null;
  best_time?: string[] | string | null;
  image_url?: string | null;
}

export interface DailyItineraryOutline {
  day: number;
  theme: string;
  focus_city: string;
  suggested_activities: string[];
}

export interface ValidatedTripData {
  destination: string;
  days: number;
  num_people: number;
  total_budget: number;
  daily_budget_per_person: number;
  budget_tier: 'budget' | 'standard' | 'luxury';
  pacing_level: 'Relaxed' | 'Balanced' | 'Fast';
  pacing_label: string;
  pacing_desc: string;
  is_budget_sufficient: boolean;
  min_recommended_budget: number;
  budget_warning: string | null;
  start_date?: string | null;
  end_date?: string | null;
  preferences: string[];
  cost_breakdown: CostBreakdown;
  recommendations: string[];
  matched_pois?: MatchedPOI[];
  itinerary_outline?: DailyItineraryOutline[];
}

export interface TripParametersResponse {
  valid: boolean;
  message: string;
  data: ValidatedTripData;
}

export class ValidationError extends Error {
  errors: Record<string, string>;

  constructor(message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export async function validateTripParameters(
  payload: TripParametersPayload
): Promise<TripParametersResponse> {
  const url = `${API_BASE_URL}/trips/validate-parameters`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    throw new ValidationError(
      `Không thể kết nối đến Backend (${url}). Vui lòng kiểm tra máy chủ Backend FastAPI đang chạy trên cổng 8000.`
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const fieldErrors: Record<string, string> = {};
    let generalMessage = 'Thông số chuyến đi chưa hợp lệ. Vui lòng kiểm tra lại.';

    if (response.status === 404) {
      generalMessage = `Không tìm thấy API xác thực tại ${url} (404 Not Found). Đang kết nối tới máy chủ chưa có tính năng này. Hãy đảm bảo bạn đang chạy Backend local tại http://localhost:8000.`;
    } else if (data?.detail) {
      if (Array.isArray(data.detail)) {
        data.detail.forEach((err: { loc?: (string | number)[]; msg?: string }) => {
          const field = err.loc && err.loc.length > 0 ? String(err.loc[err.loc.length - 1]) : 'general';
          const msg = err.msg ? err.msg.replace(/^Value error,\s*/i, '') : 'Giá trị không hợp lệ';
          fieldErrors[field] = msg;
        });
        const firstError = Object.values(fieldErrors)[0];
        if (firstError) generalMessage = firstError;
      } else if (typeof data.detail === 'string') {
        generalMessage = data.detail;
      }
    }

    throw new ValidationError(generalMessage, fieldErrors);
  }

  return data as TripParametersResponse;
}
