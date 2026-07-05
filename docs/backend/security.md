# Security

## Sensitive Actions

The following categories always require approval before execution:

- Sending email
- Publishing to social networks
- Deleting or modifying files
- Executing terminal commands
- Modifying CRM records
- Modifying calendar events
- Sending messages
- Accessing tokens or secrets
- Calling expensive external services

## Approval System

Any skill with `requiresApproval: true` will:

1. Pause execution and emit `approval_requested`
2. Display a modal in the UI with tool name, description, risk level, and arguments
3. Wait for user decision (with configurable timeout via `APPROVAL_TIMEOUT_MS`)
4. If approved: execute
5. If rejected or timed out: cancel with explanation

## API Keys

- All secrets live in `.env` (never committed)
- `.env.example` contains only placeholder values
- No secret is ever logged or sent to the frontend

## Default Safe State

- `ENABLE_LOCAL_COMMANDS=false` — no terminal execution by default
- `LLM_PROVIDER=mock` — no external API calls by default
- `VOICE_PROVIDER=mock` — no ElevenLabs calls by default

## Future Hardening

- Docker sandbox for local command execution
- Path allowlist for file operations
- Audit log with append-only storage
- Rate limiting on approval endpoints
- Session tokens for WebSocket authentication
