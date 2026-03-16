/**
 * AdminGymRequestDetailScreen.js — Admin Gym Request Detail & Review
 *
 * Shows full detail for a single gym request and provides admin review
 * actions (Approve, Mark Duplicate, Reject) when the request is pending.
 * Already-reviewed requests show a read-only review summary instead.
 *
 * Data: real-time onSnapshot on gymRequests/{requestId}.
 * Writes: direct Firestore updateDoc for review actions (dev-stage only;
 *         production will use role-gated Cloud Functions or Admin SDK).
 *
 * Does NOT auto-create gym documents. seedProductionGyms.js remains
 * the source of truth for adding gyms to the gyms collection.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Status display configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: 'time-outline',
    colors: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
  },
  approved: {
    label: 'Approved',
    icon: 'checkmark-circle-outline',
    colors: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    darkColors: { bg: '#064E3B', text: '#34D399', border: '#065F46' },
  },
  duplicate: {
    label: 'Duplicate',
    icon: 'copy-outline',
    colors: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
  },
  rejected: {
    label: 'Rejected',
    icon: 'close-circle-outline',
    colors: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    darkColors: { bg: '#450A0A', text: '#F87171', border: '#7F1D1D' },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCourtType(type) {
  if (!type) return '—';
  if (type === 'indoor') return 'Indoor';
  if (type === 'outdoor') return 'Outdoor';
  if (type === 'unknown') return 'Unknown';
  return type;
}

// ---------------------------------------------------------------------------
// Action Modal Component
// ---------------------------------------------------------------------------

function ActionModal({ visible, onClose, onSubmit, title, description, inputLabel, inputPlaceholder, buttonLabel, buttonColor, colors, isDark }) {
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(inputValue.trim());
      setInputValue('');
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={modalStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[modalStyles.sheet, { backgroundColor: colors.surface }]}
          >
            <Text style={[modalStyles.title, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[modalStyles.description, { color: colors.textSecondary }]}>{description}</Text>

            {inputLabel && (
              <View style={modalStyles.inputWrap}>
                <Text style={[modalStyles.inputLabel, { color: colors.textSecondary }]}>{inputLabel}</Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
                      color: colors.textPrimary,
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
                    },
                  ]}
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder={inputPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline={inputLabel === 'Admin Notes'}
                />
              </View>
            )}

            <View style={modalStyles.buttonRow}>
              <TouchableOpacity
                style={[modalStyles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={[modalStyles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.confirmBtn, { backgroundColor: buttonColor }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={modalStyles.confirmBtnText}>{buttonLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminGymRequestDetailScreen({ route, navigation }) {
  const { requestId } = route.params;
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [activeModal, setActiveModal] = useState(null); // 'approve' | 'duplicate' | 'reject' | null

  // ── Real-time listener ──────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'gymRequests', requestId),
      (snap) => {
        if (snap.exists()) {
          setRequest({ id: snap.id, ...snap.data() });
        } else {
          setRequest(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('AdminGymRequestDetail snapshot error:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [requestId]);

  // ── Review action handlers ──────────────────────────────────────────

  const handleApprove = async (promotedGymId) => {
    const uid = auth.currentUser?.uid;
    const now = Timestamp.now();
    await updateDoc(doc(db, 'gymRequests', requestId), {
      status: 'approved',
      promotedGymId: promotedGymId || null,
      reviewedBy: uid,
      reviewedAt: now,
      updatedAt: now,
    });
  };

  const handleMarkDuplicate = async (duplicateOfGymId) => {
    const uid = auth.currentUser?.uid;
    const now = Timestamp.now();
    await updateDoc(doc(db, 'gymRequests', requestId), {
      status: 'duplicate',
      duplicateOfGymId: duplicateOfGymId || null,
      reviewedBy: uid,
      reviewedAt: now,
      updatedAt: now,
    });
  };

  const handleReject = async (adminNotes) => {
    const uid = auth.currentUser?.uid;
    const now = Timestamp.now();
    await updateDoc(doc(db, 'gymRequests', requestId), {
      status: 'rejected',
      adminNotes: adminNotes || '',
      reviewedBy: uid,
      reviewedAt: now,
      updatedAt: now,
    });
  };

  // ── Admin gate ────────────────────────────────────────────────────
  if (adminLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Access Denied</Text>
          <Text style={styles.emptyText}>You do not have permission to view this screen.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────
  if (!request) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Request Not Found</Text>
          <Text style={styles.emptyText}>
            This gym request may have been deleted.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const statusColors = isDark ? status.darkColors : status.colors;
  const isPending = request.status === 'pending';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Header: gym name + status ─────────────────────────────── */}
        <View style={styles.headerCard}>
          <Text style={styles.gymName}>{request.gymName}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColors.bg, borderColor: statusColors.border },
            ]}
          >
            <Ionicons name={status.icon} size={14} color={statusColors.text} />
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* ── Request details ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Request Details</Text>

          <DetailRow label="Address" value={request.address} icon="location-outline" colors={colors} />
          <DetailRow label="City" value={request.city} icon="business-outline" colors={colors} />
          <DetailRow label="State" value={request.state} icon="map-outline" colors={colors} />
          <DetailRow label="Court Type" value={formatCourtType(request.type)} icon="basketball-outline" colors={colors} />
          {request.notes ? (
            <DetailRow label="Notes" value={request.notes} icon="chatbubble-outline" colors={colors} />
          ) : null}
        </View>

        {/* ── Submission info ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Submission Info</Text>

          <DetailRow label="Submitted By" value={request.submitterName || 'Unknown'} icon="person-outline" colors={colors} />
          <DetailRow label="User ID" value={request.submittedBy || '—'} icon="finger-print-outline" colors={colors} mono />
          <DetailRow label="Submitted" value={formatDate(request.createdAt)} icon="calendar-outline" colors={colors} />
        </View>

        {/* ── Admin Actions (pending only) ──────────────────────────── */}
        {isPending && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Admin Review</Text>
            <Text style={styles.actionHint}>
              Choose an action below. Gym creation is handled separately via seedProductionGyms.js.
            </Text>

            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              activeOpacity={0.7}
              onPress={() => setActiveModal('approve')}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
              <Text style={[styles.actionBtnText, { color: '#059669' }]}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.duplicateBtn]}
              activeOpacity={0.7}
              onPress={() => setActiveModal('duplicate')}
            >
              <Ionicons name="copy-outline" size={18} color="#D97706" />
              <Text style={[styles.actionBtnText, { color: '#D97706' }]}>Mark Duplicate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              activeOpacity={0.7}
              onPress={() => setActiveModal('reject')}
            >
              <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Review Summary (already reviewed) ────────────────────── */}
        {!isPending && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Review Summary</Text>

            <DetailRow label="Decision" value={status.label} icon={status.icon} colors={colors} />
            <DetailRow label="Reviewed At" value={formatDate(request.reviewedAt)} icon="calendar-outline" colors={colors} />
            <DetailRow label="Reviewed By" value={request.reviewedBy || '—'} icon="person-outline" colors={colors} mono />

            {request.status === 'approved' && request.promotedGymId && (
              <DetailRow label="Promoted Gym ID" value={request.promotedGymId} icon="basketball-outline" colors={colors} mono />
            )}
            {request.status === 'duplicate' && request.duplicateOfGymId && (
              <DetailRow label="Duplicate Of" value={request.duplicateOfGymId} icon="copy-outline" colors={colors} mono />
            )}
            {request.adminNotes ? (
              <DetailRow label="Admin Notes" value={request.adminNotes} icon="chatbubble-outline" colors={colors} />
            ) : null}
          </View>
        )}

      </ScrollView>

      {/* ── Action Modals ──────────────────────────────────────────── */}
      <ActionModal
        visible={activeModal === 'approve'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleApprove}
        title="Approve Request"
        description="Mark this gym request as approved. Add the gym to RunCheck via seedProductionGyms.js, then optionally enter its gym ID below."
        inputLabel="Promoted Gym ID (optional)"
        inputPlaceholder="e.g. gym-name-city"
        buttonLabel="Approve"
        buttonColor="#059669"
        colors={colors}
        isDark={isDark}
      />

      <ActionModal
        visible={activeModal === 'duplicate'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleMarkDuplicate}
        title="Mark as Duplicate"
        description="This gym already exists in RunCheck under a different name. Optionally enter the existing gym's ID."
        inputLabel="Duplicate Of Gym ID (optional)"
        inputPlaceholder="e.g. existing-gym-id"
        buttonLabel="Mark Duplicate"
        buttonColor="#D97706"
        colors={colors}
        isDark={isDark}
      />

      <ActionModal
        visible={activeModal === 'reject'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleReject}
        title="Reject Request"
        description="This gym will not be added to RunCheck. Optionally add a note explaining why."
        inputLabel="Admin Notes (optional)"
        inputPlaceholder="Reason for rejection..."
        buttonLabel="Reject"
        buttonColor="#DC2626"
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// DetailRow — Reusable label/value row
// ---------------------------------------------------------------------------

