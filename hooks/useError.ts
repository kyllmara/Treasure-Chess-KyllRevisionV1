/**
 * Error Handling Hook
 *
 * Provides convenient error handling utilities for components.
 * Integrates with the centralized error tracking system.
 */

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { AppError, parseError, isRetryableError } from '@/lib/errors';
import { ErrorTracker } from '@/lib/errorTracking';

export interface HandleAsyncOptions {
  showAlert?: boolean;
  rethrow?: boolean;
  onError?: (error: AppError) => void;
  onSuccess?: () => void;
  context?: Record<string, unknown>;
  operationName?: string;
}

export interface UseErrorReturn {
  error: AppError | null;
  isLoading: boolean;
  isRetryable: boolean;
  setError: (error: unknown) => void;
  clearError: () => void;
  handleAsync: <T>(operation: () => Promise<T>, options?: HandleAsyncOptions) => Promise<T | null>;
  showErrorAlert: (error?: AppError | null) => void;
  retry: () => Promise<void>;
}

export function useError(): UseErrorReturn {
  const [error, setErrorState] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastOperationRef = useRef<(() => Promise<unknown>) | null>(null);
  const lastOptionsRef = useRef<HandleAsyncOptions | null>(null);

  const setError = useCallback((err: unknown) => {
    const appError = parseError(err);
    setErrorState(appError);
    ErrorTracker.captureError(appError);
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const showErrorAlert = useCallback((err?: AppError | null) => {
    const errorToShow = err || error;
    if (!errorToShow) return;

    Alert.alert('Error', errorToShow.userMessage, [
      { text: 'OK', onPress: clearError },
      ...(errorToShow.retryable && lastOperationRef.current
        ? [{ text: 'Retry', onPress: async () => {
            clearError();
            if (lastOperationRef.current) {
              await handleAsync(lastOperationRef.current, lastOptionsRef.current || {});
            }
          }}]
        : []),
    ]);
  }, [error, clearError]);

  const handleAsync = useCallback(async <T>(
    operation: () => Promise<T>,
    options: HandleAsyncOptions = {}
  ): Promise<T | null> => {
    const { showAlert = false, rethrow = false, onError, onSuccess, context, operationName } = options;

    lastOperationRef.current = operation as () => Promise<unknown>;
    lastOptionsRef.current = options;

    setIsLoading(true);
    clearError();

    if (operationName) {
      ErrorTracker.addBreadcrumb('operation', `Starting: ${operationName}`);
    }

    try {
      const result = await operation();
      if (operationName) {
        ErrorTracker.addBreadcrumb('operation', `Completed: ${operationName}`);
      }
      onSuccess?.();
      setIsLoading(false);
      return result;
    } catch (err) {
      const appError = parseError(err);
      setErrorState(appError);

      ErrorTracker.captureError(appError, {
        tags: operationName ? { operation: operationName } : undefined,
        extras: context,
      });

      onError?.(appError);
      if (showAlert) showErrorAlert(appError);
      setIsLoading(false);
      if (rethrow) throw appError;
      return null;
    }
  }, [clearError, showErrorAlert]);

  const retry = useCallback(async () => {
    if (!lastOperationRef.current) return;
    clearError();
    await handleAsync(lastOperationRef.current, lastOptionsRef.current || {});
  }, [clearError, handleAsync]);

  return {
    error,
    isLoading,
    isRetryable: error ? isRetryableError(error) : false,
    setError,
    clearError,
    handleAsync,
    showErrorAlert,
    retry,
  };
}

export function useApiError() {
  const errorState = useError();

  const handleApiCall = useCallback(async <T>(
    apiCall: () => Promise<T>,
    options?: Omit<HandleAsyncOptions, 'showAlert'>
  ): Promise<T | null> => {
    return errorState.handleAsync(apiCall, { ...options, showAlert: true });
  }, [errorState]);

  return { ...errorState, handleApiCall };
}

export function useFormError() {
  const errorState = useError();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(async <T>(
    submitFn: () => Promise<T>,
    options?: HandleAsyncOptions
  ): Promise<T | null> => {
    setFieldErrors({});
    return errorState.handleAsync(submitFn, options);
  }, [errorState]);

  const setFieldError = useCallback((field: string, message: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const clearAllFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  return { ...errorState, fieldErrors, handleSubmit, setFieldError, clearFieldError, clearAllFieldErrors };
}

export default useError;
