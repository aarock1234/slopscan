---
severity: minor
detect: ast
ignore:
  - '**/*_test.go'
ast:
  rule:
    any:
      - pattern: 'map[string]any'
      - pattern: 'map[string]interface{}'
guide:
  - go.json-boundaries
  - go.type-preferences
---

## Why

A `map[string]any` pushes every field access to runtime with a type assertion and a nil check, and the compiler can no longer tell you when a field is renamed. When the shape is known, decode JSON and config into a struct, and use a typed map for a genuinely keyed collection. `map[string]any` is right only when the structure is truly dynamic, such as plugin configuration or user-defined metadata, and that case is not a reason to reach for generics either; the matcher cannot tell the two apart, so a hit on a documented dynamic shape is fine to leave. Tests are excluded: decoding a payload into a map to inspect it is the honest way to assert on wire format.

## Message

map[string]any defers every field to runtime; decode into a struct unless the shape is truly dynamic

## Bad

```go
func parse(raw []byte) error {
	// BAD: every access is an assertion waiting to fail
	var payload map[string]any

	return json.Unmarshal(raw, &payload)
}
```

## Good

```go
type Payload struct {
	UserID string `json:"user_id"`
	Amount int    `json:"amount"`
}

func parse(raw []byte) (Payload, error) {
	var payload Payload

	if err := json.Unmarshal(raw, &payload); err != nil {
		return Payload{}, fmt.Errorf("decoding payload: %w", err)
	}

	return payload, nil
}
```