function DetailRow({ label, value, icon, colors, mono }) {
  return (
    <View style={detailRowStyles.row}>
      <View style={detailRowStyles.labelWrap}>
        <Ionicons name={icon} size={14} color={colors.textMuted} />
        <Text style={[detailRowStyles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
      <Text
        style={[
          detailRowStyles.value,
          { color: colors.textPrimary },
          mono && detailRowStyles.mono,
        ]}
        selectable
      >
        {value || '—'}
      </Text>
    </View>
  );
}

const detailRowStyles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  label: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: FONT_SIZES.small,
  },
});

// ---------------------------------------------------------------------------
// Modal styles
// ---------------------------------------------------------------------------

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  inputWrap: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.body,
    minHeight: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
});

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.lg * 2,
    },

    // Empty / not found
    emptyTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
    },
    emptyText: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 280,
    },

    // Header card
    headerCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    gymName: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
    },
    statusText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
    },

    // Cards
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    sectionTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },

    // Action hint
    actionHint: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: SPACING.md,
    },

    // Action buttons
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.sm,
      marginBottom: SPACING.xs,
      borderWidth: 1,
    },
    approveBtn: {
      backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
      borderColor: isDark ? '#065F46' : '#A7F3D0',
    },
    duplicateBtn: {
      backgroundColor: isDark ? '#451A03' : '#FFFBEB',
      borderColor: isDark ? '#78350F' : '#FDE68A',
    },
    rejectBtn: {
      backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
    },
    actionBtnText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
  });
