import { fetchJson } from "@/lib/api";
import type { TripItinerary } from "./itineraryService";

export type AssistantMode = "discover" | "planner";
export interface AssistantContext {
  destination?: string;
  days_count?: number;
  start_date?: string;
  title?: string;
  people_count?: number;
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
) {
  return fetchJson<{
    text: string;
    itinerary?: TripItinerary;
    budget?: number;
  }>("/assistant/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_id: draftId, mode, trip_id: tripId, conversation_id: conversationId }),
  });
}


export function loadAssistantConversations(mode: AssistantMode, tripId?: string, signal?: AbortSignal) {
  const query=new URLSearchParams({mode});
  if(tripId)query.set('trip_id',tripId);
  return fetchJson<{items:{id:number;title:string;message_count:number}[]}>(`/assistant/conversations?${query}`,{signal});
}
