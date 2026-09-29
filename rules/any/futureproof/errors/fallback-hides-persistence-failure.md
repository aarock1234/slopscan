---
severity: major
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
falsePositives:
  - >-
    a catch that only logs and rethrows, or wraps the error with context,
    whatever it covers
  - a retry loop around one idempotent operation
  - >-
    a best-effort side effect such as a metric or a progress event, where losing
    it changes nothing
  - >-
    a top-level boundary that maps any failure to one response, such as an http
    handler or a job runner
jev:
  threshold: 0.51
---

## Why

A `try` that covers both computing a result and persisting it, with one `catch` that selects a fallback, makes a transient storage error change the program's meaning: the correct result already existed, the write failed, and the caller now runs a different computation and may persist a different answer over the one that should have been kept. Compute and fall back are one decision; persisting the decided result is another. Resolve the fallback before persistence, and let a storage failure stay a storage failure that the persistence step retries or reports.

## Message

one catch covers computing and persisting, so a storage error selects a different result; separate the two

## Bad

```ts
// BAD: a failed save returns the same false as a failed grade, and the caller runs the legacy grader
async function gradeWithRubric(attempt: Attempt): Promise<boolean> {
	try {
		const outcome = await rubric.grade(attempt);
		await storage.saveGrade(attempt.id, outcome, { grader: 'rubric' });

		return true;
	} catch (error) {
		logger.error('rubric grading failed; falling back to the legacy grader', { error });

		return false;
	}
}
```

```go
// BAD: a write error and a compute error take the same fallback branch
func gradeWithRubric(ctx context.Context, attempt Attempt) (bool, error) {
	outcome, err := rubric.Grade(ctx, attempt)
	if err == nil {
		err = storage.SaveGrade(ctx, attempt.ID, outcome)
	}
	if err != nil {
		log.Printf("rubric grading failed, falling back: %v", err)
		return false, nil
	}
	return true, nil
}
```

## Good

```ts
async function gradeAttempt(attempt: Attempt): Promise<void> {
	const outcome = await gradeOrFallback(attempt);

	// a storage error propagates as a storage error; the decision above is not revisited
	await storage.saveGrade(attempt.id, outcome.grade, outcome.stamp);
}

async function gradeOrFallback(attempt: Attempt): Promise<Outcome> {
	try {
		return await rubric.grade(attempt);
	} catch (error) {
		logger.warn('rubric grading failed; using the legacy grader', { error });

		return legacy.grade(attempt);
	}
}
```

```go
func gradeAttempt(ctx context.Context, attempt Attempt) error {
	outcome := gradeOrFallback(ctx, attempt)

	if err := storage.SaveGrade(ctx, attempt.ID, outcome); err != nil {
		return fmt.Errorf("saving grade for attempt %s: %w", attempt.ID, err)
	}

	return nil
}
```

```ts
// logging and rethrowing changes nothing about what happens next
try {
	await storage.saveGrade(attempt.id, outcome);
} catch (error) {
	logger.error('saving grade failed', { attemptId: attempt.id, error });
	throw error;
}
```
