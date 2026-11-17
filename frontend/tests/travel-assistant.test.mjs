import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function service(fetchJson) {
  const source = readFileSync(
    new URL("../src/services/travelAssistant.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    URLSearchParams,
    require: () => ({ fetchJson }),
  });
  return exports;
}
test("Assistant history preserves account API, trip, mode and cancellation boundary", async () => {
  let requested;
  const api = service(async (path, init) => {
    requested = { path, init };
    return { messages: [] };
  });
  const signal = new AbortController().signal;
  await api.loadAssistant("planner", "trip with & space", signal);
  const query = new URLSearchParams(requested.path.split("?")[1]);
  assert.equal(query.get("trip_id"), "trip with & space");
  assert.equal(query.get("mode"), "planner");
  assert.equal(requested.init.signal, signal);
});
test("Chat preserves selected card ID and context; only explicit Apply calls the write endpoint", async () => {
  const calls = [];
  const api = service(async (path, init) => {
    calls.push({ path, payload: JSON.parse(init.body) });
    return { text: "Bản nháp" };
  });
  await api.chatAssistant(
    "Lưu chỗ thứ hai vào Ý tưởng",
    "discover",
    "trip-a",
    { idea_ids: ["prior"], destination: "Huế" },
    "actual-card-id",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/assistant/chat");
  assert.equal(calls[0].payload.selected_poi_id, "actual-card-id");
  assert.deepEqual(calls[0].payload.context.idea_ids, ["prior"]);
  await api.applyAssistant("confirmed-draft", "planner", "trip-a");
  assert.equal(calls[1].path, "/assistant/apply");
  assert.deepEqual(calls[1].payload, {
    draft_id: "confirmed-draft",
    mode: "planner",
    trip_id: "trip-a",
    conversation_id: 1,
  });
});

test("All assistant operations use the selected conversation", async () => {
  const calls = [];
  const api = service(async (path, init) => { calls.push({path, init}); return {messages: []}; });
  await api.loadAssistant("planner", "t", undefined, 3);
  assert.equal(new URLSearchParams(calls[0].path.split("?")[1]).get("conversation_id"), "3");
  await api.chatAssistant("xin chào", "planner", "t", {}, undefined, 2);
  await api.applyAssistant("draft", "planner", "t", 2);
  assert.equal(JSON.parse(calls[1].init.body).conversation_id, 2);
  assert.equal(JSON.parse(calls[2].init.body).conversation_id, 2);
});
