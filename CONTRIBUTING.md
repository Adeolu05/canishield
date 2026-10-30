# Contributing to Can I Shield?

Thanks for taking the time to contribute. Can I Shield? is a public record of
which Zcash services can send and receive shielded ZEC, so its most important
property is that every result is true and can be checked by anyone. These
guidelines exist to protect that.

This guide follows the style of the
[`librustzcash` contributing guide](https://github.com/zcash/librustzcash/blob/main/CONTRIBUTING.md),
adapted to a TypeScript project. Where this guide says nothing, the
`librustzcash` guide applies.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Reporting a wrong result](#reporting-a-wrong-result)
- [Reporting bugs](#reporting-bugs)
- [Security issues](#security-issues)
- [Suggesting features](#suggesting-features)
- [Local setup](#local-setup)
- [Styleguides](#styleguides)
  - [Git usage](#git-usage)
  - [Commit messages](#commit-messages)
  - [Pull requests](#pull-requests)
  - [Coding style](#coding-style)
  - [Evidence rules](#evidence-rules)
  - [Data formats and migrations](#data-formats-and-migrations)
  - [Copy](#copy)

## Code of Conduct

This project follows the
[Zcash Code of Conduct](https://github.com/zcash/zcash/blob/master/code_of_conduct.md).
By taking part, you agree to uphold it.

## Ways to contribute

- **Run a test.** The most useful contribution needs no code: run a withdrawal
  test or a shielded deposit check on the live site against a service you use.
  Every new on-chain result makes the board more complete.
- **Correct a result.** If a result is wrong or out of date, report it (see
  below).
- **Improve the code or docs.** Bug fixes, tests and documentation are welcome.

> When contributing, you confirm that you have the right to submit the work and
> that it may be published under the project's licenses: MIT for code, and
> CC BY 4.0 for results (see the License section of the [README](README.md)).

## Reporting a wrong result

Results are only as good as their evidence, so a report that a result is wrong
is treated as a bug. Open an issue and include:

- the service, the network (mainnet or testnet) and the result you believe is
  wrong;
- what you observed instead, with the date;
- evidence: a txid you are willing to share, or a screenshot with personal
  details (account names, balances, full addresses you don't want public)
  cropped out.

Never post a seed phrase, private key or spending key anywhere. Viewing keys
published by the project are throwaway keys made for one test only.

## Reporting bugs

Before opening an issue, search the existing issues to see if it has been
reported. Then include:

- what you expected and what happened instead;
- steps someone else can follow to reproduce it;
- where it happened: the live site (with the page URL), or a local setup (with
  your OS and Node version).

## Security issues

Do **not** report security issues in public issues. Use GitHub's private
vulnerability reporting: the **Security** tab of this repository, then
**Report a vulnerability**. Issues in Zcash itself (protocol, Zebra, wallets)
should go to the affected project, as described at
<https://z.cash/support/security/>.

## Suggesting features

Open an issue that explains the problem first, then the change you suggest and
why it would help most users. Larger features start as a written spec in
[`docs/`](docs/) (see [`docs/SPEC.md`](docs/SPEC.md) and
[`docs/SPEC-deposits-and-timing.md`](docs/SPEC-deposits-and-timing.md) for the
expected level of detail), so the design can be agreed before code is written.

Trivial pull requests (typo-only or link-only changes from new contributors)
are better reported as issues.

## Local setup

Requires Node 24 (see [`.nvmrc`](.nvmrc)) and Docker for the local Postgres.

```bash
npm install
cp .env.example .env                 # then set WORKER_TEST_MNEMONIC:
npm run new-mnemonic -w worker       # paste the output into .env
npm run db:up                        # Postgres 17 in Docker
npm run db:migrate
npm run db:seed
npm run dev:worker                   # terminal 1: testnet scanner
npm run dev:web                      # terminal 2: http://localhost:3000
```

Local development runs on **testnet only**. Mainnet needs explicit switches and
an offline key pool (see [`docs/RUNBOOK-mainnet.md`](docs/RUNBOOK-mainnet.md));
contributors should never need them.

Before opening a pull request, run:

```bash
npm test             # all unit tests (node:test via tsx)
npm run typecheck    # every workspace
npm run lint -w web  # ESLint for the web app
```

`npm run build` typechecks every package and builds the web app, as the
deployment does.

## Styleguides

### Git usage

- Fork the repository and branch from `main`. Name branches by kind and topic,
  for example `feat/deposit-checks` or `fix/stale-badge`.
- One pull request per change. Keep unrelated changes (a feature and a
  refactor, say) in separate pull requests.
- Pull requests are merged with merge commits, so the commit history of a
  branch is kept. Keep it clean: each commit should be one meaningful change
  that builds and passes tests. Fold fixes for review comments into the commit
  they belong to rather than adding "fix review" commits, unless a reviewer
  asks you not to rewrite history.
- If `main` moves and causes a conflict, rebase your branch on the latest
  `main`.

### Commit messages

- A short title (under about 72 characters) that starts with the area it
  changes, as in the existing history: `worker: log and retry a failed cycle`,
  `Deposit checks: review fixes`, `NU7: steady estimate from the long-run pace`.
- A body that says **why** the change is needed, when it isn't obvious from the
  title.
- When a commit has several authors, add `Co-Authored-By:` lines for everyone
  responsible for its contents.

### Pull requests

- Describe what changed, why, and how you tested it (commands run, screenshots
  for UI changes).
- **Bug fixes come with a test** that fails without the fix and passes with it.
  Where practical, add the failing test in its own commit before the fix.
- New behaviour comes with tests, and with a README or `docs/` update when it
  changes how the project is used or deployed.
- If you used AI tools, say so in the description. You remain responsible for
  the correctness and security of everything you submit.
- Open as a draft until `npm test`, `npm run typecheck` and the lint pass.

### Coding style

The code is TypeScript throughout (Next.js web app, Node worker, shared
packages). In the spirit of the `librustzcash` style guide:

- **Make invalid states unrepresentable.** Prefer string-literal unions and
  enums over booleans and loose strings; parse input at the edge (forms, query
  strings, API responses) into checked values, as `parseZec`, `parseTxid` and
  `decodeDepositAddress` do, and return `null` or throw a typed error instead of
  passing bad values along.
- **Back important invariants with the database**, not only with code: privacy
  and evidence rules are enforced by `CHECK` constraints (see
  `packages/db/src/schema.ts`), so a bug in one code path cannot publish
  something it shouldn't.
- **Pass side effects in as arguments.** Code that needs the network, the clock
  or randomness takes them as parameters with sensible defaults (for example
  the `fetchFn` of the worker's deposit step, the `now` of `parseCreditedAt`,
  the `random` of `checkAmountZat`), so it can be tested without mocks.
- **Prefer pure functions** and keep mutation local.
- **Errors carry a message fit for the person who will read it.** Messages
  shown to users say what to do next; logs say what failed and why, never
  secrets (connection strings, keys, deposit addresses, amounts).

### Evidence rules

These rules are what makes the board trustworthy. Changes that weaken them will
not be accepted.

- **Tiers never mix.** On-chain verified results, community reports,
  unverified listings and community research are stored and shown separately.
  Only on-chain evidence can mark a service as verified or Ironwood-ready.
- **Anyone can re-check.** A verified result keeps what is needed to verify it
  independently (txid, height, and the test key's viewing key).
- **Old results go stale.** Claims older than the staleness window show as
  stale until retested.
- **Keys stay offline.** Test keys are generated with `keygen/`, never in the
  web app or on a server; seeds are never committed (`.gitignore` blocks them,
  and `keygen` refuses to write inside a git working tree).
- **Deposit checks keep the tester private.** The deposit address is never
  stored (only a keyed hash), and a published check carries no txid, amount or
  address. See section 7 of
  [`docs/SPEC-deposits-and-timing.md`](docs/SPEC-deposits-and-timing.md).

### Data formats and migrations

- **Exported formats are versioned.** `/api/results.json` carries
  `format: "canishield-results/1"`; key batches, seed files and listing
  snapshots carry their own versioned format names. Adding a field is fine;
  removing, renaming or changing the meaning of one requires a new version.
  Others build on this data, so treat it as a public API.
- **Schema changes go through Drizzle migrations.** Edit
  `packages/db/src/schema.ts`, run `npm run db:generate`, review the generated
  SQL, and commit both. Never edit a migration that has already been released.
- Each migration runs in its own transaction. A new enum value
  (`ALTER TYPE ... ADD VALUE`) cannot be used in the same migration that adds
  it: add the value in one migration and use it in the next.
- Run `npm run db:migrate` against a fresh database before opening a pull
  request that adds a migration.

### Copy

- Plain, accurate words. Say what the evidence shows and nothing more: no
  "untraceable", no claims a test didn't prove.
- No em dashes in anything under `web/src` (a test enforces this). Use a colon,
  a full stop, a comma or "·" instead.

## Attribution

Structure and several rules adapted from the
[`librustzcash` CONTRIBUTING.md](https://github.com/zcash/librustzcash/blob/main/CONTRIBUTING.md),
which is itself based on the [contributing.md](https://contributing.md/)
template.
