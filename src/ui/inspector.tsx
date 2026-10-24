import {
  ArrowPathIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState, type ReactNode } from "react";

import type { DocumentSnapshot, DocumentStore } from "../document/store.ts";
import { createAssetDeltaForPatch } from "../document/transactions.ts";
import {
  createBlockReplacementPatch,
  createConstructPatch,
  type SourceBlock,
} from "../editor/block-projection.ts";
import type { Labels } from "../i18n/en.ts";
import { imageBlockDetails } from "./image-block.ts";
import { DocumentProperties } from "./document-properties.tsx";

interface InspectorProps {
  labels: Labels;
  onClose: () => void;
  onClearSelection: () => void;
  onEmbedImage: (
    file: File,
    createPatch: (
      destination: string,
    ) => ReturnType<typeof createConstructPatch>,
  ) => Promise<boolean>;
  selectedBlock: SourceBlock | undefined;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

type SectionKey = "image-actions" | "image-details" | "image-technical";

function imageObjectName(target: string, embeddedLabel: string): string {
  if (target.startsWith("yeli-asset:")) return embeddedLabel;
  const segment = target.split(/[/:]/u).filter(Boolean).at(-1);
  if (!segment) return target;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function InspectorSection({
  children,
  expanded,
  id,
  onToggle,
  title,
}: {
  children: ReactNode;
  expanded: boolean;
  id: SectionKey;
  onToggle: (id: SectionKey) => void;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <button
        className="inspector-section-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={`inspector-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <ChevronDownIcon aria-hidden="true" />
        <span>{title}</span>
      </button>
      {expanded ? (
        <div
          className="inspector-section-content"
          id={`inspector-section-${id}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Inspector({
  labels,
  onClose,
  onClearSelection,
  onEmbedImage,
  selectedBlock,
  snapshot,
  store,
}: InspectorProps) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    "image-actions": true,
    "image-details": true,
    "image-technical": false,
  });
  const image = imageBlockDetails(selectedBlock);
  const showImageInspector = Boolean(image && selectedBlock);
  const toggleSection = (id: SectionKey) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  };
  const deleteImage = () => {
    if (!selectedBlock || !image) return;
    const patch = createBlockReplacementPatch(selectedBlock, "");
    const assetId = image.target.startsWith("yeli-asset:")
      ? image.target.slice("yeli-asset:".length)
      : undefined;
    const assetDelta = createAssetDeltaForPatch(snapshot, patch, {
      ...(assetId ? { pruneAssetIds: [assetId] } : {}),
    });
    const result = store.applyTransaction({
      ...(assetDelta ? { assetDelta } : {}),
      expectedRevision: patch.revision,
      expectedSourceHash: patch.sourceHash,
      operation: "image:delete",
      patches: [patch],
    });
    if (result.ok) onClearSelection();
  };
  const duplicateImage = () => {
    if (!selectedBlock) return;
    const separator = selectedBlock.expectedText.endsWith("\n") ? "\n" : "\n\n";
    store.applyPatch(
      createBlockReplacementPatch(
        selectedBlock,
        `${selectedBlock.expectedText}${separator}${selectedBlock.expectedText}`,
      ),
    );
    onClearSelection();
  };

  return (
    <aside className="inspector" aria-label={labels.inspector}>
      <div className="inspector-heading">
        <div className="inspector-context-heading">
          {showImageInspector ? (
            <PhotoIcon aria-hidden="true" />
          ) : (
            <DocumentTextIcon aria-hidden="true" />
          )}
          <span>
            <strong>
              {showImageInspector ? labels.image : labels.documentProperties}
            </strong>
            {image ? (
              <small>
                {imageObjectName(image.target, labels.embeddedImage)}
              </small>
            ) : null}
          </span>
        </div>
        <div className="inspector-heading-actions">
          {showImageInspector ? (
            <div className="inspector-quick-actions">
              <button
                type="button"
                aria-label={labels.duplicateImage}
                title={labels.duplicateImage}
                onClick={duplicateImage}
              >
                <DocumentDuplicateIcon aria-hidden="true" />
              </button>
              <button
                className="is-danger"
                type="button"
                aria-label={labels.deleteImage}
                title={labels.deleteImage}
                onClick={deleteImage}
              >
                <TrashIcon aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <button
            className="icon-button rail-close"
            type="button"
            onClick={onClose}
            aria-label={labels.inspectorClose}
            title={labels.inspectorClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      {!showImageInspector ? (
        <div className="inspector-body">
          <DocumentProperties
            labels={labels}
            source={snapshot.source}
            store={store}
          />
        </div>
      ) : (
        <div className="inspector-body block-inspector">
          <InspectorSection
            expanded={expanded["image-details"]}
            id="image-details"
            onToggle={toggleSection}
            title={labels.imageDetails}
          >
            <label className="inspector-field">
              <span>{labels.alternativeText}</span>
              <input
                aria-label={labels.alternativeText}
                defaultValue={image!.alternative}
                key={`${selectedBlock!.id}:${snapshot.revision}:image-alt`}
                onBlur={(event) => {
                  if (event.currentTarget.value === image!.alternative) return;
                  store.applyPatch(
                    createConstructPatch(
                      selectedBlock!,
                      { kind: "image-alt" },
                      event.currentTarget.value,
                    ),
                  );
                }}
              />
            </label>
            <label className="inspector-field">
              <span>{labels.imageTitle}</span>
              <input
                aria-label={labels.imageTitle}
                defaultValue={image!.title}
                key={`${selectedBlock!.id}:${snapshot.revision}:image-title`}
                placeholder={labels.addImageTitle}
                onBlur={(event) => {
                  if (event.currentTarget.value === image!.title) return;
                  store.applyPatch(
                    createConstructPatch(
                      selectedBlock!,
                      { kind: "image-title" },
                      event.currentTarget.value,
                    ),
                  );
                }}
              />
            </label>
          </InspectorSection>

          <InspectorSection
            expanded={expanded["image-actions"]}
            id="image-actions"
            onToggle={toggleSection}
            title={labels.imageActions}
          >
            <label className="secondary-action image-replace-action">
              <ArrowPathIcon aria-hidden="true" />
              {labels.replaceImage}
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                aria-label={labels.replaceImage}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  void (async () => {
                    await onEmbedImage(file, (destination) =>
                      createConstructPatch(
                        selectedBlock!,
                        { kind: "image-target" },
                        destination,
                      ),
                    );
                  })();
                }}
              />
            </label>
          </InspectorSection>

          <InspectorSection
            expanded={expanded["image-technical"]}
            id="image-technical"
            onToggle={toggleSection}
            title={labels.technicalDetails}
          >
            <div className="image-source-note">
              <span>{labels.imageSource}</span>
              <code title={image!.target}>{image!.target}</code>
            </div>
          </InspectorSection>
        </div>
      )}
    </aside>
  );
}
