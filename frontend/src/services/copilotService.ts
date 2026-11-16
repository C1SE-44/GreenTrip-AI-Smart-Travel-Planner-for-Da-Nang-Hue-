import { fetchJson } from '../lib/api';

export interface TripContextPayload {
  mode?: 'trip' | 'ideation';
  destination: string;
  days_count: number;
  current_day: number;
  current_slot?: string | null;
  current_stop_name?: string | null;
  current_stop_id?: string | null;
  saved_ideas?: string[];
  traveler_name?: string | null;
  companions?: string | null;
  preferences?: string[];
  start_date?: string | null;
  end_date?: string | null;
  active_constraints?: string[];
  trip_memory?: Record<string, string>;
  conversation_history?: Array<{ role: string; content: string }>;
  current_itinerary_state?: Array<Record<string, unknown>>;
}

export interface CopilotSuggestedPoi {
  id: string;
  name: string;
  category: string;
  sub_category?: string | null;
  city?: string | null;
  image_url: string;
  green_score: number;
  rating: number;
  address: string;
  swap_reason: string;
  kg_explanation?: string | null;
  eco_practices?: string[];
  distance_info?: string | null;
  estimated_cost?: number | null;
  price_range_display?: string | null;
  budget_delta?: string | null;
  carbon_saved?: string | null;
  gallery_urls?: string[] | null;
  lat?: number | null;
  lng?: number | null;
}

export interface CopilotChatRequest {
  message: string;
  trip_context: TripContextPayload;
}

export interface CopilotChatResponse {
  reply_text: string;
  intent: string;
  intent_category?: 'QA_AND_COMPARE' | 'POI_RECOMMENDATION' | 'ITINERARY_MUTATION' | 'OUT_OF_SCOPE' | string;
  reasoning_trace?: string;
  recommended_poi_ids?: string[];
  detected_constraints?: string[];
  trip_memory?: Record<string, string>;
  fact_check_warning?: string | null;
  target_slot?: string | null;
  suggested_pois: CopilotSuggestedPoi[];
  action_type: 'replace_stop' | 'add_stop' | 'mutate_itinerary' | 'view_on_map' | 'none' | string;
  next_suggested_prompts?: string[];
  avoid_notice?: string | null;
  green_impact_summary?: string | null;
  budget_impact_summary?: string | null;
  updated_itinerary_state?: Array<Record<string, unknown>> | null;
  updated_days_count?: number | null;
  updated_destination?: string | null;
  mutation_summary?: string[];
}

export async function sendCopilotChat(
  request: CopilotChatRequest
): Promise<CopilotChatResponse> {
  return await fetchJson<CopilotChatResponse>('/trips/copilot/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}
