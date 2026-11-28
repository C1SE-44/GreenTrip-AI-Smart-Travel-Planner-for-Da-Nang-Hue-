export type TripBudgetScope = 'PER_PERSON' | 'TOTAL_GROUP';

export const MAX_TRIP_BUDGET_VND = 1_000_000_000;

export interface TripBudgetCalculation {
  inputAmount: number | null;
  applicableTravelerCount: number;
  totalBudget: number | null;
  error: string | null;
}

export function toPb07BudgetPayload(
  calculation: TripBudgetCalculation,
  scope: TripBudgetScope,
): {
  total_budget: number;
  budget_amount: number;
  budget_scope: TripBudgetScope;
  budget_traveler_count: number;
} | null {
  if (calculation.error || calculation.totalBudget === null) return null;
  if (calculation.inputAmount === null) return null;
  return {
    total_budget: calculation.totalBudget,
    budget_amount: calculation.inputAmount,
    budget_scope: scope,
    budget_traveler_count: calculation.applicableTravelerCount,
  };
}

export function parseVndAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasGrouping = /[.,\s\u00a0\u202f]/.test(trimmed);
  const validNumber = hasGrouping
    ? /^\d{1,3}(?:[.,\s\u00a0\u202f]\d{3})+$/.test(trimmed)
    : /^\d+$/.test(trimmed);
  if (!validNumber) return null;

  const amount = Number(trimmed.replace(/[.,\s\u00a0\u202f]/g, ''));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function calculateTripBudget(
  rawAmount: string | number,
  scope: TripBudgetScope,
  adultCount: number,
  childCount: number,
): TripBudgetCalculation {
  const rawText = String(rawAmount).trim();
  const inputAmount = typeof rawAmount === 'number'
    ? (Number.isSafeInteger(rawAmount) ? rawAmount : null)
    : parseVndAmount(rawText);
  const applicableTravelerCount = adultCount + childCount;

  if (!rawText) {
    return { inputAmount: null, applicableTravelerCount, totalBudget: null, error: 'Nhập ngân sách chuyến đi.' };
  }
  if (/^-\s*\d/.test(rawText)) {
    return { inputAmount: null, applicableTravelerCount, totalBudget: null, error: 'Ngân sách phải lớn hơn 0 VND.' };
  }
  if (inputAmount === null) {
    return { inputAmount: null, applicableTravelerCount, totalBudget: null, error: 'Nhập số tiền VND hợp lệ, không dùng số thập phân.' };
  }
  if (inputAmount <= 0) {
    return { inputAmount, applicableTravelerCount, totalBudget: null, error: 'Ngân sách phải lớn hơn 0 VND.' };
  }
  if (scope !== 'PER_PERSON' && scope !== 'TOTAL_GROUP') {
    return { inputAmount, applicableTravelerCount, totalBudget: null, error: 'Chọn phạm vi ngân sách.' };
  }
  if (!Number.isInteger(adultCount) || adultCount < 0 || !Number.isInteger(childCount) || childCount < 0 || applicableTravelerCount < 1) {
    return { inputAmount, applicableTravelerCount, totalBudget: null, error: 'Cần ít nhất một người lớn hoặc trẻ em để tính ngân sách PB07.' };
  }

  const totalBudget = scope === 'PER_PERSON'
    ? inputAmount * applicableTravelerCount
    : inputAmount;
  if (!Number.isSafeInteger(totalBudget) || totalBudget > MAX_TRIP_BUDGET_VND) {
    return { inputAmount, applicableTravelerCount, totalBudget: null, error: 'Tổng ngân sách không được vượt quá 1.000.000.000 VND.' };
  }

  return { inputAmount, applicableTravelerCount, totalBudget, error: null };
}

export function formatVndAmount(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount);
}

export function asTotalGroupBudget(totalBudget: number): {
  budgetInputAmount: number;
  budgetScope: 'TOTAL_GROUP';
  totalBudget: number;
} {
  return { budgetInputAmount: totalBudget, budgetScope: 'TOTAL_GROUP', totalBudget };
}
