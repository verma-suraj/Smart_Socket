/**
 * Reusable error display component with retry option.
 *
 * Requirements 11.6: If a data fetch does not complete within 10 seconds,
 * display an error message indicating the request timed out and provide
 * an option to retry the request.
 *
 * Requirements 12.1: Display error notification indicating connection problem.
 */

interface ErrorDisplayProps {
  /** The error message to display */
  message: string;
  /** Optional callback for retry action */
  onRetry?: () => void;
  /** Label for the retry button */
  retryLabel?: string;
}

export function ErrorDisplay({ message, onRetry, retryLabel = 'Retry' }: ErrorDisplayProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3 text-center max-w-md">
        <svg
          className="w-10 h-10 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-red-600">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
