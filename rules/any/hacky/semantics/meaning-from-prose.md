---
severity: critical
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
falsePositives:
  - >-
    parsing an external format the code does not control, such as a log line, a
    filename convention, or a third-party response, at the boundary where it
    arrives
  - >-
    matching a stable machine identifier that is part of a documented contract,
    such as an enum value or a status code
  - >-
    a display-only branch that picks copy or an icon from a category the record
    already carries
jev:
  threshold: 0.29
guide:
  - ts.meaning-as-data
---

## Why

A category the system once knew as a field was dropped, and the code recovers it by matching a display label, the spelling of an ID, or a sentence another part of the program generated. Every one of those is copy: the label gets reworded, the ID scheme changes, the generated sentence is edited, and the inference silently misclassifies, including rows already persisted under the old wording. Carry the field the code needs on the record and read it; derive display text from the field, never the field from the text.

## Message

meaning recovered from a label, an id's spelling, or generated prose; carry it as a field on the record

## Bad

```ts
// BAD: the component comes from the title copy and from an id being spelled "rule"
function rowComponent(row: StudentRubricCriterion): RedlineComponent {
	if (row.title === STRUCTURE_LABELS.conclusion) {
		return 'conclusion';
	}

	return row.checks.find(check => check.id === 'rule') ? 'rule' : 'application';
}
```

```ts
// BAD: a sentence the adapter wrote is recognised later by its phrasing
function isClosedSetFiller(rule: string, title: string): boolean {
	return new RegExp(`^Apply ${escapeRegExp(title)} only within the closed .+ issue set\\.$`).test(rule);
}
```

```go
// BAD: the event kind is read back out of the message the logger formatted
func kindOf(entry LogEntry) Kind {
	if strings.HasPrefix(entry.Message, "payment failed for") {
		return KindPaymentFailed
	}

	return KindOther
}
```

## Good

```ts
function rowComponent(row: StudentRubricCriterion): RedlineComponent {
	return row.component;
}
```

```ts
// the adapter marks what it synthesised instead of hoping to recognise it later
type IssueRule = { text: string; synthetic: boolean };

const doctrine = issue.rules.filter(rule => !rule.synthetic);
```

```go
func kindOf(entry LogEntry) Kind {
	return entry.Kind
}
```

```go
// a format the code does not own is parsed once, at the boundary
func parseSyslogLine(line string) (Entry, error) {
	fields := strings.SplitN(line, " ", 4)
	if len(fields) < 4 {
		return Entry{}, fmt.Errorf("syslog line: expected 4 fields, got %d", len(fields))
	}

	return Entry{Host: fields[1], Program: fields[2], Message: fields[3]}, nil
}
```
