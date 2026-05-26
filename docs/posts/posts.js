const search = document.querySelector("#postSearch");
const list = document.querySelector("#postArchiveList");
let posts = [];

init();

async function init() {
  posts = await fetch("../data/posts.json").then((response) => response.json());
  search.addEventListener("input", render);
  render();
}

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = posts.filter((post) => !query || post.searchText.includes(query));
  list.innerHTML = filtered.length
    ? filtered.map(renderPost).join("")
    : `<p class="empty">No posts match that search.</p>`;
}

function renderPost(post) {
  return `<article class="post-card">
    <p>${escapeHtml(formatDate(post.date))}</p>
    <h2><a href="./${escapeHtml(post.slug)}.html">${escapeHtml(post.title)}</a></h2>
    <span>${escapeHtml(post.tags.join(" / "))}</span>
    <p>${escapeHtml(post.summary)}</p>
  </article>`;
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
