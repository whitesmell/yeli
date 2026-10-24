import { CommandLineIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  commandsForSurface,
  type CommandContext,
  type CommandMode,
  type CommandScope,
} from "../editor/command-registry.ts";
import { markdownSyntaxForQuery } from "../editor/markdown-guide.ts";
import type { Labels } from "../i18n/en.ts";

const scopeLabel: Record<CommandScope, keyof Labels> = {
  auxiliary: "commandScope_auxiliary",
  block: "commandScope_block",
  document: "commandScope_document",
  selection: "commandScope_selection",
  structure: "commandScope_structure",
};

const modeLabel: Record<CommandMode, keyof Labels> = {
  edit: "commandModeEdit",
  read: "commandModeRead",
};

export function EfficiencyGuide({
  context,
  labels,
  locale,
  onClose,
}: {
  context: CommandContext;
  labels: Labels;
  locale: "en" | "zh-CN";
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const commands = useMemo(
    () => commandsForSurface("efficiency-guide", context, { labels, query }),
    [context, labels, query],
  );
  const syntax = useMemo(
    () => markdownSyntaxForQuery(locale, query),
    [locale, query],
  );

  useEffect(() => searchRef.current?.focus(), []);

  return (
    <aside
      aria-labelledby="efficiency-guide-title"
      className="efficiency-guide side-utility-panel"
      role="complementary"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header>
        <span className="overlay-eyebrow">
          <CommandLineIcon aria-hidden="true" />
          Yeli
        </span>
        <button type="button" aria-label={labels.close} onClick={onClose}>
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>
      <div className="efficiency-guide-heading">
        <h2 id="efficiency-guide-title">{labels.efficiencyGuide}</h2>
        <p>{labels.efficiencyGuideDescription}</p>
      </div>
      <label className="efficiency-search">
        <span>{labels.guideSearch}</span>
        <input
          ref={searchRef}
          type="search"
          autoComplete="off"
          placeholder={labels.guideSearchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="efficiency-mode" aria-label={labels.commandMode}>
        {labels[modeLabel[context.mode]]}
      </div>

      {commands.length > 0 ? (
        <section className="guide-section" aria-labelledby="guide-actions">
          <h3 id="guide-actions">{labels.guideActions}</h3>
          <ul className="efficiency-command-list">
            {commands.map(({ available, definition, disabledReason }) => (
              <li
                aria-disabled={!available}
                className={available ? undefined : "is-disabled"}
                key={definition.id}
              >
                <div>
                  <strong>{labels[definition.label]}</strong>
                  <small>
                    {labels.commandScope}:{" "}
                    {labels[scopeLabel[definition.scope]]}
                    {" · "}
                    {labels.commandMode}:{" "}
                    {definition.modes
                      .map((mode) => labels[modeLabel[mode]])
                      .join(" / ")}
                  </small>
                  {!available && disabledReason ? (
                    <span className="command-disabled-reason" role="note">
                      {labels[disabledReason]}
                    </span>
                  ) : null}
                </div>
                {definition.shortcuts?.[0] ? (
                  <kbd>{definition.shortcuts[0].display}</kbd>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {syntax.length > 0 ? (
        <section className="guide-section" aria-labelledby="guide-syntax">
          <h3 id="guide-syntax">{labels.guideMarkdownSyntax}</h3>
          <ul className="markdown-syntax-list">
            {syntax.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title[locale]}</strong>
                  <small>{item.description[locale]}</small>
                </div>
                <pre>{item.example}</pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {commands.length === 0 && syntax.length === 0 ? (
        <p className="efficiency-empty" role="status">
          {labels.commandNoResults}
        </p>
      ) : null}
    </aside>
  );
}
