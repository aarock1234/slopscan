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
| `Analyzer` | `(change, rules) => findings`; three of them, syntax, judge, and jev         |
| `Finding`  | a rule, a location, a verbatim quote, a confidence                           |
| `Report`   | the score, its axes, and the ranked findings                                 |

`scan` reads what changed, runs every analyzer over it, confirms the findings that need a repo-wide check, and
scores what survives. The syntax analyzer parses each file once with tree-sitter and runs every `ast` rule against
the tree. The judge analyzer makes one model call per changed file with the `judge` rules as its rubric, and drops
any finding whose quote is not in the file, is not on a changed line, or is under the confidence floor. The jev
analyzer runs when `TYPESAFE_API_KEY` is set: one TypeSafe decision-model call per changed function, asking every
`judge` rule with a measured `jev.threshold` whether the function violates it, follows it, or is not about it. Jev
findings below `jev.confidenceFloor` go to the verifier, the judge model as a bounded agent that may read files and
find references before confirming or rejecting each one.

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

Judge rules may name a `confirm` predicate (`callCount`, `implCount`, `refCount`). The judge nominates a `symbol`
and the finding only counts if the repo-wide count agrees.

Three axes, weighted into one score:

- **idiom**: does it read like the language.
- **hacky**: shortcuts that work today and bite later.
- **futureproof**: how many places have to move for the next plausible change.

## Scoring

Points per finding by severity (1 / 3 / 8 / 20), damped geometrically within one rule so a hundred `any` casts
score about twice one. Points per hundred changed lines feed `100 * (1 - e^(-density / 12))` per axis, and the
axes combine `0.25 idiom + 0.40 hacky + 0.35 futureproof`. Grades A through F, exit code 1 above the fail
threshold. Every constant lives in `.slopscan.yml`.

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
                  openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

The Action writes the report to the job summary, uploads the full JSON as an artifact, keeps one sticky comment on
the pull request up to date, and fails the check when the score is over `failThreshold`. Without a key it runs the
syntax rules only. Inputs: `base`, `judge`, `openrouter-api-key`, `openai-api-key`, `comment`, `fail-on-threshold`,
`version`. Outputs: `score`, `grade`.

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
and the file's imports, to the model provider named in `judge.model`. Jev sends each changed function with its
file's import and declaration names to TypeSafe, and the verifier may send any tracked file's lines or grep hits
to the judge model. Nothing else is sent. If that is not acceptable for a repository, run with `--no-judge`,
`--no-jev`, or `--no-verify`, or leave the keys out.

## Usage

```bash
pnpm install
pnpm dev scan --base main                 # judge on; needs OPENAI_API_KEY in .env
pnpm dev scan --base main --no-judge      # syntax rules only, no key needed
pnpm dev scan --base main --no-jev        # skip jev even when TYPESAFE_API_KEY is set
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
