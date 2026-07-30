import { TelemetryPayload, RelayCommand, DeliveryStatus } from '../models/index.js';

export interface IMqttTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(nodeId: string): void;
  unsubscribe(nodeId: string): void;
  publishCommand(nodeId: string, command: RelayCommand): Promise<DeliveryStatus>;
  onTelemetry(handler: (nodeId: string, payload: TelemetryPayload) => void): void;
  onRfidScan(handler: (nodeId: string, uid: string) => void): void;
}
