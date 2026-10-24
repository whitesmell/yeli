import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMemo, useRef, useState } from "react";

import {
  indexFrontmatter,
  isCoreMetadataKey,
  isMetadataKey,
  isMetadataNumber,
  type MetadataProperty,
  type MetadataValue,
} from "../document/frontmatter.ts";
import type { DocumentStore } from "../document/store.ts";
import type { Labels } from "../i18n/en.ts";

type PropertyType = "text" | "number" | "boolean" | "date" | "list";
const PROPERTY_PAGE_SIZE = 30;
type Commit = (
  key: string,
  value: MetadataValue | undefined,
  expected: MetadataValue | undefined,
) => string | null;

function sameValue(
  left: MetadataValue | undefined,
  right: MetadataValue | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function valueType(value: MetadataValue): PropertyType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return isDate(value) ? "date" : "text";
}

function formatValue(value: MetadataValue): string {
  return Array.isArray(value) ? value.join("\n") : String(value);
}

function parseValue(
  text: string,
  type: PropertyType,
): MetadataValue | undefined {
  if (type === "number")
    return text.trim() !== "" && isMetadataNumber(Number(text))
      ? Number(text)
      : undefined;
  if (type === "boolean") return text === "true";
  if (type === "list")
    return text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  if (type === "date" && !isDate(text)) return undefined;
  return text;
}

function typeLabel(type: PropertyType, labels: Labels): string {
  return {
    text: labels.propertyText,
    number: labels.propertyNumber,
    boolean: labels.propertyBoolean,
    date: labels.propertyDate,
    list: labels.propertyList,
  }[type];
}

