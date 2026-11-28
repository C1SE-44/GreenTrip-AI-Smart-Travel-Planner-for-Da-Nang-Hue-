import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

function loadTypeScript(url, requireModule, globals = {}) {
  const exports = {};
  const source = readFileSync(url, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { exports, require: requireModule, AbortSignal, Intl, Number, ...globals });
  return exports;
}

const budget = loadTypeScript(new URL('../src/utils/tripBudget.ts', import.meta.url), () => ({}));
const tripInput = loadTypeScript(
  new URL('../src/utils/tripInput.ts', import.meta.url),
  (specifier) => specifier === '@/utils/tripBudget' ? budget : {},
);

test('PER_PERSON multiplies by adults and children; TOTAL_GROUP stays as entered', () => {
  const perPerson = budget.calculateTripBudget('3.000.000', 'PER_PERSON', 2, 0);
  const group = budget.calculateTripBudget('3.000.000', 'TOTAL_GROUP', 2, 0);

  assert.equal(perPerson.totalBudget, 6_000_000);
  assert.equal(group.totalBudget, 3_000_000);
  assert.equal(perPerson.inputAmount, 3_000_000);
  assert.equal(budget.toPb07BudgetPayload(perPerson, 'PER_PERSON').total_budget, 6_000_000);
  assert.equal(budget.toPb07BudgetPayload(group, 'TOTAL_GROUP').total_budget, 3_000_000);
});

test('PER_PERSON recalculates from the existing Who counts', () => {
  assert.equal(budget.calculateTripBudget('3000000', 'PER_PERSON', 2, 0).totalBudget, 6_000_000);
  assert.equal(budget.calculateTripBudget('3000000', 'PER_PERSON', 2, 1).totalBudget, 9_000_000);
});

test('infants and pets are outside the budget traveler count', () => {
  const result = budget.calculateTripBudget('3000000', 'PER_PERSON', 2, 1);
  assert.equal(result.applicableTravelerCount, 3);
  assert.equal(result.totalBudget, 9_000_000);
});

test('empty, zero, negative, malformed, decimal, and over-limit budgets are rejected', () => {
  assert.match(budget.calculateTripBudget('', 'PER_PERSON', 2, 0).error, /Nhập ngân sách/);
  assert.match(budget.calculateTripBudget('0', 'TOTAL_GROUP', 2, 0).error, /lớn hơn 0/);
  assert.ok(budget.calculateTripBudget('-100', 'TOTAL_GROUP', 2, 0).error);
  assert.ok(budget.calculateTripBudget('abc', 'TOTAL_GROUP', 2, 0).error);
  assert.ok(budget.calculateTripBudget('3.5', 'TOTAL_GROUP', 2, 0).error);
  assert.ok(budget.calculateTripBudget('100000000', 'PER_PERSON', 11, 0).error);
});

test('switching scope keeps the input amount and changes the PB07 total consistently', () => {
  const perPerson = budget.calculateTripBudget('3,000,000', 'PER_PERSON', 2, 0);
  const totalGroup = budget.calculateTripBudget('3,000,000', 'TOTAL_GROUP', 2, 0);

  assert.equal(perPerson.totalBudget, 6_000_000);
  assert.equal(totalGroup.totalBudget, 3_000_000);
  assert.notEqual(perPerson.totalBudget, totalGroup.totalBudget);
  const groupPayload = tripInput.toTripParametersPayload({
    destination: 'Đà Nẵng', days: 3, numPeople: 2, startDate: null,
    interests: [], budget: totalGroup, budgetScope: 'TOTAL_GROUP',
  });
  assert.equal(groupPayload.total_budget, 3_000_000);
  assert.equal(groupPayload.budget_amount, 3_000_000);
  assert.equal(groupPayload.budget_scope, 'TOTAL_GROUP');
  assert.equal(budget.toPb07BudgetPayload(perPerson, 'PER_PERSON').total_budget, 6_000_000);
  assert.equal(budget.toPb07BudgetPayload(totalGroup, 'TOTAL_GROUP').total_budget, 3_000_000);
  const groupBudgetFields = budget.asTotalGroupBudget(3_000_000);
  assert.equal(groupBudgetFields.budgetInputAmount, 3_000_000);
  assert.equal(groupBudgetFields.budgetScope, 'TOTAL_GROUP');
  assert.equal(groupBudgetFields.totalBudget, 3_000_000);
});

test('date ranges count both endpoints and reject reversed or invalid dates', () => {
  assert.equal(tripInput.inclusiveTripDays('2026-12-01', '2026-12-03'), 3);
  assert.equal(tripInput.inclusiveTripDays('2026-12-03', '2026-12-03'), 1);
  assert.equal(tripInput.inclusiveTripDays('2026-12-04', '2026-12-03'), null);
  assert.equal(tripInput.inclusiveTripDays('2026-02-30', '2026-03-02'), null);
});

test('API payload sends only selected interests and leaves flexible dates and unknown budget unset', () => {
  const payload = tripInput.toTripParametersPayload({
    destination: 'Huế',
    days: 2,
    numPeople: 2,
    startDate: null,
    interests: ['nature', 'beach'],
    budget: null,
    budgetScope: 'PER_PERSON',
  });
  assert.deepEqual({ ...payload, preferences: [...payload.preferences] }, {
    destination: 'Huế',
    days: 2,
    num_people: 2,
    start_date: null,
    preferences: ['nature', 'beach'],
  });

  const noInterests = tripInput.toTripParametersPayload({
    destination: 'Đà Nẵng', days: 3, numPeople: 2, startDate: null, interests: [], budget: null, budgetScope: 'PER_PERSON',
  });
  assert.deepEqual([...noInterests.preferences], []);
  assert.equal(Object.hasOwn(noInterests, 'total_budget'), false);
  assert.equal(Object.hasOwn(noInterests, 'budget_amount'), false);
});

