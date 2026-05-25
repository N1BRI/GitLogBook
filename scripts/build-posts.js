const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const DOCS_POSTS_DIR = path.join(ROOT, "docs", "posts");
const DOCS_DATA_DIR = path.join(ROOT, "docs", "data");

async function main() {
  await fs.mkdir(DOCS_POSTS_DIR, { recursive: true });
  await fs.mkdir(DOCS_DATA_DIR, { recursive: true });

  const files = (await fs.readdir(POSTS_DIR)).filter((file) => file.endsWith(".md")).sort();
  const posts = [];

  for (const file of files) {
    const fullPath = path.join(POSTS_DIR, file);
    const parsed = parsePost(await fs.readFile(fullPath, "utf8"));
    if (parsed.meta.draft === "true") continue;
    const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
    const post = {
      slug,
      title: parsed.meta.title || slug,
      date: parsed.meta.date || "",
      summary: parsed.meta.summary || firstParagraph(parsed.body),
      tags: parseTags(parsed.meta.tags),
      source: parsed.meta.source || "",
      url: `/posts/${slug}.html`,
      searchText: `${parsed.meta.title || ""} ${parsed.meta.summary || ""} ${parsed.body}`.toLowerCase()
    };
    posts.push(post);
    await fs.writeFile(path.join(DOCS_POSTS_DIR, `${slug}.html`), renderPostPage(post, parsed.body), "utf8");
  }

  posts.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(path.join(DOCS_DATA_DIR, "posts.json"), JSON.stringify(posts, null, 2), "utf8");
  await fs.writeFile(path.join(DOCS_POSTS_DIR, "index.html"), renderArchivePage(), "utf8");
  console.log(`Built ${posts.length} posts.`);
}

function parsePost(input) {
  const match = input.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: input.trim() };
  return { meta: parseFrontmatter(match[1]), body: match[2].trim() };
}

function parseFrontmatter(input) {
  const meta = {};
  input.split("\n").forEach((line) => {
    const index = line.indexOf(":");
    if (index < 0) return;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  });
  return meta;
}

function parseTags(value) {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function firstParagraph(body) {
  return body.split(/\n\s*\n/).find((block) => block.trim() && !block.startsWith("!["))?.trim() || "";
}

function renderPostPage(post, markdown) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(post.title)} - GitLogBook</title>
    <link rel="stylesheet" href="/site/styles.css?v=9">
  </head>
  <body>
    <main class="post-shell">
      <nav class="post-nav"><a href="/site/">Logbook</a><a href="/posts/">Posts</a></nav>
      <article class="post-article">
        <p class="post-date">${escapeHtml(formatDate(post.date))}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="post-summary">${escapeHtml(post.summary)}</p>
        ${post.source ? `<p class="post-source">${escapeHtml(post.source)}</p>` : ""}
        ${markdownToHtml(markdown)}
      </article>
    </main>
  </body>
</html>
`;
}

function renderArchivePage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Posts - GitLogBook</title>
    <link rel="stylesheet" href="/site/styles.css?v=9">
  </head>
  <body>
    <main class="post-shell">
      <nav class="post-nav"><a href="/site/">Logbook</a><a href="/posts/">Posts</a></nav>
      <section class="archive">
        <h1>Posts</h1>
        <input id="postSearch" type="search" placeholder="Search posts">
        <div id="postArchiveList" class="post-list"></div>
      </section>
    </main>
    <script src="/posts/posts.js?v=8"></script>
  </body>
</html>
`;
}

function markdownToHtml(markdown) {
  const blocks = markdown.split(/\n\s*\n/);
  return blocks.map(renderBlock).join("\n");
}

function renderBlock(block) {
  const trimmed = block.trim();
  const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (image) {
    return `<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`;
  }
  if (trimmed.startsWith("- ")) {
    const items = trimmed.split("\n").map((line) => `<li>${inlineMarkdown(escapeHtml(line.replace(/^- /, "")))}</li>`).join("");
    return `<ul>${items}</ul>`;
  }
  return `<p>${inlineMarkdown(escapeHtml(trimmed)).replace(/\n/g, "<br>")}</p>`;
}

function inlineMarkdown(html) {
  return html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
