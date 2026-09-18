import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import { createUser, updateUser } from '../services/api.service';
import { computeProfileDiff } from '../utils/filters';
import { RfidScanButton } from '../components/RfidScanButton';
import type { UserProfileInput } from '../types';

/**
 * Zod schema for user profile form validation.
 * Validates: Requirements 8.1, 8.4
 */
const userProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  evType: z.enum(['2-wheeler', '4-wheeler'], {
    required_error: 'EV type is required',
  }),
  brand: z
    .string()
    .min(1, 'Brand is required')
    .max(50, 'Brand must be at most 50 characters'),
  batteryCapacity: z
    .number({ required_error: 'Battery capacity is required', invalid_type_error: 'Must be a number' })
    .min(0.1, 'Battery capacity must be at least 0.1 kWh')
    .max(200, 'Battery capacity must be at most 200 kWh'),
  batteryType: z
    .string()
    .min(1, 'Battery type is required')
    .max(50, 'Battery type must be at most 50 characters'),
  chargerType: z
    .string()
    .min(1, 'Charger type is required')
    .max(50, 'Charger type must be at most 50 characters'),
  chargerPowerRating: z
    .number({ required_error: 'Charger power rating is required', invalid_type_error: 'Must be a number' })
    .min(0.1, 'Charger power rating must be at least 0.1 kW')
    .max(50, 'Charger power rating must be at most 50 kW'),
  rfidUids: z
    .array(z.object({ value: z.string().min(1, 'RFID UID cannot be empty') }))
    .max(5, 'At most 5 RFID UIDs allowed'),
});

type UserProfileFormValues = z.infer<typeof userProfileSchema>;

/**
 * Convert form values to UserProfileInput for API submission.
 */
function toProfileInput(values: UserProfileFormValues): UserProfileInput {
  return {
    name: values.name,
    evType: values.evType,
    brand: values.brand,
    batteryCapacity: values.batteryCapacity,
    batteryType: values.batteryType,
    chargerType: values.chargerType,
    chargerPowerRating: values.chargerPowerRating,
    rfidUids: values.rfidUids.map((item) => item.value),
  };
}

