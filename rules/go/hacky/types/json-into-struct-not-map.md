---
severity: major
detect: judge
falsePositives:
  - >-
    a genuinely dynamic shape such as user-defined metadata or plugin
    configuration
  - >-
    map[string]json.RawMessage used for a two-phase decode on a discriminator
    field
  - pass-through data that is never read by field name
jev:
  threshold: 0.5
guide:
  - go.json-boundaries
---

## Why

Decoding JSON into a map and then reading `m["name"]` moves every field name and type into runtime lookups, so a renamed field or a wrong type compiles fine and fails on the first request. A struct with tags gives the decoder the shape up front, validates types on unmarshal, and lets the compiler catch a misspelled field.

## Message

json decoded into a map; declare a struct with tags so fields are checked at compile time

## Bad

```go
func parse(raw []byte) (string, error) {
	// BAD: fields live in string keys that nothing checks
	var payload map[string]string
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", err
	}

	return payload["name"], nil
}
```

## Good

```go
type Request struct {
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
}

func parse(raw []byte) (Request, error) {
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		return Request{}, fmt.Errorf("decoding request: %w", err)
	}

	return req, nil
}
```
