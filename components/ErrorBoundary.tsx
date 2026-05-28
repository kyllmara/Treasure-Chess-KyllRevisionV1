/**
 * Error Boundary Component
 *
 * Catches React errors and displays a user-friendly fallback UI.
 * Reports errors to Sentry and provides recovery options.
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react-native';
import { ErrorTracker } from '@/lib/errorTracking';
import { AppError, ErrorCode, ErrorSeverity, parseError } from '@/lib/errors';
import { Colors, Typography, Spacing, BorderRadius, Gradients } from '@/constants/theme';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
  scope?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
}

// ============================================================================
// Error Boundary
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, eventId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    const appError = parseError(error);
    const eventId = ErrorTracker.captureError(appError, {
      tags: { component: 'ErrorBoundary', scope: this.props.scope || 'global' },
      extras: { componentStack: errorInfo.componentStack },
    });

    this.setState({ eventId });
    this.props.onError?.(error, errorInfo);

    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleReset = (): void => {
    ErrorTracker.addBreadcrumb('ui', 'Error boundary reset', { scope: this.props.scope });
    this.setState({ hasError: false, error: null, errorInfo: null, eventId: null });
  };

  handleGoHome = (): void => {
    ErrorTracker.addBreadcrumb('ui', 'Navigate home from error boundary');
    this.handleReset();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, eventId } = this.state;
    const { children, fallback, showDetails = __DEV__ } = this.props;

    if (!hasError) return children;

    if (fallback) {
      if (typeof fallback === 'function') return fallback(error!, this.handleReset);
      return fallback;
    }

    return (
      <ErrorFallback
        error={error}
        errorInfo={errorInfo}
        eventId={eventId}
        showDetails={showDetails}
        onReset={this.handleReset}
        onGoHome={this.handleGoHome}
      />
    );
  }
}

// ============================================================================
// Fallback UI
// ============================================================================

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
  showDetails: boolean;
  onReset: () => void;
  onGoHome: () => void;
}

function ErrorFallback({ error, errorInfo, eventId, showDetails, onReset, onGoHome }: ErrorFallbackProps): JSX.Element {
  const appError = error ? parseError(error) : null;

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <AlertTriangle size={48} color={Colors.error} strokeWidth={1.5} />
            </View>
          </View>

          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{appError?.userMessage || 'An unexpected error occurred'}</Text>
          {appError?.recoveryHint && <Text style={styles.hint}>{appError.recoveryHint}</Text>}

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.primaryButton} onPress={onReset} activeOpacity={0.8}>
              <RefreshCw size={20} color={Colors.background} strokeWidth={2} />
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onGoHome} activeOpacity={0.8}>
              <Home size={20} color={Colors.textPrimary} strokeWidth={2} />
              <Text style={styles.secondaryButtonText}>Go Home</Text>
            </TouchableOpacity>
          </View>

          {eventId && (
            <View style={styles.eventIdContainer}>
              <Text style={styles.eventIdLabel}>Error ID:</Text>
              <Text style={styles.eventIdValue}>{eventId}</Text>
            </View>
          )}

          {showDetails && __DEV__ && error && (
            <View style={styles.detailsContainer}>
              <View style={styles.detailsHeader}>
                <Bug size={16} color={Colors.textSecondary} />
                <Text style={styles.detailsTitle}>Developer Details</Text>
              </View>
              <View style={styles.detailsContent}>
                <Text style={styles.detailsLabel}>Error Type:</Text>
                <Text style={styles.detailsValue}>{error.name}</Text>

                {appError && (
                  <>
                    <Text style={styles.detailsLabel}>Error Code:</Text>
                    <Text style={styles.detailsValue}>{ErrorCode[appError.code]} ({appError.code})</Text>
                    <Text style={styles.detailsLabel}>Severity:</Text>
                    <Text style={[styles.detailsValue, appError.severity === ErrorSeverity.CRITICAL && styles.severityCritical, appError.severity === ErrorSeverity.HIGH && styles.severityHigh]}>
                      {appError.severity.toUpperCase()}
                    </Text>
                  </>
                )}

                <Text style={styles.detailsLabel}>Message:</Text>
                <Text style={styles.detailsValue} numberOfLines={3}>{error.message}</Text>

                {errorInfo?.componentStack && (
                  <>
                    <Text style={styles.detailsLabel}>Component Stack:</Text>
                    <ScrollView style={styles.stackScroll} horizontal showsHorizontalScrollIndicator>
                      <Text style={styles.stackTrace}>{errorInfo.componentStack.trim().slice(0, 500)}</Text>
                    </ScrollView>
                  </>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  iconContainer: { marginBottom: Spacing.lg },
  iconBackground: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255, 68, 68, 0.2)' },
  title: { ...Typography.h2, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  message: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm, paddingHorizontal: Spacing.md },
  hint: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.xl, paddingHorizontal: Spacing.md },
  buttonContainer: { width: '100%', maxWidth: 300, gap: Spacing.md, marginBottom: Spacing.xl },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { ...Typography.button, color: Colors.background },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border },
  secondaryButtonText: { ...Typography.button, color: Colors.textPrimary },
  eventIdContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.lg },
  eventIdLabel: { ...Typography.caption, color: Colors.textMuted },
  eventIdValue: { ...Typography.mono, fontSize: 11, color: Colors.textSecondary },
  detailsContainer: { width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: 'rgba(255, 255, 255, 0.02)', borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailsTitle: { ...Typography.label, color: Colors.textSecondary },
  detailsContent: { padding: Spacing.md },
  detailsLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.sm, marginBottom: 2 },
  detailsValue: { ...Typography.mono, fontSize: 12, color: Colors.textSecondary },
  severityCritical: { color: Colors.error },
  severityHigh: { color: Colors.warning },
  stackScroll: { maxHeight: 100, marginTop: Spacing.xs },
  stackTrace: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
});

// ============================================================================
// Utilities
// ============================================================================

export function createScopedErrorBoundary(scope: string, options?: Partial<ErrorBoundaryProps>) {
  return function ScopedErrorBoundary({ children }: { children: ReactNode }) {
    return <ErrorBoundary scope={scope} {...options}>{children}</ErrorBoundary>;
  };
}

export function withErrorBoundary<P extends object>(WrappedComponent: React.ComponentType<P>, options?: Partial<ErrorBoundaryProps>) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary scope={displayName} {...options}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );
  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return WithErrorBoundary;
}

export default ErrorBoundary;
