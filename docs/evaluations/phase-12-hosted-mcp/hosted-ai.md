# Hosted model-backed verification evidence

- Date: 2026-08-01
- Command: `bun --env-file=.env.local run verify:hosted:ai`
- Provider: Gemini from a trusted local client
- Hosted MCP preflight: PASS
- Status: PASS

## Result

- Approved scenarios completed: 9 of 9
- Provider requests were sequential: true
- Model calls: 18
- Input tokens: 10,907
- Output tokens: 969
- Total tokens: 13,007
- `commerceStateChanged=false`
- `hostedMcpVerifiedBeforeProviderCalls=true`
- Duration: approximately 187 seconds

The model provider was used only for natural-language interaction and approved tool selection. Deterministic workflow results remained authoritative. The Gemini key remained local and was not installed on EC2.
