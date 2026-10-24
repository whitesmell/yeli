import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

export function CapabilityNotice({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "warning";
}) {
  const Icon =
    tone === "warning" ? ExclamationTriangleIcon : InformationCircleIcon;
  return (
    <div className={`capability-notice is-${tone}`} role="status">
      <Icon aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
