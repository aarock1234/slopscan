---
severity: minor
detect: ast
ast:
  rule:
    any:
      - pattern: process.env.$NAME
      - pattern: 'process.env[$NAME]'
      - pattern: import.meta.env.$NAME
ignore:
  - '**/config/**'
  - '**/config.ts'
  - '**/env.ts'
  - '**/env/**'
  - '**/*.config.ts'
  - '**/*.config.mts'
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/scripts/**'
guide:
  - ts.boundary-and-domain-contracts
  - ts.project-structure
---

## Why

Reading `process.env` in the middle of a module scatters the list of variables the program needs across the codebase, so nobody can say what a deployment requires without grepping. Each read is an untyped, possibly undefined string that gets parsed and defaulted differently in every place. Read and validate the environment once in a config module and pass typed values from there.

## Message

environment read outside the config module; validate env once and pass typed config

## Bad

```ts
export async function sendEmail(message: Message): Promise<void> {
	// BAD: an untyped, unvalidated read buried in logic
	const apiKey = process.env.SENDGRID_API_KEY;

	await client.send(apiKey ?? '', message);
}
```

```ts
// BAD: the same variable is parsed differently in every module that reads it
const timeoutMs = Number(process.env['HTTP_TIMEOUT_MS'] ?? 5000);
```

## Good

```ts
export async function sendEmail(config: EmailConfig, message: Message): Promise<void> {
	await client.send(config.apiKey, message);
}
```

```ts
const timeoutMs = config.http.timeoutMs;
```
