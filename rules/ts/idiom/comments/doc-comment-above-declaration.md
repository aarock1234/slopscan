---
severity: info
detect: judge
falsePositives:
  - >-
    a short trailing comment on a single value inside an object or array
    literal, such as a unit or a magic number's meaning
  - >-
    directive comments such as `eslint-disable` or `@ts-expect-error`, which
    must sit where the tool expects them
  - >-
    a comment on a line of its own inside a function body that explains the
    following statement
jev:
  threshold: 0.6
---

## Why

A comment that documents a declaration belongs on the line directly above it, as a `//` or `/** */` block, so editors show it on hover and a reader finds it before the signature rather than after. A trailing comment at the end of a declaration line is easy to miss, wraps badly, and is not picked up as documentation. Explanations inside the body of a function describe the body, not the contract.

## Message

declaration documented in a trailing comment; put the comment on the line above

## Bad

```ts
// BAD: the doc is a trailing comment the tooling cannot see
export function parseDuration(input: string): number { // parses "5m", "2h" into milliseconds
	return toMilliseconds(input);
}
```

## Good

```ts
// parses "5m" or "2h" into milliseconds
export function parseDuration(input: string): number {
	return toMilliseconds(input);
}
```

```ts
/**
 * retries the operation up to three times with exponential backoff, then rethrows
 */
export function retry<T>(operation: () => Promise<T>): Promise<T> {
	return withBackoff(operation, 3);
}
```
