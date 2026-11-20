"use client";

import Link from "next/link";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/*
 * Owlie's answers as Markdown: bold, italics, lists, links, inline code, quotes and small tables.
 * Raw HTML is never rendered (react-markdown's default) and images are dropped. Single line
 * breaks are kept (remark-breaks), so plain-text answers look the same as before.
 */

const PLUGINS = [remarkGfm, remarkBreaks];

/** Only same-site paths, http(s) and mailto links; anything else (javascript:, data:) is removed. */
function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return /^(\/(?!\/)|https?:\/\/|mailto:)/i.test(cleaned) ? cleaned : "";
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4.5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4.5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 marker:text-muted-foreground">{children}</li>,
  // Headings stay small inside a chat bubble.
  h1: ({ children }) => <p className="mt-2 font-semibold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-2 font-semibold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-2 font-semibold first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mt-2 font-semibold first:mt-0">{children}</p>,
  blockquote: ({ children }) => <blockquote className="my-1.5 border-l-2 border-border pl-2.5 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-2.5 border-border" />,
  code: ({ children }) => <code className="rounded bg-black/6 px-1 py-px font-mono text-[0.75rem] dark:bg-white/10">{children}</code>,
  pre: ({ children }) => <pre className="my-1.5 overflow-x-auto rounded-md bg-black/6 p-2 font-mono text-[0.75rem] dark:bg-white/10 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[0.75rem]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-1.5 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-1.5 py-1 align-top">{children}</td>,
  a: ({ href, children }) => {
    const className = "font-medium text-brand-blue underline underline-offset-2 hover:no-underline dark:text-[#7fb0ff]";
    if (!href) return <span>{children}</span>;
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  },
};

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words">
      <Markdown remarkPlugins={PLUGINS} components={COMPONENTS} urlTransform={safeUrl} disallowedElements={["img"]} unwrapDisallowed={false}>
        {text}
      </Markdown>
    </div>
  );
}
