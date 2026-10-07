export function prLink(pr: { number: number; title: string; url: string }) {
  const url = new URL(pr.url);
  const match = /^\/[^/]+\/([^/]+)\/pull\/(\d+)$/.exec(url.pathname);
  if (url.protocol !== "https:" || !match || Number(match[2]) !== pr.number) {
    throw new Error("GitHub returned an invalid PR URL.");
  }
  return { label: `${match[1]} #${pr.number}: ${pr.title}`, url: pr.url };
}

export function markdownLink(label: string, url: string) {
  return `[${label.replace(/[\\`*_{}\[\]()<>!]/g, "\\$&")}](${url.replace(/[\\()<>\s]/g, (c) => encodeURIComponent(c))})`;
}

export function htmlLink(label: string, url: string) {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
  return `<a href="${escape(url)}">${escape(label)}</a>`;
}
