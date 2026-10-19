# Working in this repository

Small on purpose. Read `README.md` and then the module you are changing — there is no
architecture to learn beyond five files that call each other in one direction.

## The rules most likely to be broken here

1. **No dependencies. Not one.** Not a package, not a `node:` builtin in a production module, not
   a file outside this repository. `dependencies.test.mjs` enforces it and will fail the build.
   If you think you need one, that is a conversation, not a commit.
2. **`buildSite` takes a tree and returns a tree.** It must not read or write a filesystem. The
   caller owns I/O — that is what lets this run in a tab. A convenience wrapper that reads a
   directory belongs in the *caller*, not here.
3. **Dumb on purpose, and ONE of each.** `yaml.mjs` is not a YAML implementation and
   `markdown.mjs` is not CommonMark. They are *enough*: what the civic pages and the letters they
   carry actually use. Widen one when a real page or a real letter needs it, never to chase a
   spec. And never fix a gap by putting a second renderer in front of the first: there was one
   (the press's `markdown-more`), two renderers read the same letter two ways, and it was folded
   back in here.
4. **Match real Jekyll where it is cheap, and say so where it is not.** The lenient posture —
   a missing include degrades to an HTML comment rather than failing the build — is deliberate.
   Do not make it strict without saying what breaks.
5. **Out-of-tree consumers transcribe from here.** `NCCV/platform`'s `check-render-compat.mjs`
   copies the tag and filter lists out of `liquid.mjs` by hand and says so in a comment. Adding a
   tag does not break it; *removing* one does, silently and elsewhere. Mention it in the PR.

## Conventions

Branch from an up-to-date `origin/main`, never commit to `main`, open a PR. Keep a `.pr` file at
the repo root holding what the PR would say — and **empty it in the same act that opens the PR**,
because it is a slot and not an archive.

Tests: `node test.mjs`. No installer, no runner, no config.
