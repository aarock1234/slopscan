---
severity: info
detect: judge
falsePositives:
  - a block whose only statement is the return
  - >-
    a return that directly follows the opening brace of an if, else, or case
    body
  - a one-line function body
jev:
  threshold: 0.87
guide:
  - go.spacing
---

## Why

A blank line before `return` separates the work of a function from its result, so the eye lands on the exit without reading through the last loop or condition. When the return is glued to the statement above it, the two read as one unit and the function's shape is harder to scan.

## Message

return has a blank line before it unless it is the only statement in the block

## Bad

```go
func total(items []Item) int {
	sum := 0
	for _, item := range items {
		sum += item.Value
	}
	// BAD: return glued to the loop above it
	return sum
}
```

## Good

```go
func total(items []Item) int {
	sum := 0
	for _, item := range items {
		sum += item.Value
	}

	return sum
}
```

```go
func name(item Item) string {
	return item.Name
}
```