function PropertyValueEditor({
  commit,
  labels,
  multiline = false,
  name,
  placeholder,
  propertyKey,
  type: explicitType,
  value,
}: {
  commit: Commit;
  labels: Labels;
  multiline?: boolean;
  name: string;
  placeholder?: string;
  propertyKey: string;
  type?: PropertyType;
  value: MetadataValue;
}) {
  const [draft, setDraft] = useState<{
    base: MetadataValue;
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const type = explicitType ?? valueType(draft?.base ?? value);
  const save = (text: string) => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const base = draft?.base ?? value;
    if (text === formatValue(base)) {
      setDraft(null);
      setError(null);
      return;
    }
    const next = parseValue(text, type);
    if (next === undefined) {
      setError(labels.propertyInvalidValue);
      return;
    }
    if (sameValue(base, next)) {
      setDraft(null);
      setError(null);
      return;
    }
    const failure = commit(propertyKey, next, base);
    setError(failure);
    if (!failure) setDraft(null);
  };
  const inputProps = {
    "aria-label": name,
    "aria-invalid": Boolean(error),
    placeholder,
    value: draft?.text ?? formatValue(value),
    onFocus: () =>
      setDraft(
        (current) => current ?? { base: value, text: formatValue(value) },
      ),
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const text = event.currentTarget.value;
      setDraft((current) => ({ base: current?.base ?? value, text }));
      setError(null);
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      save(event.currentTarget.value),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelled.current = true;
        setDraft(null);
        setError(null);
        event.currentTarget.blur();
      } else if (
        event.key === "Enter" &&
        (!(multiline || type === "list") || event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };
  return (
    <div className="property-value">
      {type === "boolean" ? (
        <label className="property-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label={name}
            checked={Boolean(value)}
            onChange={(event) =>
              setError(commit(propertyKey, event.currentTarget.checked, value))
            }
          />
          <span aria-hidden="true">
            {value ? labels.propertyOn : labels.propertyOff}
          </span>
        </label>
      ) : multiline || type === "list" ? (
        <textarea {...inputProps} rows={type === "list" ? 2 : 3} />
      ) : (
        <input
          {...inputProps}
          type={
            type === "number" ? "number" : type === "date" ? "date" : "text"
          }
          step={type === "number" ? "any" : undefined}
        />
      )}
      {type === "list" ? (
        <small className="property-hint">{labels.propertyListHint}</small>
      ) : null}
      {error ? (
        <small className="property-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

function CustomProperty({
  property,
  commit,
  labels,
  rawValue,
  onRemoved,
}: {
  property: MetadataProperty;
  commit: Commit;
  labels: Labels;
  rawValue: string;
  onRemoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const type = property.value === undefined ? null : valueType(property.value);
  return (
    <div className="custom-property" data-property-key={property.key}>
      <div className="custom-property-heading">
        <strong>{property.key}</strong>
        <span>
          {type ? typeLabel(type, labels) : labels.propertyStructured}
        </span>
        {property.editable ? (
          <button
            className="property-remove"
            type="button"
            aria-label={`${labels.removeProperty} ${property.key}`}
            title={`${labels.removeProperty} ${property.key}`}
            onClick={() => {
              const failure = commit(property.key, undefined, property.value);
              setError(failure);
              if (!failure) onRemoved();
            }}
          >
            <TrashIcon aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {property.editable && property.value !== undefined ? (
        <PropertyValueEditor
          propertyKey={property.key}
          name={property.key}
          value={property.value}
          commit={commit}
          labels={labels}
        />
      ) : (
        <div className="property-value">
          <pre className="property-raw">{rawValue.slice(0, 2000)}</pre>
          <p className="property-hint">{labels.propertyReadOnly}</p>
        </div>
      )}
      {error ? (
        <p className="property-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DocumentProperties({
  labels,
  source,
  store,
}: {
  labels: Labels;
  source: string;
  store: DocumentStore;
}) {
  const frontmatter = useMemo(() => indexFrontmatter(source), [source]);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PROPERTY_PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const focusAdd = () =>
    requestAnimationFrame(() => addTrigger.current?.focus());
  const closeCreator = () => {
    setAdding(false);
    setError(null);
    setKey("");
    setText("");
    focusAdd();
  };
  const custom = frontmatter.properties.filter(
    (property) => !isCoreMetadataKey(property.key),
  );
  const matches = custom.filter((property) =>
    property.key.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const commit: Commit = (propertyKey, value, expected) => {
    const current = indexFrontmatter(store.getSnapshot().source);
    if (current.status === "unsafe") return labels.metadataUnsafe;
    const actual = current.properties.find(
      (property) => property.key === propertyKey,
    )?.value;
    if (!sameValue(actual, expected)) return labels.propertyConflict;
    try {
      return store.patchMetadata(propertyKey, value).ok
        ? null
        : labels.propertySaveFailed;
    } catch {
      return labels.propertySaveFailed;
    }
  };
  if (frontmatter.status === "unsafe")
    return (
      <div className="validation-card" role="alert">
        <div>
          <strong>{labels.metadataUnsafe}</strong>
          <p>{labels.metadataUnsafeDescription}</p>
        </div>
      </div>
    );
  return (
    <div className="document-properties">
      <p className="properties-intro">{labels.propertiesIntro}</p>
      <section className="inspector-section">
        <h3 className="properties-section-title">{labels.contentDetails}</h3>
        <label className="inspector-field is-stacked">
          <span>{labels.summary}</span>
          <PropertyValueEditor
            propertyKey="description"
            type="text"
            name={labels.summary}
            placeholder={labels.addSummary}
            value={frontmatter.metadata.description ?? ""}
            multiline
            labels={labels}
            commit={(name, value, expected) =>
              commit(
                name,
                value,
                expected === "" &&
                  frontmatter.metadata.description === undefined
                  ? undefined
                  : expected,
              )
            }
          />
        </label>
      </section>
      <details className="inspector-section properties-disclosure">
        <summary>
          <h3 className="properties-section-title">{labels.identityDetails}</h3>
        </summary>
        <div className="properties-group-fields">
          {(["tags", "authors", "lang", "aliases"] as const).map((name) => {
            const value = frontmatter.metadata[name];
            const fallback = name === "lang" ? "" : [];
            const label = {
              tags: labels.tags,
              authors: labels.authors,
              lang: labels.language,
              aliases: labels.aliases,
            }[name];
            return (
              <label className="inspector-field is-stacked" key={name}>
                <span>{label}</span>
                <PropertyValueEditor
                  propertyKey={name}
                  type={name === "lang" ? "text" : "list"}
                  name={label}
                  value={value ?? fallback}
                  labels={labels}
                  commit={(key, next, expected) =>
                    commit(
                      key,
                      next,
                      value === undefined && sameValue(expected, fallback)
                        ? undefined
                        : expected,
                    )
                  }
                />
              </label>
            );
          })}
        </div>
      </details>
      <section className="inspector-section">
        <div className="properties-section-heading">
          <h3 className="properties-section-title">
            {labels.customProperties}
          </h3>
          <span className="property-count">{custom.length}</span>
        </div>
        {custom.length > 8 || filter ? (
          <input
            className="property-search"
            type="search"
            aria-label={labels.findProperty}
            placeholder={labels.findProperty}
            value={filter}
            onChange={(event) => {
              setFilter(event.currentTarget.value);
              setLimit(PROPERTY_PAGE_SIZE);
            }}
          />
        ) : null}
        {matches.slice(0, limit).map((property) => (
          <CustomProperty
            key={property.key}
            property={property}
            commit={commit}
            labels={labels}
            rawValue={source.slice(...property.valueRange)}
            onRemoved={focusAdd}
          />
        ))}
        {custom.length > 0 && matches.length === 0 ? (
          <p className="property-empty">{labels.noPropertiesFound}</p>
        ) : null}
        {matches.length > limit ? (
          <button
            className="property-add"
            type="button"
            onClick={() => setLimit((current) => current + PROPERTY_PAGE_SIZE)}
          >
            {labels.moreProperties}
          </button>
        ) : null}
        {!custom.length && !adding ? (
          <p className="property-empty">{labels.customPropertiesEmpty}</p>
        ) : null}
        {adding ? (
          <form
            className="property-create"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              event.stopPropagation();
              closeCreator();
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const name = key.trim();
              const current = indexFrontmatter(store.getSnapshot().source);
              if (!isMetadataKey(name)) {
                setError(labels.propertyInvalidName);
                return;
              }
              if (
                isCoreMetadataKey(name) ||
                current.properties.some((property) => property.key === name)
              ) {
                setError(labels.propertyExists);
                return;
              }
              const value = parseValue(text, type);
              if (value === undefined) {
                setError(labels.propertyInvalidValue);
                return;
              }
              const failure = commit(name, value, undefined);
              setError(failure);
              if (!failure) {
                if (filter.trim() || custom.length >= limit) setFilter(name);
                closeCreator();
              }
            }}
          >
            <label className="inspector-field is-stacked">
              <span>{labels.propertyName}</span>
              <input
                autoFocus
                value={key}
                maxLength={128}
                placeholder={labels.propertyNamePlaceholder}
                onChange={(event) => {
                  setKey(event.currentTarget.value);
                  setError(null);
                }}
              />
            </label>
            <label className="inspector-field is-stacked">
              <span>{labels.propertyType}</span>
              <select
                aria-label={labels.propertyType}
                value={type}
                onChange={(event) => {
                  setType(event.currentTarget.value as PropertyType);
                  setText("");
                  setError(null);
                }}
              >
                {(["text", "number", "boolean", "date", "list"] as const).map(
                  (item) => (
                    <option key={item} value={item}>
                      {typeLabel(item, labels)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="inspector-field is-stacked">
              <span>{labels.propertyValue}</span>
              {type === "boolean" ? (
                <select
                  aria-label={labels.propertyValue}
                  value={text || "false"}
                  onChange={(event) => setText(event.currentTarget.value)}
                >
                  <option value="false">{labels.propertyOff}</option>
                  <option value="true">{labels.propertyOn}</option>
                </select>
              ) : type === "list" ? (
                <textarea
                  value={text}
                  placeholder={labels.propertyListHint}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
              ) : (
                <input
                  type={
                    type === "number"
                      ? "number"
                      : type === "date"
                        ? "date"
                        : "text"
                  }
                  step={type === "number" ? "any" : undefined}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
              )}
            </label>
            {error ? (
              <p role="alert" className="property-error">
                {error}
              </p>
            ) : null}
            <div className="property-create-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={closeCreator}
              >
                {labels.cancel}
              </button>
              <button className="primary-action" type="submit">
                {labels.addProperty}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="property-add"
            ref={addTrigger}
            type="button"
            onClick={() => {
              setAdding(true);
              setType("text");
              setError(null);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {labels.addProperty}
          </button>
        )}
      </section>
    </div>
  );
}
