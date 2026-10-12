# slopscan

Scores a git diff for slop: code that is hacky, non-idiomatic, or hard to change later, whoever wrote it.
TypeScript and Go.

```
slop score 63 (D)
idiom 92  ·  hacky 100  ·  futureproof 0
2 files, 14 scored lines

src/users.ts:11  [critical] ts.hacky.empty-catch
    empty catch swallows the error; handle it, rethrow with context, or let it propagate
    > catch {}
```

## How it works

Five nouns, one pipeline.

| noun       | what it is                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| `Rule`     | one markdown file under `rules/` with a why, bad examples, and good examples |
| `Change`   | a changed file at head with the set of lines this diff touched               |
| `Analyzer` | `(change, rules) => findings`; three of them, syntax, judge, and decision    |
| `Finding`  | a rule, a location, a verbatim quote, a confidence                           |
| `Report`   | the score, its axes, and the ranked findings                                 |

`scan` reads what changed, runs every analyzer over it, confirms the findings that need a repo-wide check, and
scores what survives. The syntax analyzer parses each file once with tree-sitter and runs every `ast` rule against
the tree. The judge analyzer makes one model call per changed file with the `judge` rules as its rubric, and drops
any finding whose quote is not in the file, is not on a changed line, or is under the confidence floor. The
decision analyzer runs when the key for `decision.model` is set: a decision model, which answers typed questions with
probabilities instead of writing text, is asked about each changed function or type with every `judge` rule that has
a threshold measured for that model, and says whether it violates the rule, follows it, or is not about it. Its
findings, and every match of an `ast` rule marked `verify: true`, go to the verifier, a small model as a bounded agent
that may read files and find references before confirming or rejecting each one.

### Choosing a decision model

`decision.model` is `<provider>/<model>`: `typesafe/jev-latest` by default, or any decision model OpenRouter serves,
such as `openrouter/cloudflare/clef`. A model is only asked about the rules it has thresholds for, measured with
`scripts/decision-thresholds.ts --model <spec>`. Measured against hand-labeled findings in this repository and a Go
service (`fixtures/labels`), before the verifier:

| decision model                                  | real found | precision | cost per pull request |
| ----------------------------------------------- | ---------: | --------: | --------------------: |
| `typesafe/jev-latest`, one function per call    |    14 / 17 |       48% |                ~$0.16 |
| `typesafe/jev-latest`, eight by eight per call  |    10 / 17 |       63% |                ~$0.08 |
| `openrouter/cloudflare/clef`, one rule per call |     7 / 17 |       47% |                ~$1.00 |

The verifier settles the difference: behind it, one function per call keeps 11 real findings to 2 false ones (85%),
against 9 to 3 for eight by eight, so that is the default. Clef reads a rule well alone but poorly beside others, so it
needs `maxRulesPerCall: 1` and `maxUnitsPerCall: 8`; Clef-flash, Clef-omni, and OpenAI's `gpt-6-luna-decisions` ranked
findings worse in every grouping tried.

## Rules

A rule's identity is its path: `rules/ts/hacky/type-safety/no-explicit-any.md` is `ts.hacky.no-explicit-any`.
The frontmatter carries only what the path cannot:

```yaml
severity: major # info | minor | major | critical
detect: ast # ast | judge
ast:
    rule:
        kind: predefined_type
        regex: ^any$
```

Then `## Why`, `## Message`, `## Bad`, and `## Good`. The examples are the tests: `rules.test.ts` runs every `ast`
rule's bad blocks (must match) and good blocks (must not). A `// BAD:` marker line above the offending code records
which line the match has to land on.

A rule may name a `confirm` predicate (`callCount`, `implCount`, `refCount`, `writeCount`). The judge nominates a
`symbol`, or an `ast` rule binds one to `$SYMBOL`, and the finding only counts if the repo-wide count agrees: a
package-level table nothing writes to is not shared mutable state.

An `ast` rule whose violation depends on what syntax cannot show, such as whether a discarded value is an error or
whether a `Close` returns one, sets `verify: true` and lists its exceptions under `falsePositives`. With a verifier
key, each match is checked before it counts; without one, matches stand as they always have. Syntax rules also stay
quiet on lines the parser could not read, so a grammar that predates a language feature does not turn it into a
finding.

