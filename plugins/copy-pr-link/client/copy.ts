import { htmlLink, markdownLink } from "../shared/link.ts";

export async function copyPrLink(
  link: { label: string; url: string },
  copyRich: (html: string, text: string) => Promise<boolean>,
  copyText: (text: string) => Promise<void>,
) {
  const text = markdownLink(link.label, link.url);
  if (!(await copyRich(htmlLink(link.label, link.url), text))) await copyText(text);
}
