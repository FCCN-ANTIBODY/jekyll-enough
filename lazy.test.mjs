// Unit: lazy.mjs - the ladder (index.md > README.md > unbuilt source > live > none), the lazy tree that
// fetches only what the lenient build names as missing, and the link rule that a page never climbs out
// of its site. Run: node lazy.test.mjs
import { resolve, resolveLink, isSource, LADDER, lazyBuild } from "./lazy.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// A site is a path -> text map; the fetcher records what was asked for, because WHAT WAS FETCHED is
// half of what is being tested (a lazy tree that fetches everything is not lazy).
const site = (files) => { const asked = []; const f = async (p) => { asked.push(p); return p in files ? files[p] : null; }; f.asked = asked; return f; };

// 1. The ladder. index.md wins over README.md; README.md stands in as the index when it is all there is.
{
  const f = site({ "index.md": "# Front page\n\nOn purpose.", "README.md": "# Readme" });
  const r = await resolve(f);
  ok(r.face === "index.md" && r.title === "Front page" && r.html.includes("<h1>Front page</h1>"), "index.md wins the ladder");
  ok(!f.asked.includes("README.md"), "...and README.md was never fetched once index.md answered");
}
{
  const r = await resolve(site({ "README.md": "# just a repo\n\nIt says what it is." }));
  ok(r.face === "README.md" && r.fragment === true && r.html.includes("It says what it is."), "README.md shown as if it were the index");
  ok(JSON.stringify(r.tried) === JSON.stringify(["index.md", "README.md"]), "tried in ladder order, stopped at the first answer");
}
ok(LADDER.join() === "index.md,README.md,index.html", "the ladder is the three names, in that order");

// 2. A README that WRITES ABOUT Liquid is prose. No fence, no templater (Jekyll's own rule).
{
  const src = "# notes\n\nIncludes look like `{% include nav.html %}` and values like {{ site.title }}.";
  ok(!isSource(src), "no front-matter fence -> not source");
  const f = site({ "README.md": src });
  const r = await resolve(f);
  ok(r.gaps.length === 0 && r.html.includes("{% include nav.html %}"), "the Liquid in the prose survived as text, and nothing reported a gap");
  ok(f.asked.every((p) => !p.startsWith("_")), "no _config/_includes fetched for plain markdown: " + f.asked.join(","));
}

// 3. Unbuilt Jekyll source: the lazy tree fetches the layout the build throws for, then the include the
//    lenient build names as a gap, and NOTHING else.
{
  const f = site({
    "index.html": "---\nlayout: default\ntitle: Unbuilt\n---\n<main>{% include hello.html who=\"you\" %}</main>",
    "_config.yml": "title: A site nobody built\n",
    "_layouts/default.html": "<html><head><title>{{ site.title }}</title></head><body>{{ content }}</body></html>",
    "_includes/hello.html": "<p>hello {{ include.who }}</p>",
    "_includes/never-asked-for.html": "<p>should not be fetched</p>",
  });
  const r = await resolve(f);
  ok(r.face === "source", "index.html with a fence is source");
  ok(r.html.includes("<title>A site nobody built</title>") && r.html.includes("<p>hello you</p>"), "layout + include + config all rendered");
  ok(r.fragment === false, "a layout chain ending in <html> is a whole document, not a fragment");
  ok(r.gaps.length === 0, "nothing left missing: " + JSON.stringify(r.gaps));
  ok(!f.asked.includes("_includes/never-asked-for.html"), "the unreferenced include was never fetched");
  ok(r.fetched.includes("_layouts/default.html") && r.fetched.includes("_includes/hello.html"), "fetched exactly what the build asked for: " + r.fetched.join(","));
}

// 4. Missing pieces degrade to NAMED GAPS, never to a refusal.
{
  const r = await resolve(site({ "index.md": "---\nlayout: gone\n---\n# Still here\n\n{% include absent.html %}\n\nBody text." }));
  ok(r.face === "index.md" && r.html.includes("Still here") && r.html.includes("Body text."), "the page rendered bare without its layout");
  ok(r.gaps.some((g) => g.includes("_layouts/gone.html")), "the missing layout is a named gap: " + JSON.stringify(r.gaps));
  ok(r.gaps.some((g) => g.includes("_includes/absent.html")), "the missing include is a named gap");
}

// 5. _data cannot announce its own absence, so it is read off the source that mentions it.
{
  const f = site({
    "index.md": "---\ntitle: piles\n---\n{% for p in site.data.piles %}<li>{{ p.name }}</li>{% endfor %}",
    "_data/piles.yml": "- name: parks\n- name: transit\n",
  });
  const r = await resolve(f);
  ok(r.html.includes("<li>parks</li>") && r.html.includes("<li>transit</li>"), "site.data.piles was fetched and looped");
}

