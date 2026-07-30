import { useState, useEffect, useRef, useCallback } from 'react';
import { useTelemetryStore } from '../stores/telemetry.store';
import { useUIStore } from '../stores/ui.store';
import { updateThreshold } from '../services/api.service';
import { webSocketService } from '../services/websocket.service';
import { clampThreshold } from '../utils/validators';
import type { WSMessage } from '../types';

export default function ALMControlPage() {
  const totalLoad = useTelemetryStore((s) => s.totalLoad);
  const addNotification = useUIStore((s) => s.addNotification);

  const [threshold, setThreshold] = useState<number>(50000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previousThresholdRef = useRef<number>(50000);

  // Track ALM event notifications displayed on this page
  const [almNotifications, setAlmNotifications] = useState<
    Array<{ id: string; nodeId: string; reason: string; timestamp: number }>
  >([]);

  // Subscribe to alm_event WebSocket messages
  useEffect(() => {
    const handleMessage = (message: WSMessage) => {
      if (message.type === 'alm_event') {
        const { nodeId, reason, timestamp } = message.event;
        const notifId = `alm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        // Add to local ALM notifications
        setAlmNotifications((prev) => [
          ...prev,
          { id: notifId, nodeId, reason, timestamp },
        ]);

        // Also add to the global notification store
        addNotification({
          type: 'warning',
          title: 'ALM Shedding Event',
          message: `Node ${nodeId} shed: ${reason}`,
          autoDismiss: true,
          autoDismissMs: 10000,
        });

        // Auto-remove from local display after 10 seconds
        setTimeout(() => {
          setAlmNotifications((prev) => prev.filter((n) => n.id !== notifId));
        }, 10000);
      }
    };

    webSocketService.onMessage(handleMessage);

    // Cleanup: WebSocketService doesn't expose removeHandler, so we rely on component lifecycle
    // In a real app, we'd add an unsubscribe method. For now the handler stays registered.
  }, [addNotification]);

  // Handle slider change (live drag update)
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = clampThreshold(Number(e.target.value));
    setThreshold(value);
  };

  // Handle slider release (commit change to API)
  const handleSliderRelease = useCallback(async () => {
    const currentValue = threshold;
    const previousValue = previousThresholdRef.current;

    // Only submit if value actually changed
    if (currentValue === previousValue) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateThreshold(currentValue);
      // Success: update the previous value reference
      previousThresholdRef.current = currentValue;
    } catch {
      // Revert slider to previous position
      setThreshold(previousValue);

      // Show error notification
      addNotification({
        type: 'error',
        title: 'Threshold Update Failed',
        message: 'Could not update the ALM threshold. Please try again.',
        autoDismiss: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [threshold, addNotification]);

  // Dismiss an ALM notification manually
  const dismissAlmNotification = (id: string) => {
    setAlmNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ALM Threshold Control</h1>

      {/* Threshold and Load Display */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex-1 text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-600">Current Threshold</p>
            <p className="text-2xl font-bold text-blue-900">
              {threshold.toLocaleString()} W
            </p>
          </div>
          <div className="flex-1 text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-medium text-green-600">Total Transformer Load</p>
            <p className="text-2xl font-bold text-green-900">
              {totalLoad.toLocaleString(undefined, { maximumFractionDigits: 1 })} W
            </p>
          </div>
        </div>

        {/* Threshold Slider */}
        <div className="space-y-3">
          <label
            htmlFor="threshold-slider"
            className="block text-sm font-medium text-gray-700"
          >
            Adjust Threshold (1 W – 100,000 W)
          </label>
          <input
            id="threshold-slider"
            type="range"
            min={1}
            max={100000}
            step={1}
            value={threshold}
            onChange={handleSliderChange}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            disabled={isSubmitting}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-valuemin={1}
            aria-valuemax={100000}
            aria-valuenow={threshold}
            aria-label="ALM Load Threshold in watts"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>1 W</span>
            <span>100,000 W</span>
          </div>
        </div>

        {isSubmitting && (
          <p className="mt-2 text-sm text-blue-600">Updating threshold...</p>
        )}
      </div>

      {/* ALM Event Notifications */}
      {almNotifications.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">ALM Events</h2>
          {almNotifications.map((notif) => (
            <div
              key={notif.id}
              className="flex items-start justify-between bg-yellow-50 border border-yellow-200 rounded-lg p-4"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Node <span className="font-bold">{notif.nodeId}</span> shed
                  </p>
                  <p className="text-sm text-yellow-700">Reason: {notif.reason}</p>
                </div>
              </div>
              <button
                onClick={() => dismissAlmNotification(notif.id)}
                className="text-yellow-600 hover:text-yellow-800 p-1"
                aria-label={`Dismiss notification for node ${notif.nodeId}`}
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
