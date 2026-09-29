---
severity: major
detect: judge
falsePositives:
  - '`as const` on a literal, which narrows rather than widens'
  - >-
    a cast inside a branded-type constructor such as `return id as UserId`,
    where the function is the single point that mints the brand
  - >-
    a cast that follows a runtime check in the same block, such as after
    `typeof`, `in`, or `Array.isArray`
  - >-
    a cast to `unknown` on its own, which discards type information rather than
    inventing it
jev:
  threshold: 0.5
guide:
  - ts.boundary-and-domain-contracts
  - ts.branded-types
  - ts.type-guards
---

## Why

`value as T` does not check anything at runtime; it tells the compiler to stop looking. Used on data that came from outside the program, such as a request body, a parsed file, a database row, or an environment variable, it turns a type error into a crash or silent corruption somewhere downstream. Validate external data with a schema or a type guard and let the type come from the check.

## Message

type assertion on unvalidated data; validate with a schema or a type guard instead

## Bad

```ts
app.post('/users', async (req, res) => {
	// BAD: whatever the client sent is now a CreateUserInput as far as the compiler knows
	const input = req.body as CreateUserInput;

	res.json(await createUser(input));
});
```

```ts
// BAD: env vars may be undefined; the cast promises otherwise
const apiKey = process.env.API_KEY as string;
```

## Good

```ts
app.post('/users', async (req, res) => {
	const input = createUserSchema.parse(req.body);

	res.json(await createUser(input));
});
```

```ts
const env = envSchema.parse(process.env);
const apiKey = env.API_KEY;
```

```ts
function UserId(id: string): UserId {
	return id as UserId;
}
```
