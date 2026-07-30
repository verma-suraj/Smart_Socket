import { useUIStore } from '../stores/ui.store';

/**
 * ConnectionStatus displays the WebSocket connection state as a small,
 * unobtrusive indicator with a colored dot and status text.
 *
 * States:
 * - connected: green dot + "Connected"
 * - disconnected: red dot + "Disconnected"
 * - reconnecting: yellow pulsing dot + "Reconnecting..."
 */
export function ConnectionStatus() {
  const connectionStatus = useUIStore((state) => state.connectionStatus);

  const config = getStatusConfig(connectionStatus);

  return (
    <div className="flex items-center gap-2 text-sm" aria-live="polite" aria-atomic="true">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
      <span className={config.textClass}>{config.label}</span>
    </div>
  );
}

function getStatusConfig(status: 'connected' | 'disconnected' | 'reconnecting') {
  switch (status) {
    case 'connected':
      return {
        dotClass: 'bg-green-500',
        textClass: 'text-green-700',
        label: 'Connected',
      };
    case 'disconnected':
      return {
        dotClass: 'bg-red-500',
        textClass: 'text-red-700',
        label: 'Disconnected',
      };
    case 'reconnecting':
      return {
        dotClass: 'bg-amber-500 animate-pulse',
        textClass: 'text-amber-700',
        label: 'Reconnecting...',
      };
  }
}
