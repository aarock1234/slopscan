---
severity: major
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
falsePositives:
  - independent optional fields with no relationship between them
  - a boolean return from a predicate that answers exactly one yes/no question
  - >-
    a pending or in-progress state that legitimately has no value yet, when the
    type says so with its own variant
jev:
  threshold: 0.47
---

## Why

When a comment has to explain which combinations of fields are allowed, the type admits states the program can never handle, and every consumer has to re-check the relationship the compiler should have enforced. The same failure hides in a `boolean` return that means "it worked, or it failed and was saved, or it fell back": several outcomes collapsed into one bit the caller reconstructs from memory of the helper's insides. Model the variants as a discriminated union so each carries exactly the fields it has, and return outcomes as data.

## Message

legal combinations of fields or outcomes live in a comment or a boolean; model them as a discriminated union

## Bad

```ts
// BAD: { grader: 'legacy', decisionId: 'abc' } type-checks; the relationship lives in the comment
type GradeStamp = {
	grader: 'rubric' | 'legacy';
	// set when grader is 'rubric', null for the legacy grader
	decisionId: string | null;
};
```

```ts
// BAD: true means graded and saved; false means it could not grade, or it graded and the save failed
async function gradeWithRubric(attempt: Attempt): Promise<boolean> {
	try {
		const outcome = await rubric.grade(attempt);
		await storage.saveGrade(attempt.id, outcome);

		return true;
	} catch {
		return false;
	}
}
```

## Good

```ts
type GradeStamp = { grader: 'rubric'; decisionId: string } | { grader: 'legacy' };
```

```ts
type RubricOutcome =
	| { kind: 'graded'; grade: Grade; stamp: GradeStamp }
	| { kind: 'ineligible'; reason: string };

async function gradeWithRubric(attempt: Attempt): Promise<RubricOutcome> {
	if (!attempt.contract) {
		return { kind: 'ineligible', reason: 'no frozen contract' };
	}

	const grade = await rubric.grade(attempt);

	return { kind: 'graded', grade, stamp: { grader: 'rubric', decisionId: grade.decisionId } };
}
```

```ts
// unrelated optional fields need no union
type SearchOptions = {
	limit?: number;
	cursor?: string;
};
```
