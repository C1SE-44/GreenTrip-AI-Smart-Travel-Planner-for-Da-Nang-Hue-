import type { TripParametersPayload } from '@/services/tripService';
import { toPb07BudgetPayload } from '@/utils/tripBudget';
import type { TripBudgetCalculation, TripBudgetScope } from '@/utils/tripBudget';

export const TRIP_INTEREST_OPTIONS = [
  { id: 'nature', label: 'Thiên nhiên' },
  { id: 'beach', label: 'Biển' },
  { id: 'food', label: 'Ẩm thực' },
  { id: 'culture', label: 'Văn hóa' },
  { id: 'adventure', label: 'Khám phá' },
  { id: 'relaxation', label: 'Thư giãn' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'eco', label: 'Du lịch xanh' },
] as const;

export type TripInterestId = (typeof TRIP_INTEREST_OPTIONS)[number]['id'];
export type TripDateMode = 'dates' | 'flex';

export async function validateThenPersistTrip<
  TResponse extends { valid: boolean; data: unknown },
  TTrip,
>(
  validate: () => Promise<TResponse>,
  buildTrip: (data: TResponse['data']) => TTrip,
  persistTrip: (trip: TTrip) => Promise<unknown> | unknown,
): Promise<TTrip> {
  const response = await validate();
  if (!response.valid) throw new Error('Thông số chuyến đi chưa được máy chủ xác nhận.');
  const trip = buildTrip(response.data);
  await persistTrip(trip);
  return trip;
}

export function inclusiveTripDays(startDate: string, endDate: string): number | null {
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const startParts = startDate.match(datePattern)?.slice(1).map(Number);
  const endParts = endDate.match(datePattern)?.slice(1).map(Number);
  if (!startParts || !endParts) return null;

  const [startYear, startMonth, startDay] = startParts;
  const [endYear, endMonth, endDay] = endParts;
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  const startCheck = new Date(start);
  const endCheck = new Date(end);
  if (
    startCheck.getUTCFullYear() !== startYear || startCheck.getUTCMonth() !== startMonth - 1 || startCheck.getUTCDate() !== startDay ||
    endCheck.getUTCFullYear() !== endYear || endCheck.getUTCMonth() !== endMonth - 1 || endCheck.getUTCDate() !== endDay ||
    end < start
  ) return null;

  return Math.floor((end - start) / 86_400_000) + 1;
}

export function toTripParametersPayload(input: {
  destination: string;
  days: number;
  numPeople: number;
  startDate: string | null;
  interests: readonly string[];
  budget: TripBudgetCalculation | null;
  budgetScope: TripBudgetScope;
}): TripParametersPayload {
  const payload: TripParametersPayload = {
    destination: input.destination,
    days: input.days,
    num_people: input.numPeople,
    start_date: input.startDate,
    preferences: [...input.interests],
  };

  const budgetPayload = input.budget ? toPb07BudgetPayload(input.budget, input.budgetScope) : null;
  if (budgetPayload) Object.assign(payload, budgetPayload);

  return payload;
}

export function toTripWorkspaceInputFields(input: {
  dateMode: TripDateMode;
  startDate: string | null;
  endDate: string | null;
  days: number;
  flexibleMonth: string;
  peopleCount: number;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  interests: readonly string[];
  notes: string;
  budget: TripBudgetCalculation | null;
  budgetScope: TripBudgetScope;
}) {
  const hasBudget = input.budget !== null && !input.budget.error && input.budget.totalBudget !== null;
  return {
    tripInputVersion: 1,
    dateMode: input.dateMode,
    startDate: input.startDate,
    endDate: input.endDate,
    daysCount: input.days,
    flexibleDays: input.dateMode === 'flex' ? input.days : undefined,
    flexibleMonth: input.dateMode === 'flex' ? input.flexibleMonth : undefined,
    peopleCount: input.peopleCount,
    adultCount: input.adults,
    childCount: input.children,
    infantCount: input.infants,
    petCount: input.pets,
    interests: [...input.interests],
    greenWeight: 50,
    budgetWeight: 50,
    notes: input.notes,
    prompt: input.notes,
    budgetInputAmount: hasBudget ? input.budget?.inputAmount ?? null : null,
    budgetScope: hasBudget ? input.budgetScope : null,
    totalBudget: hasBudget ? input.budget?.totalBudget ?? null : null,
  };
}
