import Link from "next/link";
import { Fragment } from "react";

/**
 * Tiny, safe markdown renderer for chat replies: paragraphs, bullet/numbered lists,
 * **bold**, *italic*, `code` and [links](/books/...). No HTML is ever injected.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1] && m[2]) {
      // Models sometimes use typographic hyphens inside ids; normalise them.
      const href = m[2].replace(/[‐-―−]/g, "-");
      // Only link to books that actually exist in the shape of a real id; drop invented links.
      const validInternal = href.startsWith("/") && (!href.startsWith("/books/") || /^\/books\/[0-9a-f-]{36}$/i.test(href));
      out.push(
        validInternal ? (
          <Link key={key} href={href} className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
            {m[1]}
          </Link>
        ) : /^https?:\/\//.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline">
            {m[1]}
          </a>
        ) : (
          m[1]
        ),
      );
    } else if (m[3]) out.push(<strong key={key}>{inline(m[3], key)}</strong>);
    else if (m[4] || m[5]) out.push(<em key={key}>{inline(m[4] ?? m[5], key)}</em>);
    else if (m[6]) out.push(<code key={key} className="rounded bg-muted px-1 font-mono text-[0.85em]">{m[6]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k}>
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l, `${k}-${i}`)}
            </Fragment>
          ))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(
        <p key={`h${blocks.length}`} className="font-semibold">
          {inline(heading[1], `h${blocks.length}`)}
        </p>,
      );
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-3 leading-relaxed">{blocks}</div>;
}