A judge rule's `decision.thresholds` maps each decision model to the violation probability at which its verdict
counts, measured on the rule's own examples by `scripts/decision-thresholds.ts --model <spec>`. A model without an
entry is not asked about the rule, and neither is any model about a rule with a `confirm` predicate, since a decision
model names no symbol for the predicate to check.

Three axes, weighted into one score:

- **idiom**: does it read like the language.
- **hacky**: shortcuts that work today and bite later.
- **futureproof**: how many places have to move for the next plausible change.

## Scoring

Points per finding by severity (1 / 3 / 8 / 20), damped within one rule to the square root of the count, so a
hundred `any` casts weigh ten. Points per hundred changed lines feed `100 * (1 - e^(-density / 12))` per axis,
with the line count floored at 50 and capped at 2000 so neither a tiny diff nor a huge one distorts the density.
The axes combine `0.25 idiom + 0.40 hacky + 0.35 futureproof`. Critical findings set a floor the size of the diff
cannot dilute: one caps the grade at C, two at D, three or more is an F. Grades A through F, exit code 1 above
the fail threshold. The constants live in `.slopscan.yml`.

## GitHub Action

```yaml
name: slopscan
on:
    pull_request:

permissions:
    contents: read
    pull-requests: write

jobs:
    slop:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v5
              with:
                  fetch-depth: 0
            - uses: aarock1234/slopscan@v1
              with:
                  typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
                  openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

The Action writes the report to the job summary, uploads the full JSON as an artifact, keeps one sticky comment on
the pull request up to date, and fails the check when the score is over `failThreshold`.

The keys pick the tier. No key runs the syntax rules only. `typesafe-api-key` adds the decision model over the
changed functions and types, a few cents per pull request; with `decision.model` set to an `openrouter/` model,
`openrouter-api-key` runs it instead. `openrouter-api-key` or `openai-api-key` also lets the verifier check each
decision finding and the syntax matches that need it with a small model, Luna by default. `judge: true` adds the full
LLM judge over whole files, the thorough tier, at roughly ten times the cost. Inputs: `base`, `judge`,
`typesafe-api-key`, `openrouter-api-key`, `openai-api-key`, `comment`, `fail-on-threshold`, `version`. Outputs:
`score`, `grade`.

To run it on demand, comment `@slopscan` or `/slopscan` on a pull request. That needs an `issue_comment` trigger next to
`pull_request` and a guard so only people with write access can start a run that uses the repository's secrets:

```yaml
on:
    pull_request:
    issue_comment:
        types: [created]

jobs:
    slop:
        if: >-
            github.event_name == 'pull_request' ||
            (github.event.issue.pull_request &&
             (contains(github.event.comment.body, '@slopscan') || contains(github.event.comment.body, '/slopscan')) &&
             contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association))
```

The Action reacts to the comment with eyes, checks out that pull request's head, and posts the report as usual.
`@slopscan` also notifies whoever owns that GitHub handle; `/slopscan` does not.

Judge and verifier results are cached by content under `.slopscan-cache`, so re-running the same commit costs
nothing.

## What leaves your machine

The syntax rules run locally. The judge sends each changed file's changed regions, with fifteen lines of context
and the file's imports, to the model provider named in `judge.model`. The decision analyzer sends each changed
function or type with its file's import and declaration names to the provider named in `decision.model`, and the
verifier may send any tracked file's lines or grep hits to the model named in `verify.model`. Nothing else is sent. If
that is not acceptable for a repository, run with `--no-judge`, `--no-decision`, or `--no-verify`, or leave the keys
out.

## Usage

```bash
pnpm install
pnpm dev scan --base main                 # syntax rules, plus the decision model and the verifier when their keys are in .env
pnpm dev scan --base main --judge         # also the full LLM judge; needs OPENROUTER_API_KEY or OPENAI_API_KEY
pnpm dev scan --base main --no-decision   # no decision model
pnpm dev scan --base main --format json   # or markdown
pnpm dev rules                            # list rules
pnpm dev scan --rules ./my-rules          # bring your own rule directory
```

Authoring:

```bash
pnpm script scripts/check-rule.ts rules/ts/hacky/type-safety/no-explicit-any.md   # one rule, fast
pnpm test                                                                          # everything
pnpm script scripts/eval-judge.ts                                                  # judge precision/recall, costs calls
pnpm script scripts/write-skill.ts                                                 # regenerate SKILL.md
pnpm script scripts/import-guide.ts --lang ts --guide path/to/STYLE.md             # drafts from a prose guide
```
