import { fetchJson } from '../lib/api';

export interface TripContextPayload {
  destination: string;
  days_count: number;
  current_day: number;
  current_slot?: string | null;
  current_stop_name?: string | null;
  current_stop_id?: string | null;
  saved_ideas?: string[];
}

export interface CopilotSuggestedPoi {
  id: string;
  name: string;
  category: string;
  sub_category?: string | null;
  image_url: string;
  green_score: number;
  rating: number;
  address: string;
  swap_reason: string;
  distance_info?: string | null;
  estimated_cost?: number | null;
  price_range_display?: string | null;
  budget_delta?: string | null;
  carbon_saved?: string | null;
}

export interface CopilotChatRequest {
  message: string;
  trip_context: TripContextPayload;
}

export interface CopilotChatResponse {
  reply_text: string;
  intent: string;
  target_slot?: string | null;
  suggested_pois: CopilotSuggestedPoi[];
  action_type: 'replace_stop' | 'add_stop' | 'none' | string;
  next_suggested_prompts?: string[];
  avoid_notice?: string | null;
  green_impact_summary?: string | null;
  budget_impact_summary?: string | null;
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
