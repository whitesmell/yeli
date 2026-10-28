import { HeartIcon } from "@heroicons/react/24/solid";
import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { indexFrontmatter } from "../document/frontmatter.ts";
import type { YeliAsset } from "../document/model.ts";
import type { Labels } from "../i18n/en.ts";
import { renderDocumentMarkdownSegments } from "../render/markdown.ts";
import { resolveWorkspaceImage } from "./starter-assets.ts";
import type { ImagePreviewTarget } from "./image-preview.tsx";

interface ReadSurfaceProps {
  assets: readonly YeliAsset[];
  displayTitle: string;
  labels: Labels;
  onOpenImage: (image: ImagePreviewTarget, trigger: HTMLElement) => void;
  revision: number;
  source: string;
}

export function ReadSurface({
  assets,
  displayTitle,
  labels,
  onOpenImage,
  revision,
  source,
}: ReadSurfaceProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const metadata = useMemo(() => indexFrontmatter(source).metadata, [source]);
  const html = useMemo(
    () =>
      renderDocumentMarkdownSegments(source, {
        imageUnavailableLabel: labels.imageNotLoaded,
        footnotesSupplementLabel: labels.footnotesSupplement,
        revision,
        resolveImage: (destination) =>
          resolveWorkspaceImage(destination, assets),
      }),
    [
      assets,
      labels.imageNotLoaded,
      labels.footnotesSupplement,
      revision,
      source,
    ],
  );
  // Stable innerHTML props preserve image nodes and their focus when dialogs
  // or other parent state changes without changing the rendered Markdown.
  const fragments = useMemo(
    () => ({
      before: { __html: html.beforeCallout },
      callout: { __html: html.callout ?? "" },
      after: { __html: html.afterCallout },
    }),
    [html],
  );

  useEffect(() => {
    contentRef.current
      ?.querySelectorAll<HTMLImageElement>("img.document-image")
      .forEach((image) => {
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-label", `${labels.openImage}: ${image.alt}`);
      });
  }, [html, labels.openImage]);

  const openImage = (target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.matches("img.document-image")) return;
    const source = target.getAttribute("src");
    if (!source) return;
    onOpenImage({ alternative: target.alt, source }, target);
  };

  const onImageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof HTMLImageElement)) return;
    event.preventDefault();
    openImage(event.target);
  };

  const onImageDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    openImage(event.target);
  };

  return (
    <main className="read-surface" id="document-content">
      <article className="read-document">
        <header className="read-heading">
          <h1 id="document-title">{displayTitle}</h1>
          {metadata.description ? <p>{metadata.description}</p> : null}
          {metadata.tags?.length ? (
            <div className="read-metadata">
              {(metadata.tags ?? []).map((tag) => (
                <span className="tag-chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </header>
        <div
          className="markdown-document"
          ref={contentRef}
          onDoubleClick={onImageDoubleClick}
          onKeyDown={onImageKeyDown}
        >
          <div
            className="markdown-fragment"
            // Markdown crosses a strict markdown-it and DOMPurify boundary.
            dangerouslySetInnerHTML={fragments.before}
          />
          {html.callout ? (
            <div className="read-callout-shell">
              <span className="read-callout-icon" aria-hidden="true">
                <HeartIcon />
              </span>
              <div
                className="markdown-fragment"
                dangerouslySetInnerHTML={fragments.callout}
              />
            </div>
          ) : null}
          <div
            className="markdown-fragment"
            dangerouslySetInnerHTML={fragments.after}
          />
        </div>
      </article>
    </main>
  );
}
