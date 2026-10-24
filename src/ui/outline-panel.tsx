import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  deriveOutline,
  filterOutlineTree,
  nestOutline,
  type OutlineNode,
} from "../editor/outline.ts";
import type { Labels } from "../i18n/en.ts";

interface OutlinePanelProps {
  focusSearchRequest: number;
  label: string;
  labels: Labels;
  onClose: () => void;
  source: string;
}

function OutlineBranch({
  activeAnchor,
  collapsed,
  labels,
  nodes,
  onNavigate,
  onToggle,
  searching,
}: {
  activeAnchor: string;
  collapsed: ReadonlySet<string>;
  labels: Labels;
  nodes: readonly OutlineNode[];
  onNavigate: (anchor: string) => void;
  onToggle: (anchor: string) => void;
  searching: boolean;
}) {
  return (
    <ul role="group">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const expanded = searching || !collapsed.has(node.anchor);
        return (
          <li key={node.anchor} role="none">
            <div
              className={`outline-row${activeAnchor === node.anchor ? " is-active" : ""}`}
              role="treeitem"
              aria-level={node.level}
              aria-expanded={hasChildren ? expanded : undefined}
            >
              {hasChildren ? (
                <button
                  className="outline-expander"
                  type="button"
                  aria-label={`${expanded ? labels.outlineCollapseNode : labels.outlineExpandNode}: ${node.text}`}
                  aria-expanded={expanded}
                  onClick={() => onToggle(node.anchor)}
                  onKeyDown={(event) => {
                    if (
                      (event.key === "ArrowLeft" && expanded) ||
                      (event.key === "ArrowRight" && !expanded)
                    ) {
                      event.preventDefault();
                      onToggle(node.anchor);
                    }
                  }}
                >
                  <PlayIcon aria-hidden="true" />
                </button>
              ) : (
                <span className="outline-expander-placeholder" />
              )}
              <button
                className="outline-item"
                type="button"
                aria-current={
                  activeAnchor === node.anchor ? "location" : undefined
                }
                title={node.text}
                onClick={() => onNavigate(node.anchor)}
              >
                {node.text}
              </button>
            </div>
            {hasChildren && expanded ? (
              <OutlineBranch
                activeAnchor={activeAnchor}
                collapsed={collapsed}
                labels={labels}
                nodes={node.children}
                onNavigate={onNavigate}
                onToggle={onToggle}
                searching={searching}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function OutlinePanel({
  focusSearchRequest,
  label,
  labels,
  onClose,
  source,
}: OutlinePanelProps) {
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => deriveOutline(source), [source]);
  const tree = useMemo(() => nestOutline(items), [items]);
  const visible = useMemo(() => filterOutlineTree(tree, query), [query, tree]);
  const currentAnchor = items.some((item) => item.anchor === activeAnchor)
    ? activeAnchor
    : (items[0]?.anchor ?? "");

  useEffect(() => {
    if (focusSearchRequest > 0) searchRef.current?.focus();
  }, [focusSearchRequest]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const headings = items
      .map((item) => document.getElementById(item.anchor))
      .filter((element): element is HTMLElement => element !== null);
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleHeading = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0];
        if (visibleHeading?.target.id) {
          const nextAnchor = visibleHeading.target.id;
          setActiveAnchor((current) =>
            current === nextAnchor ? current : nextAnchor,
          );
        }
      },
      { rootMargin: "-12% 0px -72%", threshold: [0, 1] },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  const toggle = (anchor: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(anchor)) next.delete(anchor);
      else next.add(anchor);
      return next;
    });
  };

  const navigate = (anchor: string) => {
    setActiveAnchor(anchor);
    document
      .getElementById(anchor)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="outline-panel" aria-label={label}>
      <div className="panel-heading">
        <h2>{labels.outline}</h2>
        <button
          className="icon-button rail-close"
          type="button"
          onClick={onClose}
          aria-label={labels.outlineClose}
          title={labels.outlineClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </div>
      <label className="outline-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <span className="sr-only">{labels.outlineFilter}</span>
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={labels.outlineSearch}
        />
      </label>
      <nav aria-label={labels.sections} role="tree">
        <OutlineBranch
          activeAnchor={currentAnchor}
          collapsed={collapsed}
          labels={labels}
          nodes={visible}
          onNavigate={navigate}
          onToggle={toggle}
          searching={query.trim().length > 0}
        />
      </nav>
    </aside>
  );
}
