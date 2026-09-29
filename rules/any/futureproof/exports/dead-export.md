---
severity: minor
detect: judge
confirm: refCount
ignore:
    - '**/index.ts'
    - '**/*.test.ts'
    - '**/*.spec.ts'
    - '**/*_test.go'
falsePositives:
    - the public API of a library package or a package entry point, where callers live outside this repository
    - CLI binaries, `main`, `init`, and framework entry points such as route or plugin registrations
    - symbols reached by reflection, templates, serialization tags, or generated code
    - methods that exist to satisfy an interface, such as `String()` or `MarshalJSON()`
    - types and constants that describe a wire format or database schema, which are referenced by name only in data
---

## Why

An exported symbol that nothing references is code that must still compile, be reviewed, and be kept consistent with every refactor, while offering nothing in return. Exporting it also signals to readers that something depends on it, so they leave it alone. Delete it; version control remembers it if it is ever needed.

## Message

exported symbol is referenced nowhere; delete it or make it private

## Bad

```ts
// BAD: exported but no caller in the repository
export function formatLegacyDate(date: Date): string {
	return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
```

```go
// BAD: exported but no caller in the repository
func FormatLegacyDate(t time.Time) string {
	return t.Format("2/1/2006")
}

func FormatDate(t time.Time) string {
	return t.Format(time.DateOnly)
}
```

## Good

```ts
export function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function renderReceipt(order: Order): string {
	return `${order.id} ${formatDate(order.placedAt)}`;
}
```

```go
func FormatDate(t time.Time) string {
	return t.Format(time.DateOnly)
}

func RenderReceipt(o Order) string {
	return o.ID + " " + FormatDate(o.PlacedAt)
}
```
