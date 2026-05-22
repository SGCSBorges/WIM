import React from "react";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = "Retry",
  className = "",
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`border ui-alert-error rounded-lg p-4 flex items-start gap-3 ${className}`}
    >
      <span aria-hidden="true" className="ui-text-error text-lg leading-none">
        ❌
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm ui-text-error break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md shrink-0"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`ui-card rounded-lg p-8 text-center flex flex-col items-center gap-3 ${className}`}
    >
      {icon && (
        <div className="text-4xl leading-none" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="font-semibold ui-title text-lg">{title}</h3>
      {description && (
        <p className="text-sm ui-text-muted max-w-md">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