// 6. A built index.html with nothing else is a LIVE site; with nothing at all, the face says none.
{
  const r = await resolve(site({ "index.html": "<!doctype html><title>running</title>" }));
  ok(r.face === "live" && r.path === "index.html", "a built page is live, not re-rendered");
  const n = await resolve(site({}));
  ok(n.face === "none" && n.tried.length === 3, "nothing answered -> none, with the three names it tried");
}

// 7. A named file skips the ladder; unknown formats are the text they are.
{
  const f = site({ "docs/origin.md": "# Origin", "NAME": "anecdote.channel\n", "x.html": "<p>built <b>fragment</b></p>" });
  ok((await resolve(f, { path: "docs/origin.md" })).face === "markdown", "a named .md renders as markdown");
  const t = await resolve(f, { path: "NAME" });
  ok(t.face === "text" && t.html === "<pre>anecdote.channel\n</pre>", "an unknown format is shown as its text");
  ok((await resolve(f, { path: "x.html" })).face === "html", "built html asked for by name is handed over as markup");
  const sub = await resolve(site({ "docs/README.md": "# the docs" }), { path: "docs/" });
  ok(sub.face === "README.md" && sub.path === "docs/README.md", "the ladder runs inside a subdirectory too");
}

// 8. The budget is a cap, not a refusal.
{
  const files = { "index.md": "---\ntitle: deep\n---\n{% include a.html %}" };
  for (const n of "abcdefgh") files["_includes/" + n + ".html"] = "[" + n + "]{% include " + String.fromCharCode(n.charCodeAt(0) + 1) + ".html %}";
  const r = await resolve(site(files), { budget: { rounds: 3, files: 40 } });
  ok(r.html.includes("[a]") && r.html.includes("[b]"), "as deep as the budget reached, rendered");
  ok(r.gaps.some((g) => g.startsWith("include ")), "what lay past the budget stayed a named gap: " + JSON.stringify(r.gaps));
}

// 9. A caller may SEED the tree with what it already holds (a config it synthesised, data it computed),
//    and pass the site's own filters through. A page is still fetched; the seed is never fetched again.
{
  const f = site({ "journal/x/index.md": "---\ntitle: X\n---\n{{ site.name | shout }} {{ site.data.rows.size }}" });
  const r = await resolve(f, {
    path: "journal/x/index.md",
    seed: { "_config.yml": "name: seeded\n", "_data/rows.json": "[1,2,3]" },
    filters: { shout: (v) => String(v).toUpperCase() + "!" },
  });
  ok(r.html.includes("SEEDED! 3"), "seeded config and data were used, and the caller's filter ran: " + r.html);
  ok(!f.asked.includes("_config.yml") && !f.asked.includes("_data/rows.json"), "what was seeded was not fetched: " + f.asked.join(","));
}
{
  const made = await lazyBuild("p.md", "---\ntitle: p\n---\nhi", async () => null, {});
  ok(made.html.includes("hi") && made.fetched.join() === "p.md", "lazyBuild alone: the page, and nothing else fetched");
}

// 10. Links: relative to the file, never out of the site.
{
  const j = (x) => JSON.stringify(x);
  ok(j(resolveLink("README.md", "docs/origin.md")) === j({ where: "here", path: "docs/origin.md" }), "relative link from the root");
  ok(j(resolveLink("docs/origin.md", "../CONSTITUTION.md")) === j({ where: "here", path: "CONSTITUTION.md" }), "../ resolves inside the site");
  ok(j(resolveLink("docs/origin.md", "probe-line.md#edges")) === j({ where: "here", path: "docs/probe-line.md" }), "sibling link, fragment dropped");
  ok(j(resolveLink("docs/a.md", "/reducer/")) === j({ where: "here", path: "reducer/" }), "root-absolute link, directory kept as a directory");
  ok(resolveLink("README.md", "../../etc/passwd") === null, "a link that climbs out resolves to nothing");
  ok(resolveLink("README.md", "https://example.com/x").where === "away", "an absolute URL is 'away' - the caller decides what leaving means");
  ok(resolveLink("README.md", "//example.com/x").where === "away", "protocol-relative is away too");
  ok(resolveLink("README.md", "#top").where === "anchor", "a bare fragment stays in the page");
}

if (fails) { console.error(`\n${fails} failed`); process.exit(1); }
console.log("\nlazy: all passed");
