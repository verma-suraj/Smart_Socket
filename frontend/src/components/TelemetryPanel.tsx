import { useState, useEffect } from 'react';
import type { TelemetryPayload } from '../types';
import { formatTelemetryValue, formatTimestamp } from '../utils/formatters';
import { classifyTemperature } from '../utils/validators';
import { useTelemetryStore } from '../stores/telemetry.store';

interface TelemetryPanelProps {
  nodeId: string;
  telemetry: TelemetryPayload;
}

const STALENESS_THRESHOLD_MS = 30000;

/**
 * TelemetryPanel displays real-time telemetry readings for a node with:
 * - Formatted values (correct precision and units)
 * - Temperature warning/critical visual states
 * - Last-update timestamp
 * - Staleness indicator when data is older than 30 seconds
 */
export function TelemetryPanel({ nodeId, telemetry }: TelemetryPanelProps) {
  const lastUpdateByNode = useTelemetryStore((state) => state.lastUpdateByNode);
  const [elapsedMs, setElapsedMs] = useState(0);

  const lastUpdate = lastUpdateByNode.get(nodeId) ?? telemetry.timestamp;

  // Check staleness via interval
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - lastUpdate);
    }, 1000);

    // Initial calculation
    setElapsedMs(Date.now() - lastUpdate);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  const isStale = elapsedMs > STALENESS_THRESHOLD_MS;
  const tempClassification = classifyTemperature(telemetry.temperature);

  return (
    <div className="space-y-6">
      {/* Telemetry Readings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <TelemetryItem
          label="Voltage"
          value={formatTelemetryValue('voltage', telemetry.voltage)}
          unit="V"
        />
        <TelemetryItem
          label="Current"
          value={formatTelemetryValue('current', telemetry.current)}
          unit="A"
        />
        <TelemetryItem
          label="Power"
          value={formatTelemetryValue('power', telemetry.power)}
          unit="W"
        />
        <TelemetryItem
          label="Frequency"
          value={formatTelemetryValue('frequency', telemetry.frequency)}
          unit="Hz"
        />
        <TelemetryItem
          label="Power Factor"
          value={formatTelemetryValue('powerFactor', telemetry.powerFactor)}
          unit=""
        />
        <TemperatureItem
          value={formatTelemetryValue('temperature', telemetry.temperature)}
          classification={tempClassification}
        />
      </div>

      {/* Last Update & Staleness */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-500 border-t pt-4">
        <span>Last update: {formatTimestamp(telemetry.timestamp)}</span>
        {isStale && (
          <span className="text-amber-600 font-medium mt-1 sm:mt-0" role="alert">
            Data may be stale ({Math.floor(elapsedMs / 1000)}s ago)
          </span>
        )}
      </div>
    </div>
  );
}

/** Individual telemetry reading card */
function TelemetryItem({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">
        {value} <span className="text-base font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  );
}

/** Temperature reading with warning/critical visual states */
function TemperatureItem({
  value,
  classification,
}: {
  value: string;
  classification: 'normal' | 'warning' | 'critical';
}) {
  const colorClasses = {
    normal: 'text-gray-900',
    warning: 'text-amber-600',
    critical: 'text-red-600',
  };

  const borderClasses = {
    normal: 'border-gray-200',
    warning: 'border-amber-300',
    critical: 'border-red-300',
  };

  const bgClasses = {
    normal: 'bg-white',
    warning: 'bg-amber-50',
    critical: 'bg-red-50',
  };

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${borderClasses[classification]} ${bgClasses[classification]}`}
    >
      <p className="text-sm text-gray-500 mb-1">Temperature</p>
      <p className={`text-2xl font-semibold ${colorClasses[classification]}`}>
        {value} <span className="text-base font-normal text-gray-500">°C</span>
      </p>
      {classification === 'critical' && (
        <p className="text-sm font-medium text-red-700 mt-2" role="alert">
          Temperature Override Active
        </p>
      )}
    </div>
  );
}
