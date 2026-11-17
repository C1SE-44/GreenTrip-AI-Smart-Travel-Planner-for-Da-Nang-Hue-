import { fetchJson } from '../lib/api';

export interface TripContextPayload {
  trip_id?: string | null;
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
  total_budget?: number | null;
  num_people?: number;
  budget_tier?: 'budget' | 'standard' | 'luxury' | null;
  transport_mode?: 'driving' | 'motorcycle' | 'transit' | 'walking';
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
  opening_hours_status?: 'ok' | 'closed' | 'outside_hours' | 'unknown' | null;
  opening_hours_warning?: string | null;
  open_range_label?: string | null;
}

export interface CopilotChatRequest {
  message: string;
  trip_context: TripContextPayload;
}

export interface CopilotChatResponse {
  message_id?: string | null;
  requires_confirmation?: boolean;
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
  budget_status?: Record<string, unknown> | null;
  route_metrics?: Record<string, unknown> | null;
  fatigue_metrics?: Array<Record<string, unknown>> | null;
  updated_itinerary_state?: Array<Record<string, unknown>> | null;
  updated_days_count?: number | null;
  updated_destination?: string | null;
  mutation_summary?: string[];
}

export interface CopilotHistoryMessage {
  message_id: string;
  sender: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CopilotHistoryResponse {
  conversation_id: string | null;
  trip_id: string;
  title: string;
  trip_memory: Record<string, string>;
  active_constraints: string[];
  messages: CopilotHistoryMessage[];
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

export async function fetchCopilotHistory(
  tripId = 'ideation'
): Promise<CopilotHistoryResponse> {
  return await fetchJson<CopilotHistoryResponse>(
    `/trips/copilot/history?trip_id=${encodeURIComponent(tripId)}`
  );
}

export async function clearCopilotHistory(tripId = 'ideation'): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/trips/copilot/history?trip_id=${encodeURIComponent(tripId)}`,
    { method: 'DELETE' }
  );
}

export async function markCopilotProposalApplied(
  messageId: string,
  tripId = 'ideation'
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/trips/copilot/history/${encodeURIComponent(messageId)}/applied?trip_id=${encodeURIComponent(tripId)}`,
    { method: 'POST' }
  );
}

export async function markCopilotProposalDismissed(
  messageId: string,
  tripId = 'ideation'
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/trips/copilot/history/${encodeURIComponent(messageId)}/dismissed?trip_id=${encodeURIComponent(tripId)}`,
    { method: 'POST' }
  );
}

export function hasAuthToken(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
  );
}