export default function UserProfilePage() {
  const user = useAuthStore((s) => s.user);
  const addNotification = useUIStore((s) => s.addNotification);

  const [isEditMode, setIsEditMode] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Store the original profile for diff computation on update
  const originalProfileRef = useRef<UserProfileInput | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isValid },
  } = useForm<UserProfileFormValues>({
    resolver: zodResolver(userProfileSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      evType: '4-wheeler',
      brand: '',
      batteryCapacity: undefined as unknown as number,
      batteryType: '',
      chargerType: '',
      chargerPowerRating: undefined as unknown as number,
      rfidUids: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rfidUids',
  });

  /**
   * Attempt to load existing profile from backend.
   * If profile exists, switch to edit mode and populate form.
   */
  useEffect(() => {
    async function loadProfile() {
      if (!user?.uid) return;
      try {
        const response = await fetch(`/api/users/${user.uid}`, {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().token}`,
          },
        });
        if (response.ok) {
          const profile = await response.json();
          setIsEditMode(true);
          const formValues: UserProfileFormValues = {
            name: profile.name,
            evType: profile.evType,
            brand: profile.brand,
            batteryCapacity: profile.batteryCapacity,
            batteryType: profile.batteryType,
            chargerType: profile.chargerType,
            chargerPowerRating: profile.chargerPowerRating,
            rfidUids: (profile.rfidUids || []).map((uid: string) => ({ value: uid })),
          };
          reset(formValues);
          originalProfileRef.current = toProfileInput(formValues);
        }
      } catch {
        // No existing profile — remain in create mode
      }
    }
    loadProfile();
  }, [user, reset]);

  /**
   * Handle form submission: POST for create, PUT with diff-only for update.
   * Displays API errors preserving form data.
   */
  const onSubmit = async (values: UserProfileFormValues) => {
    setApiError(null);
    setSubmitting(true);

    try {
      const profileInput = toProfileInput(values);

      if (isEditMode && user?.uid && originalProfileRef.current) {
        // Compute diff — only send modified fields
        const diff = computeProfileDiff(originalProfileRef.current, profileInput);
        if (Object.keys(diff).length === 0) {
          addNotification({
            type: 'info',
            title: 'No Changes',
            message: 'No fields were modified.',
            autoDismiss: true,
            autoDismissMs: 5000,
          });
          setSubmitting(false);
          return;
        }
        await updateUser(user.uid, diff);
        // Update original reference after successful save
        originalProfileRef.current = profileInput;
        addNotification({
          type: 'success',
          title: 'Profile Updated',
          message: 'Your profile has been updated successfully.',
          autoDismiss: true,
          autoDismissMs: 5000,
        });
      } else {
        // Create new profile
        await createUser(profileInput);
        setIsEditMode(true);
        originalProfileRef.current = profileInput;
        addNotification({
          type: 'success',
          title: 'Profile Created',
          message: 'Your profile has been created successfully.',
          autoDismiss: true,
          autoDismissMs: 5000,
        });
      }
    } catch (error: unknown) {
      // Display API errors without clearing form data
      let message = 'An unexpected error occurred. Please try again.';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
        message =
          axiosError.response?.data?.error ||
          axiosError.response?.data?.message ||
          message;
      }
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">
        {isEditMode ? 'Edit Profile' : 'Create Profile'}
      </h1>

      {apiError && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md"
          role="alert"
        >
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            maxLength={100}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>

        {/* EV Type */}
        <div>
          <label htmlFor="evType" className="block text-sm font-medium text-gray-700 mb-1">
            EV Type <span className="text-red-500">*</span>
          </label>
          <select
            id="evType"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('evType')}
          >
            <option value="2-wheeler">2-Wheeler</option>
            <option value="4-wheeler">4-Wheeler</option>
          </select>
          {errors.evType && (
            <p className="mt-1 text-sm text-red-600">{errors.evType.message}</p>
          )}
        </div>

        {/* Brand */}
        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-1">
            Brand <span className="text-red-500">*</span>
          </label>
          <input
            id="brand"
            type="text"
            maxLength={50}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('brand')}
          />
          {errors.brand && (
            <p className="mt-1 text-sm text-red-600">{errors.brand.message}</p>
          )}
        </div>

        {/* Battery Capacity */}
        <div>
          <label htmlFor="batteryCapacity" className="block text-sm font-medium text-gray-700 mb-1">
            Battery Capacity (kWh) <span className="text-red-500">*</span>
          </label>
          <input
            id="batteryCapacity"
            type="number"
            step="0.1"
            min="0.1"
            max="200"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('batteryCapacity', { valueAsNumber: true })}
          />
          {errors.batteryCapacity && (
            <p className="mt-1 text-sm text-red-600">{errors.batteryCapacity.message}</p>
          )}
        </div>

        {/* Battery Type */}
        <div>
          <label htmlFor="batteryType" className="block text-sm font-medium text-gray-700 mb-1">
            Battery Type <span className="text-red-500">*</span>
          </label>
          <input
            id="batteryType"
            type="text"
            maxLength={50}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('batteryType')}
          />
          {errors.batteryType && (
            <p className="mt-1 text-sm text-red-600">{errors.batteryType.message}</p>
          )}
        </div>

        {/* Charger Type */}
        <div>
          <label htmlFor="chargerType" className="block text-sm font-medium text-gray-700 mb-1">
            Charger Type <span className="text-red-500">*</span>
          </label>
          <input
            id="chargerType"
            type="text"
            maxLength={50}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('chargerType')}
          />
          {errors.chargerType && (
            <p className="mt-1 text-sm text-red-600">{errors.chargerType.message}</p>
          )}
        </div>

        {/* Charger Power Rating */}
        <div>
          <label htmlFor="chargerPowerRating" className="block text-sm font-medium text-gray-700 mb-1">
            Charger Power Rating (kW) <span className="text-red-500">*</span>
          </label>
          <input
            id="chargerPowerRating"
            type="number"
            step="0.1"
            min="0.1"
            max="50"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('chargerPowerRating', { valueAsNumber: true })}
          />
          {errors.chargerPowerRating && (
            <p className="mt-1 text-sm text-red-600">{errors.chargerPowerRating.message}</p>
          )}
        </div>

        {/* RFID UIDs - Dynamic List with Tap-to-Capture */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            RFID UIDs (max 5)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Tap your RFID card on a reader to auto-capture, or type the UID manually.
          </p>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex gap-2 items-start">
                  <input
                    type="text"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`RFID UID ${index + 1}`}
                    aria-label={`RFID UID ${index + 1}`}
                    {...register(`rfidUids.${index}.value`)}
                  />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                    aria-label={`Remove RFID UID ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
                <RfidScanButton
                  onUidCaptured={(uid: string) => {
                    // Populate the corresponding text input with the captured UID
                    setValue(`rfidUids.${index}.value`, uid, { shouldValidate: true, shouldDirty: true });
                  }}
                  onError={(message: string) => {
                    addNotification({
                      type: 'error',
                      title: 'RFID Scan Error',
                      message,
                      autoDismiss: true,
                      autoDismissMs: 5000,
                    });
                  }}
                />
              </div>
            ))}
            {errors.rfidUids && typeof errors.rfidUids === 'object' && 'message' in errors.rfidUids && (
              <p className="text-sm text-red-600">{errors.rfidUids.message}</p>
            )}
            {Array.isArray(errors.rfidUids) && errors.rfidUids.map((err, i) => (
              err?.value?.message && (
                <p key={i} className="text-sm text-red-600">
                  UID {i + 1}: {err.value.message}
                </p>
              )
            ))}
          </div>
          {fields.length < 5 && (
            <div className="mt-3 flex flex-col gap-2 p-3 border border-dashed border-gray-300 rounded-lg">
              <button
                type="button"
                onClick={() => append({ value: '' })}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
              >
                + Add RFID UID
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>or scan to add:</span>
                <RfidScanButton
                  onUidCaptured={(uid: string) => {
                    // Add a new RFID UID entry with the captured value
                    append({ value: uid });
                  }}
                  onError={(message: string) => {
                    addNotification({
                      type: 'error',
                      title: 'RFID Scan Error',
                      message,
                      autoDismiss: true,
                      autoDismissMs: 5000,
                    });
                  }}
                  disabled={fields.length >= 5}
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? 'Saving...'
              : isEditMode
                ? 'Update Profile'
                : 'Create Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
