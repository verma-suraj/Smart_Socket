/**
 * Reusable loading spinner component for displaying loading state
 * while data is being fetched from the backend API.
 *
 * Requirement 11.5: Display a loading indicator (spinner or skeleton screen)
 * in the content area where data will appear.
 */

interface LoadingSpinnerProps {
  /** Optional text to display below the spinner */
  message?: string;
  /** Size variant: 'sm' (inline), 'md' (section), 'lg' (full-page) */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-12 h-12 border-4',
} as const;

const containerClasses = {
  sm: 'py-4',
  md: 'py-12',
  lg: 'py-16',
} as const;

export function LoadingSpinner({ message = 'Loading...', size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center justify-center ${containerClasses[size]}`}>
      <div className="flex flex-col items-center gap-3">
        <div
          className={`${sizeClasses[size]} border-blue-500 border-t-transparent rounded-full animate-spin`}
          role="status"
          aria-label={message}
        />
        {message && <p className="text-sm text-gray-500">{message}</p>}
      </div>
    </div>
  );
}
