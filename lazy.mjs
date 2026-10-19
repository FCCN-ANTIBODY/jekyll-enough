// jekyll-enough/lazy.mjs - RENDER ONE PAGE OF AN UNBUILT SITE OVER A FETCH. buildSite wants a whole tree,
// and over HTTP nobody can list a directory. So the tree starts as the one page asked for, and GROWS BY
// WHAT THE BUILD SAYS IT LACKS: the lenient build names each missing include as a gap and throws its
// missing layout by key, and every round fetches exactly that. No scanning of source for tags, no second
// parser to drift from the first: the renderer's own complaint is the fetch list. `budget` caps the
// rounds and the files; running out is not a refusal, and what is still missing stays a named gap.
//
// Pure apart from the injected `fetchText(path) -> string | null` (null: not there). The caller owns I/O,
// the same rule buildSite keeps - which is what lets this run in a tab over a static host, in a test over
// a directory, or over a git tree held in memory. The caller's fetchText is also where paths get MAPPED:
// a site that keeps its layouts in lib/ or its includes in an engine submodule answers `_layouts/x.html`
// and `_includes/y.html` from wherever it keeps them, and this module never knows.
//
// Moved here from anecdote.channel's press/face.mjs, where it was written to read other people's
// repositories; it is the same thing a site does to read itself.

import { buildSite } from "./build.mjs";
import { render as renderMarkdownDefault } from "./markdown.mjs";
import { frontMatter } from "./yaml.mjs";

export const LADDER = ["index.md", "README.md", "index.html"];
export const BUDGET = { rounds: 6, files: 40 };

// The SAME fence build.mjs recognises, on purpose: calling something source that the builder then files
// as a static would render nothing. (It does not accept an EMPTY fence, which real Jekyll does.)
const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Jekyll's own rule, kept: a file is SOURCE when it opens with a front-matter fence, and only then. A
// README that merely writes about `{% include %}` is prose, and must not be run through the templater.
export const isSource = (text) => FM.test(text);
const dirOf = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); };
const isDir = (p) => p === "" || p.endsWith("/");
const kindOfPath = (p) => (/\.(md|markdown)$/i.test(p) ? "markdown" : /\.html?$/i.test(p) ? "html" : "text");

// First heading, else front-matter title, else the file's own name. A page always has something to call it.
function titleOf(path, text, data = {}) {
  if (data && typeof data.title === "string" && data.title) return data.title;
  const h = /^#{1,6}\s+(.+)$/m.exec(text) || /<h1[^>]*>([^<]+)<\/h1>/i.exec(text);
  return h ? h[1].trim() : (path.split("/").pop() || "/");
}

// Build ONE page from a tree that starts as that page alone, growing the tree by what the build says it
// lacks. Returns { html, gaps, fetched }. Never throws for a missing piece - only for a broken template
// when not even the lenient posture can carry it, and then the caller degrades to text.
// `seed` is extra tree the caller already holds (a config it synthesised, data it computed).
export async function lazyBuild(path, text, fetchText, { budget = BUDGET, renderMarkdown = renderMarkdownDefault, filters, seed = {} } = {}) {
  const tree = { ...seed, [path]: text };
  const fetched = [path];
  const absent = new Set();
  const want = async (key) => {
    if (key in tree || absent.has(key) || fetched.length >= budget.files) return false;
    const got = await fetchText(key);
    if (got == null) { absent.add(key); return false; }
    tree[key] = got; fetched.push(key);
    return true;
  };
  await want("_config.yml");

  let html = null, gaps = [];
  for (let round = 0; round < budget.rounds; round++) {
    // site.data.<name> cannot announce its own absence - an undefined lookup is just an empty loop - so
    // the names are read off whatever source is held so far. One cheap pattern, tried as yml then json.
    let grew = false;
    for (const src of Object.values(tree)) {
      for (const m of String(src).matchAll(/site\.data\.([A-Za-z0-9_-]+)/g)) {
        const base = "_data/" + m[1];
        if (base + ".yml" in tree || base + ".json" in tree) continue;
        grew = (await want(base + ".yml")) || (await want(base + ".json")) || grew;
      }
    }
    gaps = [];
    let missingLayout = null;
    try {
      const out = buildSite(tree, { lenient: true, gaps, renderMarkdown, filters });
      // The tree holds ONE page (layouts, includes, data and config are inputs, never outputs), so the
      // one html file that comes out is it - wherever its permalink put it.
      const key = Object.keys(out).find((k) => /\.html?$/.test(k));
      html = key ? out[key] : null;
    } catch (e) {
      const m = /missing layout (\S+)/.exec(String(e && e.message));
      if (!m) throw e;
      missingLayout = m[1];
    }
    if (missingLayout) {
      if (await want(missingLayout)) continue;
      // The layout is not there to be had. Render the page bare rather than not at all: a stand-in
      // layout that is only its content, wherever the name came from (front matter or the site's
      // defaults), and the absence stays on the gap list.
      tree[missingLayout] = "{{ content }}";
      absent.add(missingLayout);
      continue;
    }
    for (const g of gaps) {
      const m = /^include (\S+)$/.exec(g);
      if (m) grew = (await want(m[1])) || grew;
    }
    if (!grew) break;
  }
  // One line per missing piece, in the builder's own words where it has them ("include _includes/x.html");
  // a piece only this loop knows about - a layout that could not be had - is added as "missing <key>".
  const lacking = [...new Set(gaps)];
  for (const k of absent) {
    if (k === "_config.yml" || k.startsWith("_data/") || lacking.includes("include " + k)) continue;
    lacking.push("missing " + k);
  }
  return { html, gaps: lacking, fetched };
}

