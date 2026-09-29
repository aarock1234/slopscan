---
severity: info
detect: judge
falsePositives:
  - the variable is read again after its address is taken
  - the module targets a Go version older than 1.26
jev:
  threshold: 0.46
---

## Why

Since Go 1.26 `new` accepts an expression, so an optional pointer field can be set inline with `new(yearsSince(born))`. A throwaway local declared only so `&` has something to point at adds a name and a line that carry no meaning.

## Message

temporary declared only to take its address; use new(expr)

## Bad

```go
func person(name string, born time.Time) Person {
	// BAD: age exists only so its address can be taken
	age := yearsSince(born)

	return Person{
		Name: name,
		Age:  &age,
	}
}
```

## Good

```go
func person(name string, born time.Time) Person {
	return Person{
		Name: name,
		Age:  new(yearsSince(born)),
	}
}
```
