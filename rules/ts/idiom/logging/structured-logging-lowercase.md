---
severity: minor
detect: ast
ast:
  rule:
    pattern: $LOGGER.$METHOD($$$ARGS)
    has:
      kind: arguments
      has:
        all:
          - any:
              - kind: string
              - kind: template_string
          - any:
              - nthChild: 1
              - nthChild: 2
        regex: '^.[A-Z][a-z]'
  constraints:
    METHOD:
      regex: ^(log|info|warn|error|debug|trace|fatal)$
guide:
  - ts.logging
---

## Why

Log lines are grepped and read in bulk, and a mix of `Starting server` and `connected to database` makes the stream look like it came from two systems. Messages are lowercase fragments, with proper nouns and acronyms kept as they are, and variable data goes in the structured fields rather than the sentence. Pino takes the fields object first and the message second, so the message is checked wherever it sits. A consistent shape makes the output scannable and the fields queryable.

## Message

log message starts with a capital letter; write it as a lowercase fragment

## Bad

```ts
// BAD: capitalized sentence in a log line
logger.info({ port }, 'Starting server');
```

```ts
// BAD: console output follows the same convention
console.error('Failed to connect', error);
```

## Good

```ts
logger.info({ port }, 'starting server');
logger.error({ err: error }, 'failed to connect');
```

```ts
logger.info('connecting to PostgreSQL');
```
