# Architecture

## Monorepo Layout

```
wattson-os/
├── apps/
│   ├── web/       Vite + React frontend
│   └── api/       Fastify backend
└── packages/
    ├── shared/    Types shared across all packages
    ├── agent-core/ Core agent loop, LLM provider, router
    ├── skills/    Skill registry and implementations
    ├── memory/    Prisma + SQLite persistence
    └── voice/     TTS/STT abstraction
```

## Message Flow

```
User types message
  → POST /chat
  → Agent runs async:
      1. Save user message
      2. Route intent (heuristic)
      3. If skill matched: execute skill
         a. If requiresApproval: emit approval_requested, wait
         b. Execute skill, emit tool_call_started/completed
      4. Build prompt (system + history + memories + tool result)
      5. Stream LLM response as message_delta events
      6. Emit message_done
      7. Save assistant message
  → All events broadcast via WebSocket to connected clients
```

## WebSocket Events

All agent activity is pushed as `AgentEvent` objects. See `packages/shared/src/events.ts`.

## Approval Flow

```
skill.requiresApproval = true
  → Create Approval record in DB
  → Emit approval_requested via WS
  → Frontend shows ApprovalModal
  → User clicks Approve / Reject
  → Frontend sends { type: "approval_decision", approvalId, approved } via WS
  → ApprovalManager resolves the pending promise
  → If approved: execute skill
  → If rejected: respond with cancellation message
```

## LLM Provider Abstraction

```
LLM_PROVIDER=mock  → mockProvider (zero deps, works offline)
LLM_PROVIDER=openai → OpenAI gpt-4o-mini (needs OPENAI_API_KEY)
```

Future: anthropicProvider, openRouterProvider, ollamaProvider

## Skill Registry

Each skill declares: name, description, inputSchema, requiresApproval, riskLevel, permissions.
The agent core uses the registry to find skills by name, execute them, and log all calls to DB.
