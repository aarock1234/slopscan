---
severity: minor
detect: judge
confirm: callCount
falsePositives:
    - a function extracted so it can be unit tested in isolation
    - a function whose name states a decision or a step the body does not make obvious, even with one caller
    - a type guard or predicate, whose name is the point
    - exported functions, which may have callers outside this repository
---

## Why

A helper is worth its name when the name tells the reader something the body would not, or when a second caller shares it. The violation is all three at once: a body of one to three lines, exactly one caller, and a name that says nothing more than the code it hides. Then the reader pays for a jump and a second signature to keep in sync and gets nothing back. Having one caller is not the violation by itself; most well-named steps in a pipeline have one caller.

## Message

single-use helper adds indirection without removing duplication

## Bad

```ts
// BAD: three words for a property access, one caller, and the name repeats the body
function getUserName(user: User): string {
	return user.name;
}

export function greet(user: User): string {
	return `hello ${getUserName(user)}`;
}
```

```go
// BAD: one caller, one line, and the name is the body in English
func itemPrice(item Item) int {
	return item.Price
}

func total(items []Item) int {
	sum := 0
	for _, item := range items {
		sum += itemPrice(item)
	}

	return sum
}
```

## Good

```ts
export function greet(user: User): string {
	return `hello ${user.name}`;
}
```

```ts
// GOOD: one caller each, but every name says something the body does not make obvious
function isShape(value: string): value is Shape {
	return (Object.values(Shape) as readonly string[]).includes(value);
}

function firstSentence(text: string): string {
	return text.split(/(?<=[.!?])\s+/, 1)[0]?.trim() ?? text;
}

async function writeCache(dir: string, key: string, output: JudgeOutput): Promise<void> {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${key}.json`), JSON.stringify(output, null, 2));
}
```

```go
// GOOD: called once, but the name records a decision the loop body would otherwise have to explain
func isRetryable(err error) bool {
	return errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, syscall.ECONNRESET)
}
```
