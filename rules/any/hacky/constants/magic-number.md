---
severity: minor
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
  - '**/constants.ts'
  - '**/constants.go'
  - '**/testdata/**'
  - '**/fixtures/**'
falsePositives:
  - 'the literals 0, 1, -1, 2, and 100, and small loop bounds or step sizes'
  - 'array, slice, or tuple indexes and offsets'
  - >-
    the right-hand side of a named constant declaration, which is where the
    number belongs
  - >-
    a unit conversion factor next to a named constant, such as `const TIMEOUT_MS
    = 30 * 1000`
  - >-
    well-known protocol values where the call name makes the meaning obvious,
    such as `res.status(404)` or `os.Exit(1)`
  - >-
    numbers in a plain arithmetic formula whose surrounding function name
    explains them, such as a percentage or area calculation
jev:
  threshold: 0.36
---

## Why

A bare `30000` in a call or a comparison forces every reader to guess what it means and whether the `30000` forty lines down is the same thing. When the value has to change, the search finds every unrelated occurrence too. Give the number a name that says what it is, and reuse that name so the two places cannot drift.

## Message

magic number in logic; name it as a constant that says what it means

## Bad

```ts
async function pollJob(id: string): Promise<Job> {
	let attempts = 0;

	while (true) {
		const job = await fetchJob(id);
		// BAD: nobody knows why five, or whether the five below is the same five
		if (job.done || attempts > 5) {
			return job;
		}

		attempts += 1;
		// BAD: a duration with no name
		await delay(1500);
	}
}
```

```go
func (s *Service) ListRecent(ctx context.Context) ([]Item, error) {
	// BAD: nobody knows whether 250 is a page size, an API cap, or a guess
	items, err := s.repo.List(ctx, 250)
	if err != nil {
		return nil, fmt.Errorf("listing items: %w", err)
	}

	return items, nil
}
```

## Good

```ts
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

async function pollJob(id: string): Promise<Job> {
	let attempts = 0;

	while (true) {
		const job = await fetchJob(id);
		if (job.done || attempts > MAX_POLL_ATTEMPTS) {
			return job;
		}

		attempts += 1;
		await delay(POLL_INTERVAL_MS);
	}
}
```

```go
// recentPageSize matches the upstream API's maximum page size.
const recentPageSize = 250

func (s *Service) ListRecent(ctx context.Context) ([]Item, error) {
	items, err := s.repo.List(ctx, recentPageSize)
	if err != nil {
		return nil, fmt.Errorf("listing items: %w", err)
	}

	return items, nil
}
```
