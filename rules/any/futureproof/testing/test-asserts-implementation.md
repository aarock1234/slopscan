---
severity: minor
detect: judge
falsePositives:
  - >-
    asserting that a collaborator at a boundary received the right call, such as
    the mailer being sent the right message, when that call is the observable
    outcome
  - >-
    calling an unexported or private pure function directly and asserting on its
    return value
  - >-
    reaching into unexported fields to set up state before exercising the public
    behavior
  - >-
    asserting call counts for behavior the contract promises, such as a cache
    hitting the loader exactly once
jev:
  threshold: 0.54
---

## Why

A test that spies on private methods or inspects unexported fields passes only while the code is written one particular way, so a refactor that keeps every behavior still turns the suite red and teaches people to delete tests. It also documents nothing a caller can rely on. Assert on what the caller sees: return values, thrown errors, persisted state, and calls to external systems.

## Message

test asserts on internals; assert on observable behavior instead

## Bad

```ts
it('creates a user', async () => {
	const service = new UserService(repo);
	// BAD: the test is coupled to a private helper's name and arguments
	const spy = vi.spyOn(service as never, 'normalizeEmail');

	await service.create({ email: 'Ada@Example.com' });

	expect(spy).toHaveBeenCalledWith('Ada@Example.com');
});
```

```go
func TestPutStoresEntry(t *testing.T) {
	c := cache.New()

	c.Put("k", []byte("v"))

	// BAD: the test knows the map is called entries and breaks when storage changes
	if len(c.entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(c.entries))
	}
}
```

## Good

```ts
it('creates a user with a normalized email', async () => {
	const service = new UserService(repo);

	const user = await service.create({ email: 'Ada@Example.com' });

	expect(user.email).toBe('ada@example.com');
	expect(await repo.findById(user.id)).toEqual(user);
});
```

```go
func TestPutThenGet(t *testing.T) {
	c := cache.New()

	c.Put("k", []byte("v"))

	got, ok := c.Get("k")
	if !ok || string(got) != "v" {
		t.Fatalf("Get(k) = %q, %v; want v, true", got, ok)
	}
}
```
