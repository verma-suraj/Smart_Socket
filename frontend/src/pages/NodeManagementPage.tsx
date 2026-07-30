import { useState, useEffect, useCallback } from 'react';
import { useNodeStore } from '../stores/node.store';
import { useUIStore } from '../stores/ui.store';
import { registerNode, deregisterNode } from '../services/api.service';
import { validateNodeRegistration } from '../utils/validators';
import { NodeCard } from '../components/NodeCard';
import type { RegisterNodeParams, NodeRecord } from '../types';

interface FormErrors {
  nodeId?: string;
  displayName?: string;
  locationLabel?: string;
}

interface DeregisterDialogState {
  open: boolean;
  node: NodeRecord | null;
}

export default function NodeManagementPage() {
  const { nodes, nodeStatuses, fetchNodes, addNode, removeNode, loading } = useNodeStore();
  const { addNotification } = useUIStore();

  // Registration form state
  const [formData, setFormData] = useState<RegisterNodeParams>({
    nodeId: '',
    displayName: '',
    locationLabel: '',
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Deregistration dialog state
  const [deregisterDialog, setDeregisterDialog] = useState<DeregisterDialogState>({
    open: false,
    node: null,
  });
  const [deregistering, setDeregistering] = useState(false);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Inline validation for a single field
  const validateField = useCallback((field: keyof RegisterNodeParams, value: string): string | undefined => {
    if (field === 'nodeId') {
      if (!value) return 'Node ID is required';
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(value)) {
        return 'Node ID must be 1-64 characters, alphanumeric and hyphens only';
      }
    }
    if (field === 'displayName') {
      if (!value || value.length === 0) return 'Display name is required';
      if (value.length > 128) return 'Display name must be at most 128 characters';
    }
    if (field === 'locationLabel') {
      if (!value || value.length === 0) return 'Location label is required';
      if (value.length > 128) return 'Location label must be at most 128 characters';
    }
    return undefined;
  }, []);

  const handleInputChange = (field: keyof RegisterNodeParams, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error on change, validate inline
    const error = validateField(field, value);
    setFormErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const validation = validateNodeRegistration(formData);
    if (!validation.valid) {
      const errors: FormErrors = {};
      const nodeIdError = validateField('nodeId', formData.nodeId);
      const displayNameError = validateField('displayName', formData.displayName);
      const locationLabelError = validateField('locationLabel', formData.locationLabel);
      if (nodeIdError) errors.nodeId = nodeIdError;
      if (displayNameError) errors.displayName = displayNameError;
      if (locationLabelError) errors.locationLabel = locationLabelError;
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const newNode = await registerNode(formData);
      addNode(newNode);
      addNotification({
        type: 'success',
        title: 'Node Registered',
        message: `Node "${formData.displayName}" (${formData.nodeId}) registered successfully.`,
        autoDismiss: true,
        autoDismissMs: 5000,
      });
      // Reset form
      setFormData({ nodeId: '', displayName: '', locationLabel: '' });
      setFormErrors({});
    } catch (err: unknown) {
      // Handle duplicate node ID error (409 Conflict typically)
      let message = `Failed to register node "${formData.nodeId}".`;
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
        if (axiosErr.response?.status === 409 || axiosErr.response?.data?.error?.toLowerCase().includes('already')) {
          message = `Node ID "${formData.nodeId}" is already registered.`;
        } else if (axiosErr.response?.data?.message) {
          message = axiosErr.response.data.message;
        } else if (axiosErr.response?.data?.error) {
          message = axiosErr.response.data.error;
        }
      }
      addNotification({
        type: 'error',
        title: 'Registration Failed',
        message,
        autoDismiss: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Deregistration handlers
  const handleDeregisterClick = (node: NodeRecord) => {
    setDeregisterDialog({ open: true, node });
  };

  const handleDeregisterConfirm = async () => {
    if (!deregisterDialog.node) return;
    const { nodeId, displayName } = deregisterDialog.node;

    setDeregistering(true);
    try {
      await deregisterNode(nodeId);
      removeNode(nodeId);
      addNotification({
        type: 'success',
        title: 'Node Deregistered',
        message: `Node "${displayName}" (${nodeId}) has been removed.`,
        autoDismiss: true,
        autoDismissMs: 5000,
      });
      setDeregisterDialog({ open: false, node: null });
    } catch (err: unknown) {
      let message = `Failed to deregister node "${displayName}" (${nodeId}).`;
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
        if (axiosErr.response?.data?.message) {
          message = axiosErr.response.data.message;
        } else if (axiosErr.response?.data?.error) {
          message = axiosErr.response.data.error;
        }
      }
      addNotification({
        type: 'error',
        title: 'Deregistration Failed',
        message,
        autoDismiss: false,
      });
      setDeregisterDialog({ open: false, node: null });
    } finally {
      setDeregistering(false);
    }
  };

  const handleDeregisterCancel = () => {
    setDeregisterDialog({ open: false, node: null });
  };

  const nodeList = Array.from(nodes.values());

  const isFormValid = (): boolean => {
    const validation = validateNodeRegistration(formData);
    return validation.valid;
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Node Management</h1>

      {/* Registration Form */}
      <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Register New Node</h2>
        <form onSubmit={handleRegisterSubmit} noValidate className="space-y-4">
          {/* Node ID */}
          <div>
            <label htmlFor="nodeId" className="block text-sm font-medium text-gray-700 mb-1">
              Node ID
            </label>
            <input
              id="nodeId"
              type="text"
              value={formData.nodeId}
              onChange={(e) => handleInputChange('nodeId', e.target.value)}
              placeholder="e.g. node-ev-01"
              maxLength={64}
              className={`w-full px-3 py-2 border rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formErrors.nodeId ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={!!formErrors.nodeId}
              aria-describedby={formErrors.nodeId ? 'nodeId-error' : undefined}
            />
            {formErrors.nodeId && (
              <p id="nodeId-error" className="text-red-600 text-xs mt-1" role="alert">
                {formErrors.nodeId}
              </p>
            )}
            <p className="text-gray-500 text-xs mt-1">1–64 characters, alphanumeric and hyphens only</p>
          </div>

          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={formData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              placeholder="e.g. EV Charger Bay 1"
              maxLength={128}
              className={`w-full px-3 py-2 border rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formErrors.displayName ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={!!formErrors.displayName}
              aria-describedby={formErrors.displayName ? 'displayName-error' : undefined}
            />
            {formErrors.displayName && (
              <p id="displayName-error" className="text-red-600 text-xs mt-1" role="alert">
                {formErrors.displayName}
              </p>
            )}
          </div>

          {/* Location Label */}
          <div>
            <label htmlFor="locationLabel" className="block text-sm font-medium text-gray-700 mb-1">
              Location Label
            </label>
            <input
              id="locationLabel"
              type="text"
              value={formData.locationLabel}
              onChange={(e) => handleInputChange('locationLabel', e.target.value)}
              placeholder="e.g. Parking Level B2, Slot 5"
              maxLength={128}
              className={`w-full px-3 py-2 border rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formErrors.locationLabel ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={!!formErrors.locationLabel}
              aria-describedby={formErrors.locationLabel ? 'locationLabel-error' : undefined}
            />
            {formErrors.locationLabel && (
              <p id="locationLabel-error" className="text-red-600 text-xs mt-1" role="alert">
                {formErrors.locationLabel}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !isFormValid()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Registering...' : 'Register Node'}
          </button>
        </form>
      </section>

      {/* Registered Nodes List */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Registered Nodes</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : nodeList.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">
            No nodes are currently registered.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodeList.map((node) => (
              <div key={node.nodeId} className="relative">
                <NodeCard node={node} realtimeStatus={nodeStatuses.get(node.nodeId)} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeregisterClick(node);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                  aria-label={`Deregister node ${node.displayName}`}
                  title="Deregister node"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Deregistration Confirmation Dialog */}
      {deregisterDialog.open && deregisterDialog.node && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deregister-dialog-title"
        >
          <div className="bg-white rounded-lg shadow-xl p-6 mx-4 max-w-md w-full">
            <h3 id="deregister-dialog-title" className="text-lg font-semibold text-gray-900 mb-2">
              Confirm Deregistration
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to deregister node{' '}
              <span className="font-medium text-gray-900">
                &quot;{deregisterDialog.node.displayName}&quot;
              </span>{' '}
              (ID: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{deregisterDialog.node.nodeId}</code>)?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleDeregisterCancel}
                disabled={deregistering}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeregisterConfirm}
                disabled={deregistering}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
              >
                {deregistering ? 'Removing...' : 'Deregister'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
