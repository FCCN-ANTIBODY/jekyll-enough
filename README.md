# jekyll-enough

**Enough of Jekyll to build a site, in a tab, with nothing installed.**

Four modules, no dependencies, no build step, no Ruby:

| module | lines | what it is |
|---|---:|---|
| `liquid.mjs` | 430 | the template language — tags, filters, `include` and `include_relative` |
| `build.mjs` | 210 | the pipeline: read a tree, render it, return `_site` |
| `yaml.mjs` | 172 | front matter, `_config.yml`, `_data` — a deliberately dumb reader |
| `markdown.mjs` | 74 | the markdown→HTML pass |

`buildSite` takes a **tree** — a plain `path → content` map — and returns one. It never touches a
filesystem, which is what lets the same code run in a browser tab, in a service worker, or over a
git checkout held entirely in memory.

## The suffix is a promise, and it is tested

The `-enough` family exists because of **where** it runs:

> The real tool needs a machine. These need a tab.

That makes the health test mechanical rather than a matter of taste, and
[`dependencies.test.mjs`](dependencies.test.mjs) is it:

> **Healthy:** the modules import each other and nothing else. Not a package, not a `node:`
> builtin, not a file outside this repository.
>
> **Failed:** it acquired a dependency that only exists on a workstation, and nothing said so.

Today the four modules import **zero** `node:` builtins between them. The tests import
`node:fs`, `node:path` and `node:url` because a test needs to read its fixtures off a disk — that
is allowed, and it is allowed only for `*.test.mjs`. If a production module ever needs one, the
test fails and the conversation happens *then*, which is the whole point. A member that quietly
starts needing a real filesystem has stopped being an `-enough` tool while keeping the name, and
that failure is invisible from inside the repository.

## Use it

    git submodule add https://github.com/FCCN-ANTIBODY/jekyll-enough jekyll-enough

Then `import { buildSite } from "./jekyll-enough/build.mjs"`. There is nothing to install and
nothing to run first.

**If you mount it, hydrate it.** A submodule that is not filled is an *empty directory*, and an
empty directory is not an error to most build systems — a test runner skips the suites it cannot
find and a static deploy publishes the hole. Whatever consumes this has to make an unfilled mount
loud. See [`docs/mounting.md`](docs/mounting.md).

## Where it came from

Extracted from [`anecdote.channel`](https://github.com/FCCN-ANTIBODY/anecdote.channel), where it
was `jekyll-enough/` and where its history stays attached — the thirteen commits here are the
original ones, authors intact. It is the first member of the family to get its own address; the
plan for the rest is in that repository's `docs/origin.md`.

Siblings, current and intended: `git-enough` (the push), `actions-enough` (the workflows),
`cron-enough`, `yaml-enough`, `node-enough`.

## Status

`draft`, in the [`STATUS.md`](https://github.com/FCCN-ANTIBODY/advocate.anecdote.channel/blob/main/STATUS.md)
sense. The code is in use and its 4 suites pass; what is new is the address.
