---
severity: minor
detect: ast
ast:
  ts:
    rule:
      any:
        - pattern: console.log($$$ARGS)
        - pattern: console.debug($$$ARGS)
        - pattern: console.dir($$$ARGS)
        - pattern: console.table($$$ARGS)
  go:
    rule:
      kind: call_expression
      has:
        field: function
        regex: ^(fmt\.Print(ln|f)?|println|print)$
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/cli.ts'
  - '**/scripts/**'
  - '**/bin/**'
  - '**/main.go'
  - '**/cmd/**'
  - '**/*_test.go'
guide:
  - go.logging
  - ts.logging
  - ts.options
---

## Why

A print statement left in library code writes unstructured text to stdout with no level, no context, and no way to turn it off, and it pollutes the output of any program that embeds this code. Use the project's logger so the line carries a level and structured fields and can be filtered or shipped. If the line was for debugging, delete it.

## Message

debug print in library code; use the structured logger or remove it

## Bad

```ts
export async function createUser(input: CreateUserInput): Promise<User> {
	// BAD: unstructured stdout with no level
	console.log('creating user', input.email);

	return repo.insert(input);
}
```

```go
func CreateUser(ctx context.Context, in CreateUserInput) (User, error) {
	// BAD: unstructured stdout with no level
	fmt.Println("creating user", in.Email)

	return repo.Insert(ctx, in)
}
```

## Good

```ts
export async function createUser(input: CreateUserInput): Promise<User> {
	logger.info({ email: input.email }, 'creating user');

	return repo.insert(input);
}
```

```go
func CreateUser(ctx context.Context, in CreateUserInput) (User, error) {
	slog.InfoContext(ctx, "creating user", "email", in.Email)

	return repo.Insert(ctx, in)
}
```
