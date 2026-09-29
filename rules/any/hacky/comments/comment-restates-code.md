---
severity: minor
detect: judge
falsePositives:
  - 'doc comments on exported symbols that state the contract, even when short'
  - 'comments explaining why, a constraint, or a non-obvious consequence'
jev:
  threshold: 0.54
---

## Why

A comment that says what the next line already says is noise the reader has to check against the code, and it goes stale the first time the code changes. Comments earn their place by saying why, naming a constraint, or warning about a consequence the code cannot show.

## Message

comment restates the code; say why or delete it

## Bad

```ts
// BAD: the comment is the line, in English
// increment the counter
counter += 1;
```

```go
func total(orders []Order) int {
	sum := 0
	// BAD: the comment is the loop, in English
	// loop over the orders and add up the amounts
	for _, order := range orders {
		sum += order.Amount
	}

	return sum
}
```

## Good

```ts
// the API rejects batches over 100 items, so chunk before sending
const batches = chunk(items, 100);
```

```go
// Find returns ErrNotFound rather than a nil user so callers cannot forget the missing case.
func Find(id string) (*User, error) {
	return repo.Find(id)
}
```