test('API payload keeps amount, scope, applicable guests, and normalized total consistent', () => {
  const calculation = budget.calculateTripBudget('3000000', 'PER_PERSON', 2, 0);
  const payload = tripInput.toTripParametersPayload({
    destination: 'Đà Nẵng', days: 3, numPeople: 2, startDate: '2026-12-01',
    interests: ['nature', 'beach'], budget: calculation, budgetScope: 'PER_PERSON',
  });
  assert.deepEqual({ ...payload, preferences: [...payload.preferences] }, {
    destination: 'Đà Nẵng', days: 3, num_people: 2, start_date: '2026-12-01',
    preferences: ['nature', 'beach'], total_budget: 6_000_000, budget_amount: 3_000_000,
    budget_scope: 'PER_PERSON', budget_traveler_count: 2,
  });
});

test('validation and workspace failures never report a saved trip', async () => {
  let buildCalls = 0;
  let saveCalls = 0;
  await assert.rejects(
    tripInput.validateThenPersistTrip(
      async () => { throw new Error('validation API failed'); },
      () => { buildCalls += 1; return { id: 'fake' }; },
      async () => { saveCalls += 1; },
    ),
    /validation API failed/,
  );
  assert.equal(buildCalls, 0);
  assert.equal(saveCalls, 0);

  await assert.rejects(
    tripInput.validateThenPersistTrip(
      async () => ({ valid: true, data: { destination: 'Huế' } }),
      (data) => { buildCalls += 1; return { destination: data.destination }; },
      async () => { saveCalls += 1; throw new Error('workspace save failed'); },
    ),
    /workspace save failed/,
  );
  assert.equal(buildCalls, 1);
  assert.equal(saveCalls, 1);

  await assert.rejects(
    tripInput.validateThenPersistTrip(
      async () => ({ valid: false, data: null }),
      () => { buildCalls += 1; return { id: 'invalid' }; },
      async () => { saveCalls += 1; },
    ),
    /chưa được máy chủ xác nhận/i,
  );
  assert.equal(buildCalls, 1);
  assert.equal(saveCalls, 1);
});

test('trip workspace saves and reloads the original amount, scope, normalized total, and Who counts', async () => {
  let serverTrip = null;
  const fetchJson = async (path, init) => {
    if (path.startsWith('/trip-workspaces/') && init?.method === 'PUT') {
      serverTrip = { ...JSON.parse(init.body).data, workspaceRevision: 1 };
      return serverTrip;
    }
    if (path === '/trip-workspaces') {
      return { items: serverTrip ? [serverTrip] : [], deleted_ids: [] };
    }
    if (path === '/my-trips') return [];
    throw new Error(`Unexpected workspace request: ${path}`);
  };
  const storage = { getItem: () => 'test-token' };
  const service = loadTypeScript(
    new URL('../src/services/tripWorkspace.ts', import.meta.url),
    () => ({ fetchJson }),
    { localStorage: storage, sessionStorage: storage },
  );

  const workspaceFields = tripInput.toTripWorkspaceInputFields({
    dateMode: 'flex',
    startDate: null,
    endDate: null,
    days: 3,
    flexibleMonth: 'Tháng 12',
    peopleCount: 4,
    adults: 2,
    children: 1,
    infants: 1,
    pets: 1,
    interests: ['nature', 'beach'],
    notes: 'Muốn khám phá địa phương.',
    budget: budget.calculateTripBudget('3000000', 'PER_PERSON', 2, 1),
    budgetScope: 'PER_PERSON',
  });
  const trip = {
    id: 'budget-roundtrip',
    title: 'Budget roundtrip',
    destination: 'Đà Nẵng',
    createdAt: '2026-11-21T00:00:00.000Z',
    ...workspaceFields,
    greenWeight: 72.5,
    budgetWeight: 27.5,
  };
  await service.saveTripWorkspace(trip);
  const reopened = (await service.listTripWorkspaces())[0];

  assert.equal(reopened.budgetInputAmount, 3_000_000);
  assert.equal(reopened.budgetScope, 'PER_PERSON');
  assert.equal(reopened.totalBudget, 9_000_000);
  assert.equal(reopened.adultCount, 2);
  assert.equal(reopened.childCount, 1);
  assert.equal(reopened.infantCount, 1);
  assert.equal(reopened.petCount, 1);
  assert.equal(reopened.peopleCount, 4);
  assert.equal(reopened.tripInputVersion, 1);
  assert.equal(reopened.greenWeight, 72.5);
  assert.equal(reopened.budgetWeight, 27.5);
  assert.equal(reopened.dateMode, 'flex');
  assert.equal(reopened.startDate, null);
  assert.equal(reopened.endDate, null);
  assert.equal(reopened.daysCount, 3);
  assert.equal(reopened.flexibleDays, 3);
  assert.equal(reopened.flexibleMonth, 'Tháng 12');
  assert.deepEqual([...reopened.interests], ['nature', 'beach']);
  assert.equal(reopened.notes, 'Muốn khám phá địa phương.');
});
