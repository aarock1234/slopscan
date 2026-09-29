---
severity: major
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
falsePositives:
  - >-
    two shapes that share a few field names but describe different concepts and
    are expected to diverge, such as a request body and a database row
  - >-
    a deliberately independent boundary type, such as a wire format or a
    provider's response, kept separate from the domain type on purpose
  - >-
    a Pick, Omit, Partial, or schema .pick()/.extend() that derives from the one
    definition
  - a type inferred from a schema with z.infer
jev:
  threshold: 0.72
---

## Why

A shape declared twice is two things to update, and they drift: a field added to one is forgotten on the other, a description is copied by reaching into the first schema's `.shape`, and the reader has to diff them by eye to learn they are the same concept. Declare the shape once, and derive every narrower, wider, or bounded variant from that one definition with `Pick`, `Omit`, `Partial`, `.pick()`, `.extend()`, or `z.infer`. Where a runtime schema already defines the contract, infer the TypeScript type from it instead of writing it out again.

## Message

type or schema restates a shape that is already defined; derive it from the one definition

## Bad

```ts
type PlannedElement = {
	name: string;
	requirement: string;
	verification: string;
	equivalents: string[];
	contest: ElementContest;
};

// BAD: the derived element retypes the planned element, and writes the contest object out inline
type DerivedElement = {
	name: string;
	requirement: string;
	verification: string;
	equivalents: string[];
	contest: { kind: 'facts' | 'rule'; result: 'won' | 'lost' | 'open' };
};
```

```ts
const componentFeedbackSchema = z.object({
	feedback: z.string().max(600).describe('what the student did and did not do here'),
	takeaway: z.string().max(200).describe('one sentence to remember'),
	version: z.number().int(),
});

// BAD: the model output schema restates the fields and steals the descriptions through .shape
const feedbackOutputSchema = z.object({
	feedback: z.string().describe(componentFeedbackSchema.shape.feedback.description!),
	takeaway: z.string().describe(componentFeedbackSchema.shape.takeaway.description!),
});
```

## Good

```ts
type PlannedElement = {
	name: string;
	requirement: string;
	verification: string;
	equivalents: string[];
	contest: ElementContest;
};

type DerivedElement = Pick<PlannedElement, 'name' | 'requirement' | 'verification' | 'equivalents'> & {
	contest: ElementContest;
};
```

```ts
const feedbackFields = {
	feedback: z.string().describe('what the student did and did not do here'),
	takeaway: z.string().describe('one sentence to remember'),
};

const feedbackOutputSchema = z.object(feedbackFields);

const componentFeedbackSchema = z.object({
	feedback: feedbackFields.feedback.max(600),
	takeaway: feedbackFields.takeaway.max(200),
	version: z.number().int(),
});
```

```ts
// a wire format kept apart from the domain type on purpose, with the adapter between them
type StripeCustomerPayload = {
	id: string;
	email: string | null;
	metadata: Record<string, string>;
};

function toCustomer(payload: StripeCustomerPayload): Customer {
	return { id: payload.id, email: payload.email ?? undefined, plan: payload.metadata.plan ?? 'free' };
}
```
