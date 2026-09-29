---
severity: minor
detect: ast
ast:
  ts:
    rule:
      any:
        - kind: string
          regex: '^["'']https?://'
        - kind: template_string
          regex: '^`https?://'
      not:
        regex: 'https?://(www\.)?w3\.org|https?://schemas\.|https?://json-schema\.org'
  go:
    rule:
      any:
        - kind: interpreted_string_literal
          regex: '^"https?://'
        - kind: raw_string_literal
          regex: '^`https?://'
      not:
        regex: 'https?://(www\.)?w3\.org|https?://schemas\.|https?://json-schema\.org'
ignore:
  - '**/config/**'
  - '**/config.ts'
  - '**/config.go'
  - '**/constants.ts'
  - '**/constants.go'
  - '**/*.config.ts'
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
  - '**/testdata/**'
  - '**/fixtures/**'
  - '**/__mocks__/**'
guide:
  - go.http-usage
---

## Why

A URL written inline is an environment decision buried in logic: it points at production from a test run, at staging after a deploy, and at nothing once the host moves. Every environment change becomes a code change and a search across the repo. Read the base URL from configuration and build paths on top of it.

## Message

hardcoded url in logic; read the base url from config and build the path on it

## Bad

```ts
export async function fetchUser(id: string): Promise<User> {
	// BAD: the host is fixed in code
	const response = await fetch(`https://api.example.com/users/${id}`);

	return userSchema.parse(await response.json());
}
```

```go
func FetchUser(ctx context.Context, id string) (User, error) {
	// BAD: the host is fixed in code
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.example.com/users/"+id, nil)
	if err != nil {
		return User{}, fmt.Errorf("building request: %w", err)
	}

	return doUser(req)
}
```

## Good

```ts
export async function fetchUser(config: ApiConfig, id: string): Promise<User> {
	const response = await fetch(new URL(`/users/${id}`, config.baseUrl));

	return userSchema.parse(await response.json());
}
```

```go
func (c *Client) FetchUser(ctx context.Context, id string) (User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL.JoinPath("users", id).String(), nil)
	if err != nil {
		return User{}, fmt.Errorf("building request: %w", err)
	}

	return c.doUser(req)
}
```