// Resolve what to show for `path`. Returns
//   { face, path, title, html, fragment, gaps, fetched, tried, source }
// `source` is the answered file exactly as fetched. `face` is which rung answered
// ("index.md" | "README.md" | "source" | "live" | "markdown" | "html" | "text" | "none"); `fragment` is
// true when `html` is body content the caller should set in its own page, false when the build produced
// a whole document (a layout chain that ends in <html>).
export async function resolve(fetchText, { path = "", budget = BUDGET, renderMarkdown = renderMarkdownDefault, filters, seed } = {}) {
  const tried = [];
  let at = String(path).replace(/^\/+/, "");
  let text = null, face = null, built = null;

  if (isDir(at)) {
    for (const name of LADDER) {
      const candidate = at + name;
      tried.push(candidate);
      const got = await fetchText(candidate);
      if (got == null) continue;
      if (name === "index.html" && !isSource(got)) { built = candidate; continue; }   // a BUILT page is a live site
      text = got; at = candidate; face = name === "index.html" ? "source" : name;
      break;
    }
    if (text == null) return { face: built ? "live" : "none", path: built || String(path), title: "", html: "", fragment: true, gaps: [], fetched: [], tried };
  } else {
    tried.push(at);
    text = await fetchText(at);
    if (text == null) return { face: "none", path: at, title: "", html: "", fragment: true, gaps: [], fetched: [], tried };
    const k = kindOfPath(at);
    face = k === "markdown" ? "markdown" : (k === "html" && isSource(text)) ? "source" : k === "html" ? "html" : "text";
  }

  if (face === "text") return { face, path: at, title: at.split("/").pop(), html: "<pre>" + esc(text) + "</pre>", fragment: true, gaps: [], fetched: [at], tried, source: text };
  // Built HTML asked for BY NAME is shown as the inert markup it is.
  if (face === "html") return { face, path: at, title: titleOf(at, text), html: text, fragment: !/<html[\s>]/i.test(text), gaps: [], fetched: [at], tried, source: text };

  const { data } = frontMatter(text);
  const plainMarkdown = kindOfPath(at) === "markdown" && !isSource(text);
  if (plainMarkdown) {
    return { face, path: at, title: titleOf(at, text, data), html: renderMarkdown(text), fragment: true, gaps: [], fetched: [at], tried, source: text };
  }
  try {
    const made = await lazyBuild(at, text, fetchText, { budget, renderMarkdown, filters, seed });
    if (made.html != null) {
      return { face, path: at, title: titleOf(at, text, data), html: made.html, fragment: !/<html[\s>]/i.test(made.html),
               gaps: made.gaps, fetched: made.fetched, tried, source: text };
    }
  } catch (e) {
    // Source the enough-renderer cannot carry even leniently. The format's own floor is its text.
    return { face: "text", path: at, title: titleOf(at, text, data), html: "<pre>" + esc(text) + "</pre>", fragment: true,
             gaps: ["unrenderable: " + String(e && e.message || e)], fetched: [at], tried };
  }
  return { face: "text", path: at, title: titleOf(at, text, data), html: "<pre>" + esc(text) + "</pre>", fragment: true, gaps: ["no page came out of the build"], fetched: [at], tried };
}

// Where a link inside a rendered page leads, relative to the file it was written in. Returns
//   { where: "here", path }                   same site, another path
//   { where: "away", href }                   an absolute URL - the caller decides what leaving means
//   { where: "anchor", id }                   a fragment inside the same page
// Pure, so the rule that a page never climbs out of its site is tested without a browser.
export function resolveLink(fromPath, href) {
  const h = String(href || "").trim();
  if (!h) return null;
  if (h.startsWith("#")) return { where: "anchor", id: h.slice(1) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith("//")) return { where: "away", href: h };
  const clean = h.replace(/[?#].*$/, "");
  const segs = (clean.startsWith("/") ? clean : dirOf(fromPath) + clean).split("/");
  const out = [];
  for (const s of segs) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (!out.length) return null; out.pop(); continue; }   // never out of the site
    out.push(s);
  }
  return { where: "here", path: out.join("/") + (clean.endsWith("/") && out.length ? "/" : "") };
}
