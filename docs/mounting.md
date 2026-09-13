# Mounting an `-enough` tool

**A submodule that is not filled is an empty directory, and an empty directory is not an error.**

That sentence is the whole document. Everything below is the four places it bites, found by
extracting this repository out of `anecdote.channel` and looking at what would have broken
silently.

A vendored folder and a submodule are byte-identical to every importer — `../jekyll-enough/build.mjs`
resolves the same either way. That is what makes the extraction cheap, and it is also why the
failure mode is so quiet: **nothing changes until the mount is empty, and then everything changes
at once, without an error message.**

## 1 · The test runner that skips what it cannot find

The runner this repository came from listed its directories and did this:

```js
try { entries = readdirSync(join(root, d)); } catch { continue; }
```

Correct for an optional folder. **Wrong for a submodule.** An unhydrated mount makes four suites
disappear and the run report `N/N passed`, which is a green check for a build that tested less
than it did yesterday. Nobody looks at a passing build.

A runner that walks a submodule must **fail when the directory is missing**, not skip it. This
repository's own `test.mjs` does the same thing one level down: zero suites found is an exit 1,
because an empty run must never read as a pass.

## 2 · CI checkout does not fetch submodules

`actions/checkout@v4` fetches submodules only if you ask:

```yaml
- uses: actions/checkout@v4
  with:
    submodules: recursive
```

Without it the mount is empty and #1 turns that into a green check. **These two defaults compose
into a build that silently stops testing**, which is why they are one document and not two.

## 3 · A static deploy publishes the hole

A deploy step that uploads the working tree — `wrangler pages deploy .`, an `actions/upload-pages-artifact`
over the repo root — will happily publish an empty directory where the module used to be. If the
served site imports from that path, or a service worker caches a file under it, the site breaks in
the browser and the deploy reports success.

**Anything served from a mounted path must hydrate before it uploads.** This is the one that
produces a user-visible outage rather than a quiet loss of coverage.

## 4 · Out-of-tree consumers resolve by path

Some consumers are not in your repository at all. `NCCV/platform`'s `check-renders.mjs` searches
the disk for a checkout carrying `jekyll-enough/build.mjs` and skips with a message when it finds
none. That is good behaviour and it is *still* affected: the checkout it finds may now be a
repository whose submodule was never filled, so the file is absent and the check skips — for a
reason that has nothing to do with the reason the skip message names.

Such a consumer should say which of the two it hit. A found-but-empty mount is a **misconfigured**
checkout; no checkout at all is an **absent** one, and only the second is routine.

## The rule, stated once

> **If you mount it, hydrate it — and make the unhydrated case loud at the moment it happens,**
> not at the moment somebody notices the site is broken.

The library layer can tell you a name and where to get it. It cannot put the bytes in your build;
that is the consumer's job, and it is the reason an extraction is never only an extraction.
