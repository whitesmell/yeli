import {
  ChevronDownIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import "./about-dialog.css";

import type { Labels } from "../i18n/en.ts";
import type { Locale } from "../i18n/locale.ts";
import { DEFAULT_FORMAT_BUDGETS } from "../document/schema.ts";
import { formatArtifactSize } from "./file-size.ts";
import { AboutBrandDetail } from "./about-brand-detail.tsx";
import { useBrandDetail } from "./use-brand-detail.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";
import type { SaveDisclosure } from "./use-file-lifecycle.ts";
import { YeliLogo } from "./yeli-logo.tsx";

export function AboutDialog({
  canDirectSave,
  locale,
  labels,
  onClose,
  recoveryAvailable,
  saveDisclosure,
  saveDisclosureLoading,
}: {
  canDirectSave: boolean;
  locale: Locale;
  labels: Labels;
  onClose: () => void;
  recoveryAvailable: boolean;
  saveDisclosure: SaveDisclosure | null;
  saveDisclosureLoading: boolean;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose, ".about-close");
  const brandDetail = useBrandDetail();
  const secureContext =
    typeof window !== "undefined" && typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : null;
  const currentYeliAvailable = saveDisclosure?.currentBytes != null;
  const primaryBytes =
    saveDisclosure?.currentBytes ?? saveDisclosure?.projectedBytes ?? null;
  const primaryFileFits =
    saveDisclosure?.currentFileFits ??
    saveDisclosure?.projectedFileFits ??
    null;
  return (
    <div
      className="overlay-backdrop recovery-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={labels.aboutYeli}
        onKeyDown={onKeyDown}
      >
        <header>
          <div>
            <h2 className="about-brand" aria-label="页里 Yeli">
              <button
                type="button"
                className="about-brand-control"
                aria-label="页里 Yeli"
                {...brandDetail.brandProps}
              >
                <YeliLogo />
              </button>
              {locale === "zh-CN" ? <span>页里</span> : null}
            </h2>
            <p className="about-version">
              <button
                type="button"
                className="about-version-control"
                {...brandDetail.versionProps}
              >
                {labels.version} {__YELI_VERSION__}
              </button>
              <span className="about-release-stage">
                {labels.aboutReleaseStage}
              </span>
            </p>
          </div>
          <button
            className="icon-button about-close"
            type="button"
            aria-label={labels.close}
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>
        {brandDetail.visible ? <AboutBrandDetail locale={locale} /> : null}
        <div className="about-intro">
          <p className="about-lede">{labels.aboutTagline}</p>
          <p className="about-description">{labels.aboutDescription}</p>
          <ul className="about-features">
            <li>{labels.aboutOffline}</li>
            <li>{labels.aboutOpenFormat}</li>
            <li>{labels.aboutPortable}</li>
          </ul>
        </div>
        <section
          className="about-file-capabilities"
          aria-labelledby="about-file-capabilities-title"
        >
          <div className="about-section-heading">
            <h3 id="about-file-capabilities-title">
              {saveDisclosure && !currentYeliAvailable
                ? labels.aboutProjectedFileCapabilities
                : labels.aboutFileCapabilities}
            </h3>
            <span className="about-file-format">.yeli.html</span>
          </div>
          <div className="about-file-size" role="status">
            {saveDisclosure && primaryBytes !== null ? (
              <>
                <div>
                  <span className="about-file-size-label">
                    {currentYeliAvailable
                      ? labels.disclosureBytes
                      : labels.aboutProjectedSize}
                  </span>
                  <strong className="about-file-size-value">
                    {formatArtifactSize(primaryBytes)}
                  </strong>
                  <span className="about-file-size-bytes">
                    {primaryBytes.toLocaleString()} {labels.bytes}
                  </span>
                </div>
                {primaryFileFits === false ? (
                  <p className="about-file-too-large" role="alert">
                    {labels.disclosureLocalTooLarge}
                  </p>
                ) : null}
                {!currentYeliAvailable ||
                saveDisclosure.projectedBytes === null ? null : (
                  <p className="about-file-projected-size">
                    {labels.aboutProjectedSize}{" "}
                    <strong>
                      {formatArtifactSize(saveDisclosure.projectedBytes)}
                    </strong>{" "}
                    (
                    <span className="about-file-projected-bytes">
                      {saveDisclosure.projectedBytes.toLocaleString()}{" "}
                      {labels.bytes}
                    </span>
                    )
                  </p>
                )}
              </>
            ) : (
              <span className="about-file-size-pending">
                {saveDisclosureLoading
                  ? labels.disclosurePreparing
                  : labels.aboutFileSizeUnavailable}
              </span>
            )}
            <p>{labels.aboutArtifactIncludes}</p>
          </div>
          <dl className="about-file-facts">
            <div>
              <dt>{labels.aboutSaveMethod}</dt>
              <dd>
                <strong>
                  {canDirectSave
                    ? labels.aboutSaveDirect
                    : labels.aboutSaveDownload}
                </strong>
                <p>
                  {canDirectSave
                    ? labels.directSaveAvailable
                    : labels.downloadFallbackNotice}
                </p>
              </dd>
            </div>
            <div>
              <dt>{labels.aboutRecovery}</dt>
              <dd>
                <strong className="about-recovery-status">
                  {recoveryAvailable
                    ? labels.aboutRecoveryAvailable
                    : labels.aboutRecoveryUnavailable}
                </strong>
                <p>
                  {recoveryAvailable
                    ? labels.aboutRecoveryDescription
                    : labels.aboutRecoveryUnavailableDescription}
                </p>
              </dd>
            </div>
          </dl>
        </section>
        <div className="about-share-note">
          <InformationCircleIcon aria-hidden="true" />
          <p>
            <strong>{labels.aboutSharing}</strong>
            {labels.aboutTrust}
          </p>
        </div>
        <details className="about-details">
          <summary>
            {labels.aboutDetails}
            <ChevronDownIcon aria-hidden="true" />
          </summary>
          <dl>
            <div>
              <dt>{labels.aboutEnvironment}</dt>
              <dd>
                {secureContext === null
                  ? labels.aboutEnvironmentUnavailable
                  : secureContext
                    ? labels.disclosureSecure
                    : labels.disclosureInsecure}
              </dd>
            </div>
            {primaryFileFits === null ? null : (
              <div>
                <dt>{labels.disclosureBytes}</dt>
                <dd className="about-file-fit">
                  {primaryFileFits
                    ? labels.disclosureLocalFits
                    : labels.disclosureLocalTooLarge}
                </dd>
              </div>
            )}
            <div>
              <dt>{labels.aboutFileLimit}</dt>
              <dd>
                {formatArtifactSize(DEFAULT_FORMAT_BUDGETS.maxFileBytes)} (
                {DEFAULT_FORMAT_BUDGETS.maxFileBytes.toLocaleString()}{" "}
                {labels.bytes})
              </dd>
            </div>
            <div>
              <dt>{labels.aboutVerificationTitle}</dt>
              <dd>{labels.aboutVerification}</dd>
            </div>
          </dl>
          <p className="about-attachment-note">
            {labels.disclosureAttachmentExperimental}
          </p>
        </details>
      </section>
    </div>
  );
}
