// Unit: markdown-enough (markdown.mjs) - the dumb markdown pass, plus the full civic render pipeline
// (Liquid then markdown) against fixtures copied verbatim from the real atlas pages. Run:
// node jekyll-enough/markdown.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render as md, inline } from "./markdown.mjs";
import { render as liquid } from "./liquid.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(HERE, "fixtures", n), "utf8");

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// 1. inline: code / links / bold / italic, and the civic-real case of a LINK whose text is a code span.
{
  ok(inline("**bold**") === "<strong>bold</strong>", "bold");
  ok(inline("_it_ and *it*") === "<em>it</em> and <em>it</em>", "italic, both _ and *");
  ok(inline("a `x<y` b") === "a <code>x&lt;y</code> b", "inline code is escaped and shielded");
  ok(inline("[text](/u)") === '<a href="/u">text</a>', "a plain link");
  ok(inline("[`/needs.json`](/needs.json)") === '<a href="/needs.json"><code>/needs.json</code></a>', "a link whose TEXT is a code span (the real civic case)");
  ok(inline("**a** `b` [c](/d)") === '<strong>a</strong> <code>b</code> <a href="/d">c</a>', "mixed inline, no cross-talk");
  ok(inline("under_score_word stays") === "under_score_word stays", "intra-word underscores are not italic");
}

// 2. blocks: heading, paragraph, fence, and RAW HTML passthrough (verbatim, un-escaped).
{
  ok(md("# Title") === "<h1>Title</h1>", "ATX h1");
  ok(md("### Deep") === "<h3>Deep</h3>", "ATX h3 by hash count");
  ok(md("one\ntwo") === "<p>one\ntwo</p>", "a soft-wrapped paragraph is one <p>");
  ok(md("a\n\nb") === "<p>a</p>\n<p>b</p>", "a blank line splits paragraphs");
  ok(md("```\n<x> & y\n```") === "<pre><code>&lt;x&gt; &amp; y</code></pre>", "a fenced block is escaped, not rendered");
  const raw = '<div id="s">\n  <a href="/x">y</a>\n</div>';
  ok(md(raw) === raw, "a multi-line raw HTML block passes through VERBATIM (not escaped, not wrapped)");
  ok(md('<script src="/a.js"></script>') === '<script src="/a.js"></script>', "a raw <script> line passes through");
}

// 3. mixed document: heading + paragraph + raw block interleave, blank-line separated.
{
  const out = md('# H\n\ntext with **b**\n\n<div>raw</div>\n\nmore [l](/u)');
  ok(out.includes("<h1>H</h1>"), "heading rendered");
  ok(out.includes("<p>text with <strong>b</strong></p>"), "paragraph rendered with inline");
  ok(out.includes("<div>raw</div>") && !out.includes("<p><div>"), "raw block not wrapped in <p>");
  ok(out.includes('<a href="/u">l</a>'), "trailing paragraph link");
}

// 3b. a raw-text element (script/style) runs to its CLOSING TAG - blank lines inside stay VERBATIM.
// The real case: tell.anecdote.channel's landing carries its forward logic in one inline <script>
// with blank lines between sections; wrapping its tail in <p> feeds literal HTML to the JS parser
// and kills the page (caught by the chain UI test driving the built site in Chromium).
{
  const script = '<script>\nvar a = 1;\n\nvar b = 2;\n</' + 'script>';
  const out = md('# H\n\n' + script + '\n\nafter');
  ok(out.includes(script), "a <script> with blank lines passes through verbatim, to its close tag");
  ok(!out.includes("<p>var") && !out.includes("<p><script"), "no <p> seeded inside or around the script");
  ok(out.includes("<p>after</p>"), "markdown resumes after the raw-text element closes");
  const style = '<style>\n.a { color: red; }\n\n.b { color: blue; }\n</style>';
  ok(md(style).includes(style), "a <style> with blank lines passes through verbatim too");
  const oneLine = '<script>var x = 1;</' + 'script>';
  ok(md(oneLine + '\n\ntext').includes(oneLine), "a same-line open+close raw-text element still works");
}

