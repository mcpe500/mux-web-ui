// Spec 014 (v0.6.4) Milestone D — AGX-003/AGX-006 drift drill.
// SYNTHETIC transcripts built BY HAND from the two documented schema
// generations of `codex exec --json` style output (spec §6 D-log fixture
// drill). Not recorded from a real CLI; each array is one session, ≥18
// lines, with interleaved reasoning noise / tool calls / results / errors.

/** SCHEMA-V1 — older CLI: events wrapped in {"msg":{...}} envelopes. */
export const CODEX_V1_SESSION: readonly string[] = [
  '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"Refactor auth middleware"}]}}',
  '{"msg":{"type":"reasoning","summary":[{"type":"summary_text","text":"plan: inspect routes first"}]}}',
  '{"msg":{"type":"reasoning","summary":[]}}',
  '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Auditing the middleware chain."}]}}',
  '{"msg":{"type":"function_call","call_id":"call_001","name":"shell","arguments":"{\\"cmd\\":[\\"rg\\",\\"auth\\"],\\"timeout_secs\\":10}"}}',
  '{"msg":{"type":"function_call_output","call_id":"call_001","output":"src/auth/middleware.ts:42 token expiry"}}',
  '{"msg":{"type":"reasoning","summary":[{"type":"summary_text","text":"token check uses < not <="}]}}',
  '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Token expiry uses strict less-than; fixing boundary."}]}}',
  '{"msg":{"type":"function_call","call_id":"call_002","name":"apply_patch","arguments":"{\\"patch\\":\\"- if ts < expiry\\\\n+ if ts <= expiry\\"}"}}',
  '{"msg":{"type":"function_call_output","call_id":"call_002","output":"patched src/auth/middleware.ts"}}',
  '{"msg":{"type":"function_call","call_id":"call_003","name":"shell","arguments":"{\\"cmd\\":[\\"cargo\\",\\"test\\"]}"}}',
  '{"msg":{"type":"function_call_output","call_id":"call_003","output":"test result: ok. 205 passed"}}',
  '{"msg":{"type":"reasoning","summary":[{"type":"summary_text","text":"all green"}]}}',
  '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Refactor complete, suite green."}]}}',
  '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"run clippy too"}]}}',
  '{"msg":{"type":"function_call","call_id":"call_004","name":"shell","arguments":"{\\"cmd\\":[\\"clippy\\"],\\"args\\":[\\"-D\\",\\"warnings\\"]}"}}',
  '{"msg":{"type":"function_call_output","call_id":"call_004","output":"no warnings"}}',
  '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Clippy clean as well."}]}}',
  '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done."}]}}',
];

/** SCHEMA-V2 — newer CLI: flat {"type":"item.completed"/"item.updated"} items. */
export const CODEX_V2_SESSION: readonly string[] = [
  '{"type":"item.completed","item":{"item_type":"message","role":"user","content":[{"type":"input_text","text":"Fix flaky reconnect test"}]}}',
  '{"type":"item.updated","item":{"item_type":"reasoning","id":"rs_1","summary":"reproducing locally"}}',
  '{"type":"item.updated","item":{"item_type":"command_execution","command":"rg -n backoff web/src/apps/terminal"}}',
  '{"type":"item.completed","item":{"item_type":"command_execution","command":"rg -n backoff web/src/apps/terminal","aggregated_output":"reconnect.ts:27 nextReconnectDelay","exit_code":0}}',
  '{"type":"item.completed","item":{"item_type":"message","role":"assistant","content":[{"type":"output_text","text":"Backoff lives in reconnect.ts."}]}}',
  '{"type":"item.updated","item":{"item_type":"reasoning","id":"rs_2","summary":"jitter hypothesis"}}',
  '{"type":"item.completed","item":{"item_type":"reasoning","id":"rs_2"}}',
  '{"type":"item.updated","item":{"item_type":"command_execution","command":"cargo test next_reconnect_delay"}}',
  '{"type":"item.completed","item":{"item_type":"command_execution","command":"cargo test next_reconnect_delay","aggregated_output":"1 failed / 6 passed","exit_code":101}}',
  '{"type":"error","message":"rate limit near: slow down"}',
  '{"type":"item.updated","item":{"item_type":"reasoning","id":"rs_3","summary":"cap test assumes 10s ceiling"}}',
  '{"type":"item.updated","item":{"item_type":"command_execution","command":"apply_patch --diff <<PATCH"}}',
  '{"type":"item.completed","item":{"item_type":"command_execution","command":"apply_patch --diff <<PATCH","aggregated_output":"patched reconnect.test.ts","exit_code":0}}',
  '{"type":"item.updated","item":{"item_type":"command_execution","command":"cargo test next_reconnect_delay"}}',
  '{"type":"item.completed","item":{"item_type":"command_execution","command":"cargo test next_reconnect_delay","aggregated_output":"7 passed","exit_code":0}}',
  '{"type":"item.completed","item":{"item_type":"message","role":"assistant","content":[{"type":"output_text","text":"Fixed and green."}]}}',
  '{"type":"item.completed","item":{"item_type":"message","role":"user","content":[{"type":"input_text","text":"commit it"}]}}',
  '{"type":"item.updated","item":{"item_type":"reasoning","id":"rs_4","summary":"staging only whitelist files"}}',
  '{"type":"item.completed","item":{"item_type":"command_execution","command":"git add -p","aggregated_output":"staged 3 files","exit_code":0}}',
  '{"type":"item.completed","item":{"item_type":"message","role":"assistant","content":[{"type":"output_text","text":"Committed on feature branch."}]}}',
];
