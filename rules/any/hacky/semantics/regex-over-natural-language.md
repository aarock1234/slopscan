---
severity: major
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
falsePositives:
  - >-
    regexes over structured text such as identifiers, placeholders, whitespace,
    paths, or escaping
  - >-
    tokenising or splitting text into sentences or words before handing it to
    something that understands it
  - a search or highlight feature where the user typed the pattern
  - >-
    a deliberately small, documented lexicon for a fixed protocol, such as
    commit message prefixes
jev:
  threshold: 0.51
---

## Why

A regular expression with a dictionary of verbs, a list of negations, and rules for where a clause ends is a grammar of English written by hand, and it is wrong in both directions from the day it ships: it flags "keeps you from earning full credit" as a claim of full credit and misses "your analysis earned full credit" because that sentence sits under a different heading. Every fix adds a phrase and preserves the problem. The fact being recovered from the prose was known to the program before the prose was written. Decide it in code, give the model the settled facts, and ask it only to explain them. Validate the model's output structurally, by IDs and enumerations, not by reading its sentences.

## Message

hand-built grammar decides what free text means; decide the fact in code and validate output structurally

## Bad

```ts
// BAD: verbs, negations, and clause boundaries in regexes decide whether the prose claims full credit
const CLAIM =
	/\b(?:full credit|every element|(?:met|covered|proved|analy[sz]ed) in full|(?:did|does|covers?) everything)\b/gi;
const NOT_A_CLAIM_BEFORE = /\b(?:to|would|could|not|never|short of|reach)\s+(?:[\w'-]+\s+){0,2}$/i;
const CLAUSE_BREAK = /[.;!?]|\b(?:but|while|although|though|yet)\b/gi;

function claimsFullCredit(text: string): boolean {
	return [...text.matchAll(CLAIM)].some(match => !NOT_A_CLAIM_BEFORE.test(text.slice(0, match.index)));
}
```

```go
// BAD: the outcome of a support ticket is read out of the agent's closing note
var resolvedWords = regexp.MustCompile(`(?i)\b(resolved|fixed|sorted|all set|taken care of)\b`)
var notResolved = regexp.MustCompile(`(?i)\b(not|never|un)[ -]?(resolved|fixed)\b`)

func wasResolved(note string) bool {
	return resolvedWords.MatchString(note) && !notResolved.MatchString(note)
}
```

## Good

```ts
// the verdicts are settled before the prose exists; the model explains them and is checked by id
const outputSchema = z.object({
	explanations: z.array(z.object({ checkId: z.string(), text: z.string().max(400) })),
});

function validate(output: Output, verdicts: ReadonlyMap<string, Verdict>): string[] {
	return output.explanations
		.filter(item => verdicts.get(item.checkId) === undefined || verdicts.get(item.checkId) === 'uncertain')
		.map(item => `explanation for unknown or unsettled check ${item.checkId}`);
}
```

```go
// the agent records the outcome as a field when closing the ticket
type Closure struct {
	Outcome Outcome
	Note    string
}

func wasResolved(closure Closure) bool {
	return closure.Outcome == OutcomeResolved
}
```

```ts
// structured text is fair game for a regex
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;
```
