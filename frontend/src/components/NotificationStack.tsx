import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/ui.store';
import type { Notification } from '../types';

/**
 * Severity icon components using inline SVG for each notification type.
 */
function SuccessIcon() {
  return (
    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function getSeverityIcon(type: Notification['type']) {
  switch (type) {
    case 'success':
      return <SuccessIcon />;
    case 'warning':
      return <WarningIcon />;
    case 'error':
      return <ErrorIcon />;
    case 'info':
      return <InfoIcon />;
  }
}

function getSeverityClasses(type: Notification['type']): string {
  switch (type) {
    case 'success':
      return 'bg-green-50 border-green-400 text-green-800';
    case 'warning':
      return 'bg-amber-50 border-amber-400 text-amber-800';
    case 'error':
      return 'bg-red-50 border-red-400 text-red-800';
    case 'info':
      return 'bg-blue-50 border-blue-400 text-blue-800';
  }
}

/**
 * NotificationStack renders up to 5 notifications from the UI store.
 * Positioned fixed at the top-right corner, stacked vertically.
 * Supports auto-dismiss timers and manual dismiss via a button.
 */
export function NotificationStack() {
  const notifications = useUIStore((state) => state.notifications);
  const dismissNotification = useUIStore((state) => state.dismissNotification);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Set up auto-dismiss timers for notifications with autoDismiss enabled
  useEffect(() => {
    const currentTimers = timersRef.current;

    for (const notification of notifications) {
      if (notification.autoDismiss && notification.autoDismissMs && !currentTimers.has(notification.id)) {
        const timer = setTimeout(() => {
          dismissNotification(notification.id);
          currentTimers.delete(notification.id);
        }, notification.autoDismissMs);
        currentTimers.set(notification.id, timer);
      }
    }

    // Clean up timers for notifications that have been removed
    for (const [id, timer] of currentTimers.entries()) {
      if (!notifications.find((n) => n.id === id)) {
        clearTimeout(timer);
        currentTimers.delete(id);
      }
    }

    // Cleanup all timers on unmount
    return () => {
      for (const timer of currentTimers.values()) {
        clearTimeout(timer);
      }
      currentTimers.clear();
    };
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-80 max-w-[calc(100vw-2rem)]">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          role="alert"
          className={`border-l-4 rounded-md p-4 shadow-lg transition-all duration-300 ease-in-out ${getSeverityClasses(notification.type)}`}
        >
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5">{getSeverityIcon(notification.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{notification.title}</p>
              {notification.message && (
                <p className="text-sm mt-1 opacity-90">{notification.message}</p>
              )}
            </div>
            <button
              onClick={() => dismissNotification(notification.id)}
              className="shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
              aria-label={`Dismiss notification: ${notification.title}`}
              type="button"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
