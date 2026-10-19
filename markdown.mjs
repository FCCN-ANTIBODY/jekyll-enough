// jekyll-enough/markdown.mjs - MARKDOWN-ENOUGH: the markdown to HTML pass, the second half of rendering a
// page (Liquid runs first, this runs on the resulting body). NOT CommonMark - what the civic pages and the
// letters they carry actually use: ATX headings, paragraphs, inline (code / links / images / bold /
// italic), fenced code, bullet and numbered lists (nested by indent), blockquotes, pipe tables, rules,
// footnotes, and - crucially - RAW HTML BLOCKS PASS THROUGH VERBATIM (the <ul>/<div>/<script> that the
// Liquid loops expand into). Kramdown's default is block-HTML passthrough; we keep that.
//
// ONE MODULE. This used to be a dumb core here plus a "README dialect" pre-pass in anecdote.channel's
// press (markdown-more.mjs) that upgraded lists, quotes and tables to HTML in front of it. Two renderers
// for one job meant the civic sites and the press read the same letter differently; now there is one.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SEP = ""; // private-use sentinel: cannot occur in markdown source, so shielded spans never collide

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)$/;

// ---- inline: code spans, then images, links, footnote refs, bold, italic. ----------------------------
export function inline(text) {
  const holds = [];
  const stash = (html) => { holds.push(html); return SEP + (holds.length - 1) + SEP; };
  // 1. code spans first, so their contents are shielded from everything below and get escaped.
  let s = text.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
  // 2. images before links, since an image is a link with a bang in front.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => stash(`<img src="${src}" alt="${esc(alt)}">`));
  // 3. links - the text half may already contain a stashed code span.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`);
  // 4. footnote references: [^5] -> a superscript link to the note (kramdown's ids).
  s = s.replace(/\[\^([^\]\s]+)\]/g, (_, id) => stash(`<sup class="footnote"><a href="#fn:${id}" id="fnref:${id}">${esc(id)}</a></sup>`));
  // 5. bold before italic so ** is not eaten by the single-* rule.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>").replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1<em>$2</em>");
  return s.replace(new RegExp(SEP + "(\\d+)" + SEP, "g"), (_, i) => holds[+i]);
}

// ---- lists: items { indent, ordered, text }; continuation lines fold into the item above them. ---------
function list(lines) {
  const items = [];
  for (const l of lines) {
    const m = ITEM.exec(l);
    if (m) items.push({ indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), text: m[3] });
    else if (items.length) items[items.length - 1].text += " " + l.trim();
  }
  let html = "";
  const open = [];                                        // stack of { indent, tag }
  for (const it of items) {
    while (open.length && it.indent < open[open.length - 1].indent) html += "</li></" + open.pop().tag + ">";
    if (!open.length || it.indent > open[open.length - 1].indent) {
      const tag = it.ordered ? "ol" : "ul";
      open.push({ indent: it.indent, tag }); html += "<" + tag + ">";
    } else html += "</li>";
    html += "<li>" + inline(it.text);
  }
  while (open.length) html += "</li></" + open.pop().tag + ">";
  return html;
}

function table(lines) {
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return "<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}

// ---- blocks: split on blank lines, keeping fenced code and multi-line raw-HTML blocks intact. ----------
export function render(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const notes = [];                                       // footnote definitions, emitted at the end
  let i = 0;
  const blank = (l) => l.trim() === "";
  const special = (l) => /^```/.test(l.trim()) || l.trimStart().startsWith("<") || /^#{1,6}\s/.test(l);
  while (i < lines.length) {
    if (blank(lines[i])) { i++; continue; }

    // fenced code block: ``` ... ``` (contents escaped, verbatim otherwise)
    if (/^```/.test(lines[i].trim())) {
      i++; const buf = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // raw HTML block: a line that begins with '<' - pass the whole block through until a blank line.
    // A RAW-TEXT element (script/style/pre/textarea) runs to its CLOSING TAG instead, blank lines and
    // all - that's HTML's own parsing rule, and kramdown's passthrough honors it. Without this, a
    // blank line inside an inline <script> (tell.anecdote.channel's landing) would seed a literal
    // <p> into the script body and break the page's JS - caught by the real-Chromium chain test.
    if (lines[i].trimStart().startsWith("<")) {
      const raw = /^<(script|style|pre|textarea)\b/i.exec(lines[i].trimStart());
      const buf = [];
      if (raw && !new RegExp(`</${raw[1]}\\s*>`, "i").test(lines[i])) {
        const close = new RegExp(`</${raw[1]}\\s*>`, "i");
        while (i < lines.length) { const l = lines[i++]; buf.push(l); if (close.test(l)) break; }
      } else {
        while (i < lines.length && !blank(lines[i])) buf.push(lines[i++]);
      }
      out.push(buf.join("\n"));
      continue;
    }

    // ATX heading: #..###### on a single line.
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`); i++; continue; }

    // everything else is a block of consecutive non-blank, non-special lines
    const block = [];
    while (i < lines.length && !blank(lines[i]) && !special(lines[i])) block.push(lines[i++]);

    if (block.every((l) => /^\s{0,3}>/.test(l))) {
      const inner = block.map((l) => l.replace(/^\s{0,3}>\s?/, "")).join("\n");
      out.push("<blockquote>" + render(inner).replace(/\n\s*\n/g, "\n") + "</blockquote>");
    } else if (ITEM.test(block[0]) && !RULE.test(block[0])) {
      out.push(list(block));
    } else if (block.length >= 2 && block[0].includes("|") && TABLE_SEP.test(block[1])) {
      out.push(table(block));
    } else if (block.length === 1 && RULE.test(block[0])) {
      out.push("<hr>");
    } else if (FOOTNOTE_DEF.test(block[0])) {
      // footnote definitions: one per line, a block of them in a row; continuation lines fold in.
      for (const l of block) {
        const m = FOOTNOTE_DEF.exec(l);
        if (m) notes.push({ id: m[1], text: m[2] });
        else if (notes.length) notes[notes.length - 1].text += " " + l.trim();
      }
    } else {
      out.push(`<p>${inline(block.join("\n"))}</p>`);
    }
  }
  if (notes.length) {
    out.push('<div class="footnotes"><ol>' + notes.map((n) =>
      `<li id="fn:${n.id}"><p>${inline(n.text)} <a href="#fnref:${n.id}" class="reversefootnote">&#8617;</a></p></li>`).join("") + "</ol></div>");
  }
  return out.join("\n");
}