// 4. the FULL civic pipeline: Liquid (with data) then markdown, on the real page bodies.
{
  const site = { title: "Atlas", baseurl: "", data: {
    tells: [{ id: "t1", name: "Boulder", url: "https://t1", scope: "CO", signer: "key:a", reports: "" }],
    piles: [{ id: "p1", name: "Parks", tell: "t1", level: "county", map: "/p1.xml" }],
    needs: [{ id: "7", text: "clinic hours", scope: "CO", topic: "health", terms: "", need_url: "https://n", asker_repo: "who/repo" }],
  } };

  for (const [name, mustHave] of [
    ["index.body.md", ["<h1>Atlas</h1>", '<a href="/tells/">', '<strong>directory of Tells</strong>', '<div id="atlas">']],
    ["tells.body.md", ["<h1>Tells</h1>", '<a href="https://t1">Boulder</a>', "Parks", '<ul class="tells">']],
    ["needs.body.md", ['<h1>What', '<a href="https://n">who/repo#7</a>', '<ul class="whats-hanging">']],
  ]) {
    const html = md(liquid(fixture(name), { site, page: {} }));
    for (const frag of mustHave) ok(html.includes(frag), `${name}: renders ${JSON.stringify(frag)}`);
    ok(!html.includes("{%") && !html.includes("{{"), `${name}: no un-rendered Liquid remains`);
    ok(!html.includes("<p><div") && !html.includes("<p><ul"), `${name}: raw HTML blocks not swallowed into <p>`);
  }
}

// 5. lists, quotes, tables, rules, images, footnotes - the letter blocks. These were the press's
//    markdown-more pre-pass; they live here now, so there is one renderer.
{
  ok(md("- one\n- two **bold**\n") === "<ul><li>one</li><li>two <strong>bold</strong></li></ul>", "a bullet list");
  ok(md("1. first\n2. second\n") === "<ol><li>first</li><li>second</li></ol>", "a numbered list");
  ok(md("- a\n  - a1\n  - a2\n- b\n") === "<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>", "nesting by indent");
  ok(md("- a long item\n  that wraps\n- b\n") === "<ul><li>a long item that wraps</li><li>b</li></ul>", "a wrapped item folds into itself");
  ok(md("> quoted **words**\n> more\n") === "<blockquote><p>quoted <strong>words</strong>\nmore</p></blockquote>", "a blockquote renders its inside");
  ok(md("> - in a quote\n> - a list\n").includes("<blockquote><ul><li>in a quote</li>"), "a list inside a blockquote");
  const t = md("| a | b |\n| --- | --- |\n| `x` | [y](y.md) |\n");
  ok(t.startsWith("<table><thead><tr><th>a</th><th>b</th></tr></thead>") && t.includes("<td><code>x</code></td><td><a href=\"y.md\">y</a></td>"), "a pipe table with inline cells");
  ok(md("before\n\n---\n\nafter") === "<p>before</p>\n<hr>\n<p>after</p>", "a rule");
  ok(md("![a diagram](d.png)") === '<p><img src="d.png" alt="a diagram"></p>', "an image is an image");
  const src = "```\n- not a list\n> not a quote\n| not | a table |\n```";
  ok(md(src).includes("- not a list") && md(src).includes("&gt; not a quote"), "fenced code is escaped, never read as blocks");
  ok(md("**bold start** of a paragraph\n") === "<p><strong>bold start</strong> of a paragraph</p>", "a paragraph opening with ** is not a list");
  ok(md("***\n") === "<hr>", "*** is a rule, not a bullet");
  // footnotes, kramdown's shape: a superscript reference, the notes gathered at the end, a way back.
  const fn = md("A claim.[^5] Another.[^note]\n\n[^5]: The Sun, [story](https://s)\n[^note]: Second note\n  that wraps.\n");
  ok(fn.includes('<sup class="footnote"><a href="#fn:5" id="fnref:5">5</a></sup>'), "a footnote reference is a superscript link");
  ok(fn.includes('<li id="fn:5"><p>The Sun, <a href="https://s">story</a>'), "the note is listed under its id, inline rendered");
  ok(fn.includes("Second note that wraps."), "a wrapped note folds into itself");
  ok(fn.indexOf("<div class=\"footnotes\">") > fn.indexOf("Another."), "notes come after the prose");
  ok(!fn.includes("[^5]:"), "the definition lines are not left in the prose");
}

if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall markdown-enough tests passed");
