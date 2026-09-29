---
severity: minor
detect: ast
ast:
  rule:
    kind: ternary_expression
    inside:
      kind: ternary_expression
      stopBy:
        not:
          kind: parenthesized_expression
guide:
  - ts.ternaries
---

## Why

A ternary is readable when it has one condition and two outcomes. Nesting another inside turns it into a puzzle the reader has to unfold, and the precedence rules do not help. Use an if chain, a switch, or a lookup object.

## Message

nested ternary; use an if chain, a switch, or a lookup

## Bad

```ts
// BAD: three outcomes folded into one expression
const label = count === 0 ? 'none' : count === 1 ? 'one' : 'many';
```

## Good

```ts
// GOOD: a ternary inside a callback is its own expression, not a nested branch
const handler = isEnabled ? () => (isDark ? darkTheme : lightTheme) : undefined;
```

```ts
// GOOD: one condition, two outcomes
const label = isEmpty ? 'none' : 'some';
```

```ts
// GOOD: a function names the branching
function describeCount(count: number): string {
	if (count === 0) {
		return 'none';
	}

	if (count === 1) {
		return 'one';
	}

	return 'many';
}
```
