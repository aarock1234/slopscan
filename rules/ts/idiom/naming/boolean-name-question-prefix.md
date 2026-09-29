---
severity: minor
detect: judge
falsePositives:
  - >-
    names that already read as a yes/no question with a prefix like `is`, `has`,
    `should`, `can`, `was`, `needs`, or `allows`
  - >-
    boolean properties whose name is dictated by an external schema, framework
    prop, or API response
  - loop or callback parameters of one or two letters in a very short scope
  - >-
    any identifier whose type is not boolean, including functions that return
    objects, arrays, promises of non-booleans, or nothing
jev:
  threshold: 0.48
guide:
  - ts.naming
---

## Why

A boolean whose name is a bare noun or verb, such as `valid`, `children`, or `retry`, forces the reader to look up its type before an `if` on it makes sense. Names that read as a yes/no question, such as `isValid`, `hasChildren`, or `shouldRetry`, carry the type in the name and make conditions read as prose. The rule applies only to identifiers whose type is boolean: a variable holding a comparison, a parameter typed `boolean`, or a function whose return type is `boolean`. A function that returns anything else is outside this rule no matter what it is called.

## Message

boolean name does not read as a question; prefix with is, has, should, or can

## Bad

```ts
// BAD: valid could be a noun, a verb, or an adjective
const valid = schema.safeParse(data).success;

// BAD: children sounds like a collection, not a flag
const children = node.children.length > 0;

// BAD: retry reads as an action, but it returns a yes/no answer
function retry(attempt: number, error: Error): boolean {
	return attempt < 3 && error instanceof TimeoutError;
}
```

```ts
// BAD: a boolean parameter named like a noun
function render(report: Report, color: boolean): string {
	return color ? paint(report) : plain(report);
}
```

## Good

```ts
const isValid = schema.safeParse(data).success;
const hasChildren = node.children.length > 0;

function shouldRetry(attempt: number, error: Error): boolean {
	return attempt < 3 && error instanceof TimeoutError;
}
```

```ts
// GOOD: none of these return a boolean, so their names are not this rule's concern
async function confirm(findings: readonly Finding[]): Promise<ConfirmResult> {
	return { kept: findings, rejected: [] };
}

function scoreRange(options: ScanOptions): Promise<RangeResult> {
	return scoreFindings(options);
}

function dedupe(findings: readonly Finding[]): Finding[] {
	return [...new Set(findings)];
}
```
