import { API_BASE_URL, fetchJson } from '../lib/api';

export interface SseParsedEvent {
  event: string;
  data: string;
}

export interface CopilotStreamCallbacks {
  onStatus?: (message: string) => void;
  onDelta?: (chunk: string) => void;
  signal?: AbortSignal;
}

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

export function parseSseChunkBuffer(buffer: string): {
  events: SseParsedEvent[];
  remainder: string;
} {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const remainder = blocks.pop() ?? '';
  const events: SseParsedEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith('event:')) {
        eventName = rawLine.slice(6).trim();
      } else if (rawLine.startsWith('data:')) {
        dataLines.push(rawLine.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

export async function streamCopilotChat(
  request: CopilotChatRequest,
  callbacks?: CopilotStreamCallbacks
): Promise<CopilotChatResponse> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
      : null;

  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/trips/copilot/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: callbacks?.signal,
  });

  if (response.status === 404 || response.status === 405 || !response.body) {
    return await sendCopilotChat(request);
  }

  if (!response.ok) {
    throw new Error(`Copilot stream failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload: CopilotChatResponse | null = null;

  const handleParsedEvents = (events: SseParsedEvent[]) => {
    for (const item of events) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(item.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (item.event === 'status' && typeof parsed.message === 'string') {
        callbacks?.onStatus?.(parsed.message);
      } else if (item.event === 'delta' && typeof parsed.text === 'string') {
        callbacks?.onDelta?.(parsed.text);
      } else if (item.event === 'done') {
        finalPayload = parsed as unknown as CopilotChatResponse;
      } else if (item.event === 'error') {
        throw new Error(
          typeof parsed.detail === 'string'
            ? parsed.detail
            : 'Không thể xử lý yêu cầu Copilot lúc này.'
        );
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parsedChunk = parseSseChunkBuffer(buffer);
    buffer = parsedChunk.remainder;
    handleParsedEvents(parsedChunk.events);
  }

  if (buffer.trim()) {
    const trailing = parseSseChunkBuffer(`${buffer}\n\n`);
    handleParsedEvents(trailing.events);
  }

  if (!finalPayload) {
    throw new Error('Luồng phản hồi Copilot kết thúc trước khi hoàn tất.');
  }

  return finalPayload;
}
