# Rule audit against the style guides

Audit of the 124 rules against the TypeScript and Go STYLE.md guides, their SKILL.md summaries, and the global
CLAUDE.md, produced 2026-09-29. Work through section 7 first; the rest is the evidence behind it.

## 1. Coverage gaps

| Guide heading                       | Missing convention                                                                                     | Detect       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| TS Project Structure                | No `index.ts` barrel files (dead-export merely ignores index.ts)                                       | ast/path     |
| TS Project Structure                | No `types.ts` dumps (colocate-zod only covers schemas)                                                 | ast/path     |
| TS Naming table                     | kebab-case file names; Go: snake_case file names                                                       | path         |
| TS Naming table                     | Zod schemas camelCase `userSchema` (note the guide's own `UserIdSchema` in Branded Types violates it)  | ast          |
| TS Constants and Enums              | Const-object keys SCREAMING_SNAKE (`as-const-for-literal-config` checks the object name, not key case) | ast          |
| TS Naming table                     | camelCase functions/vars, PascalCase types; Go: no `snake_case` identifiers                            | ast          |
| TS Arrow vs Declarations            | Method shorthand in object literals (`key: () => {}` / `key: function`)                                | ast          |
| TS Concurrent Processing with Limit | Unbounded `Promise.all(items.map(...))` over a collection                                              | judge        |
| TS Custom Error Classes             | Errors extend a shared `AppError` base / set `this.name`                                               | ast          |
| TS/Go Error Handling                | Trailing period in error/log messages (both lowercase rules check only the first letter)               | ast          |
| TS HTTP Client Pattern              | `fetch` without `AbortController`/timeout                                                              | judge        |
| TS/Go Dependency Wiring             | Manual wiring in entrypoint; no DI container (`wire`, `fx`, `tsyringe`)                                | ast (import) |
| Go Import Order                     | Side-effect import must carry a comment                                                                | ast          |
| Go Receiver Naming                  | Receiver name consistent across all methods of a type (only pointer/value kind is checked)             | judge        |
| Go Doc Comments                     | Complete sentence ending with a period                                                                 | ast          |
| Go Doc Comments                     | Doc comments on exported `const`/`var` (rule covers func/method/type only)                             | ast          |
| Go Package Structure                | `pkg/` not `internal/`; `cmd/<app>/main.go` entrypoint                                                 | path         |
| Go Logging                          | `slog.Info` where `ctx` is in scope; `slog.SetDefault` outside a side-effect `log` package             | judge        |
| Go Newline Spacing                  | Three or more ungrouped statements                                                                     | judge        |
| Go JSON                             | Missing `json` tags / `omitempty` on optional fields of a decoded struct                               | ast          |
| Go Graceful Shutdown                | `ListenAndServe` without `signal.NotifyContext`/`Shutdown`                                             | judge        |
| Go Concurrency                      | errgroup as default over hand-rolled `WaitGroup` + error slice                                         | judge        |
| Go Iterators                        | Return `iter.Seq` instead of a full slice (`prefer-iter-seq` covers channel generators only)           | judge        |

## 2. Contradictions

| Rule(s)                                                                                                                  | Problem                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single-impl-interface` vs `define-interfaces-at-consumer`, `compile-time-impl-assertion`, Go guide Layered Architecture | Its Go Bad (consumer interface + `var _ UserStore = (*PostgresUserStore)(nil)` + one impl) is the Good of both sibling rules and the guide's canonical pattern. |
| `copy-paste-block` Good Go vs `package-level-mutable-var`                                                                | `var exportedTables = []string{...}` is flagged by the ast rule.                                                                                                |
| `positional-config-args` Good Go vs `multiline-struct-literals`                                                          | One-line struct literals with several fields.                                                                                                                   |
| `accept-interfaces-return-concrete` Good vs `constructor-named-new`, `no-package-name-stutter`                           | `func NewService(repo Repository) *Service` in an implied `service` package.                                                                                    |
| `mutex-over-channels-for-state` Good vs `zero-value-usable`                                                              | Good `Cache.Set` writes to a nil map with no lazy init.                                                                                                         |
| `descriptive-identifier-quality`                                                                                         | Bad flags `res` and `data`; `res` is in its own falsePositives and `data` is the guide's canonical name for unvalidated input.                                  |
| `magic-number`                                                                                                           | Bad `attempts > 5` vs falsePositive "small loop bounds".                                                                                                        |
| `shipped-todo-comment`                                                                                                   | Why allows a TODO linking an issue; regex flags `// TODO(#482):` anyway.                                                                                        |
| `defer-close-explicit-discard` vs `check-close-error-on-writable`                                                        | Discarding a written file's Close is the other rule's critical Bad; log-in-defer (the guide's form) is not accepted by check-close.                             |
| `no-promise-chains` vs guide Dependency Wiring                                                                           | Flags `main().catch(...)`, the guide's entrypoint idiom.                                                                                                        |
| `throw-typed-error-with-context` vs guide Non-null / Type Guards                                                         | Flags guide GOOD `throw new Error('missing root element')`.                                                                                                     |
| `screaming-snake-module-constants` vs guide Variables                                                                    | Flags guide GOOD `const maxRetries = 3`; the guide lists `maxRetries` under both rows (guide defect).                                                           |
| `null-vs-undefined-convention` vs guide Layered Architecture                                                             | Bad `findUser(): User \| null` is the guide's own repository contract.                                                                                          |
| `log-at-boundary-not-every-layer` vs guide Async/Await GOOD                                                              | Guide's `getUser` logs and rethrows in a service; the rule is right, the guide is self-inconsistent.                                                            |
| `main-delegates-to-run` vs Go guide Graceful Shutdown                                                                    | Guide's `main` never calls `run()`.                                                                                                                             |
| `no-nested-ternary` Good #1                                                                                              | `isEnabled ? () => (isDark ? a : b) : undefined`; guide says never nest.                                                                                        |
| `no-explicit-any` vs guide Conditional Types                                                                             | Flags `(...args: any[]) => infer R` and `Record<string, any>` with no escape.                                                                                   |
| `interface-er-suffix` vs `generics-over-any`, `no-any` Good, Go guide                                                    | Single-method `HasID` (no `-er`) used as Good elsewhere.                                                                                                        |
| `capitalized-error-message` vs `error-message-lowercase`                                                                 | Go regex flags `errors.New("HTTP 502 ...")`; TS allows acronyms.                                                                                                |
| `no-section-banners`                                                                                                     | Misses `////` and `/* ---- Middleware ---- */`, both BAD in the TS guide.                                                                                       |

Double-flag pairs on one line: `debug-print`+`use-slog`; `boolean-positional-param`+`boolean-name-question-prefix`;
`no-unchecked-type-assertion`+`catch-param-typed-unknown`; `no-unchecked-type-assertion`+`validate-parsed-json`;
`no-unchecked-type-assertion`+`env-read-outside-config`; `no-map-string-any`+`json-into-struct-not-map`;
`import-order-groups`+`side-effect-imports-own-group`; `constructor-named-new`+`no-package-name-stutter`;
`pointer-vs-value-receiver-choice`+`consistent-receiver-kind-per-type`.

## 3. Rules not from the guides

Authored fresh: all `any/futureproof/*` and `any/hacky/*`, `ts/hacky/{env-read-outside-config, empty-catch, log-and-swallow, exported-let, no-double-assertion}`, `go/hacky/{ignored-error-blank, package-level-mutable-var, no-goroutine-without-wait}`.

| Rule                        | Why a guide reader would push back                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `boolean-positional-param`  | Guides never forbid boolean params; fires on well-named `isEnabled: boolean`.                                           |
| `positional-config-args`    | Guide reserves options for complex configuration; a DI constructor with four dependencies trips it.                     |
| `wide-function`             | 60 lines / 5 params appear in neither guide.                                                                            |
| `sleep-based-sync` (major)  | Go: every `time.Sleep` outside main/cmd/tests, including ctx-aware backoff; TS: the `delay()` helper itself is flagged. |
| `single-impl-interface`     | Contradicts the Go guide (section 2).                                                                                   |
| `package-level-mutable-var` | Flags read-only lookup tables, idiomatic Go.                                                                            |
| `hardcoded-url`             | Flags doc links, user-agent strings, spec URLs.                                                                         |
| `shipped-todo-comment`      | Flags tracked `TODO(#id)`.                                                                                              |

## 4. Wording for a literal reader (judge rules)

| Rule                                                                                                                                   | Phrase                                                    | Issue                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `single-caller-helper`                                                                                                                 | message names only one of three conditions                | tightened 2026-09-29; keep watching                                        |
| `single-impl-interface`                                                                                                                | "and no test double"                                      | test doubles are outside the snippet; effectively "has one implementation" |
| `logic-in-handler`                                                                                                                     | Why "calling one service function"                        | any handler calling two services violates by the letter                    |
| `compile-time-impl-assertion`                                                                                                          | "type meant to satisfy an interface"                      | intent unknowable; Bad shows no interface                                  |
| `generics-over-any`                                                                                                                    | "interface plus assertions"                               | Bad has no assertion; falsePositives describe the Bad                      |
| `readonly-for-immutable-data`                                                                                                          | "never mutated"                                           | whole-program knowledge; flags every non-readonly field                    |
| `exhaustive-switch-never-check`                                                                                                        | message catches fully-enumerated switches with no default | TS already checks those                                                    |
| `null-vs-undefined-convention`                                                                                                         | "used interchangeably"                                    | Bad is a different trigger                                                 |
| `no-floating-promises`                                                                                                                 | falsePositive "obvious from the name"                     | swallows the Bad                                                           |
| `descriptive-identifier-quality`, `magic-number`                                                                                       | falsePositives contradict Bad                             | see section 2                                                              |
| `zero-value-usable`, `constructor-named-new`, `define-interfaces-at-consumer`                                                          | exemptions depend on code outside the snippet             | Bad and exempt read the same                                               |
| `blank-line-before-return`, `import-order-groups`, `accept-interfaces-return-concrete`, `interface-er-suffix`, `constructor-named-new` | message restates the rule                                 | not a finding                                                              |
| `ignored-error-blank` (ast)                                                                                                            | "or comment why it cannot matter"                         | detector cannot see comments                                               |

## 5. Fixture quality

Violation not visible in the snippet: `stringly-typed-enum` (TS Bad should declare `status: string`),
`compile-time-impl-assertion` (include the interface and a failing assignment), `generics-over-any` (include the
caller's assertion), `constructor-named-new` (Good shows `New` beside `NewCache`), `export-type-for-types` (include
the `user.ts` block), `zero-value-usable` (Bad shows `var c Cache; c.Set(...)` panicking), `no-floating-promises`
(declare `sendWelcomeEmail(): Promise<void>`), `single-impl-interface` (Good keeps the interface and shows the fake),
`no-goroutine-without-wait` (show `process` returning `error`), `readonly-for-immutable-data` (restrict Bad to the
parameter case).

Exactly one Bad and one Good: most single-language rules and every `any/` rule per language. Two of each is the
cheapest improvement available to the Jev contrast question.

## 6. Severity

| Pair                                                                                                | Issue                                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ignored-error-blank` major vs `empty-catch` critical                                               | its own Why calls it the Go form of an empty catch                    |
| `sentinel-errors-with-errors-is`, `custom-error-type-errors-as` minor vs `wrap-errors-with-w` major | same bug from the other side                                          |
| `check-close-error-on-writable` critical                                                            | only critical judge rule; guide's own writable example fails its Good |
| `sleep-based-sync` major                                                                            | broad ast rule with known false-positive classes at major             |
| `exported-let`, `package-level-mutable-var` minor vs `no-context-in-struct` major                   | all three are state outliving its scope                               |

## 7. Top-10 edits, ranked

1. `single-impl-interface`: restrict to interfaces declared beside their only impl; rewrite the Go Bad.
2. `descriptive-identifier-quality`: drop `res` and `data` from Bad or qualify with "when the type is known".
3. `shipped-todo-comment`: exempt markers followed by `(#…)`, `#\d+`, or a URL.
4. `defer-close-explicit-discard` / `check-close-error-on-writable`: split read-only vs written; accept log-in-defer.
5. `package-level-mutable-var`: exempt never-written slices/maps or make it judge; fix `copy-paste-block` Good.
6. `no-promise-chains`: exempt program-level `main().catch(...)`; `throw-typed-error-with-context`: exempt assertions or downgrade to info.
7. `sleep-based-sync`: Go exempt ctx-aware loops or lower to minor; TS exempt a `delay()` whose whole body is the promise.
8. Rewrite judge messages into finding form; tighten `exhaustive-switch-never-check`, `null-vs-undefined-convention`.
9. Fix self-contradicting fixtures: `magic-number`, `positional-config-args`, `accept-interfaces-return-concrete`, `mutex-over-channels-for-state`, `no-nested-ternary` Good #1.
10. Add context to the indistinguishable fixtures in section 5; de-duplicate `debug-print`/`use-slog` on `fmt.Print*`.

Guide defects to fix upstream: TS naming table lists `maxRetries` in both constant rows; TS Async/Await GOOD
logs-and-rethrows in a service; TS repository contracts return `null`; Go Graceful Shutdown `main` skips `run()`;
TS `UserIdSchema` breaks its own camelCase schema rule.
