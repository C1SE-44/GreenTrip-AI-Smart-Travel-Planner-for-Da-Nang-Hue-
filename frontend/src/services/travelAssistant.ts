import { fetchJson } from "@/lib/api";
import type { TripItinerary } from "./itineraryService";
import type { TripActualProgress } from "@/utils/inTripProgress";

export type AssistantMode = "discover" | "planner";
export interface AssistantContext {
  destination?: string;
  days_count?: number;
  start_date?: string;
  end_date?: string;
  date_mode?: "dates" | "flex";
  title?: string;
  people_count?: number;
  adult_count?: number;
  child_count?: number;
  infant_count?: number;
  pet_count?: number;
  activity_start_time?: string;
  activity_end_time?: string;
  budget?: number;
  preferences?: string[];
  idea_ids?: string[];
}
export interface AssistantPlace {
  id: string;
  name: string;
  description: string;
  city: string;
  image_url: string;
  price_label: string;
  latitude?: number;
  longitude?: number;
  distance_km?: number;
}
export interface AssistantDraft {
  id: string;
  kind: "budget" | "itinerary";
  itinerary: TripItinerary | null;
  warnings: string[];
  budget?: number;
  primary_alternative_id?: string;
  alternatives?: AssistantItineraryAlternative[];
  in_trip?: {action: string; day_number: number; affected_stop_ids: string[]};
}
export interface AssistantItineraryAlternative {
  id: string;
  title: string;
  summary: string;
  itinerary: TripItinerary;
  selected_poi_ids: string[];
  scheduled_poi_ids: string[];
  unscheduled_pois: {
    poi_id: string;
    name: string;
    reasons: string[];
    attempted_days: number[];
  }[];
  metrics: {
    scheduled_poi_count: number;
    selected_poi_count: number;
    visit_minutes: number;
    travel_minutes_estimated: number;
    distance_km_estimated: number | null;
    opening_wait_minutes: number;
    rest_minutes: number;
    unknown_route_legs: number;
    unknown_visit_duration_count: number;
    unknown_opening_hours_count: number;
    known_poi_cost_vnd_per_person: number;
    unknown_poi_cost_count: number;
  };
  assumptions: string[];
  warnings: string[];
  feasibility_status: "PARTIAL" | "PROVISIONAL" | "ESTIMATED_HEURISTIC" | string;
}
export interface AssistantMessage {
  active_draft_id?: string | null;
  id?: string;
  role?: "user" | "assistant";
  text: string;
  pois?: AssistantPlace[];
  unknown_price_pois?: AssistantPlace[];
  prompts?: (string | {label: string; message: string})[];
  draft?: AssistantDraft | null;
  idea_ids?: string[];
  workspace_revision?: number;
  action?: string;
  engine?: string;
}
export function loadAssistant(
  mode: AssistantMode,
  tripId?: string,
  signal?: AbortSignal,
  conversationId = 1,
) {
  const query = new URLSearchParams({ mode, conversation_id: String(conversationId) });
  if (tripId) query.set("trip_id", tripId);
  return fetchJson<{
    messages: AssistantMessage[];
    draft: AssistantDraft | null;
    context?: AssistantContext;
  }>(`/assistant/history?${query}`, { signal });
}
export function chatAssistant(
  message: string,
  mode: AssistantMode,
  tripId: string | undefined,
  context: AssistantContext,
  selectedPoiId?: string,
  conversationId = 1,
) {
  return fetchJson<AssistantMessage>("/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      mode,
      trip_id: tripId,
      context,
      selected_poi_id: selectedPoiId,
      conversation_id: conversationId,
    }),
  });
}
export function applyAssistant(
  draftId: string,
  mode: AssistantMode,
  tripId: string,
  conversationId = 1,
  alternativeId?: string,
) {
  return fetchJson<{
    text: string;
    itinerary?: TripItinerary;
    budget?: number;
    actual_progress?: TripActualProgress;
    workspace_revision?: number;
  }>("/assistant/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft_id: draftId,
      mode,
      trip_id: tripId,
      conversation_id: conversationId,
      ...(alternativeId ? { alternative_id: alternativeId } : {}),
    }),
  });
}

export type InTripAdjustmentAction = 'stay_longer' | 'end_day_early' | 'postpone';

export function previewInTripAdjustment(input: {
  tripId: string;
  action: InTripAdjustmentAction;
  dayNumber: number;
  stopId?: string;
  extraMinutes?: number;
}) {
  return fetchJson<{draft: AssistantDraft; workspace_revision: number}>("/assistant/in-trip/preview", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      trip_id: input.tripId,
      action: input.action,
      day_number: input.dayNumber,
      ...(input.stopId ? {stop_id: input.stopId} : {}),
      ...(input.extraMinutes != null ? {extra_minutes: input.extraMinutes} : {}),
    }),
  });
}

export function reconcileInTripApply(tripId: string) {
  return fetchJson<{
    status: 'CLEAN' | 'APPLIED' | 'NOT_APPLIED';
    itinerary: TripItinerary;
    actual_progress?: TripActualProgress | null;
    workspace_revision?: number | null;
  }>('/assistant/in-trip/reconcile', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({trip_id: tripId}),
  });
}


export function loadAssistantConversations(mode: AssistantMode, tripId?: string, signal?: AbortSignal) {
  const query=new URLSearchParams({mode});
  if(tripId)query.set('trip_id',tripId);
  return fetchJson<{items:{id:number;title:string;message_count:number}[]}>(`/assistant/conversations?${query}`,{signal});
}
