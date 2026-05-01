/**
 * GymReviewsScreen.js — Full Player Reviews List
 *
 * Displays the complete review history for a gym, accessible from the
 * "See All Reviews" link in RunDetailsScreen.
 *
 * Route params expected:
 *   gymId   {string} — Firestore document ID of the gym (required for data)
 *   gymName {string} — Display name shown in the header
 *
 * Data source: gyms/{gymId}/reviews/{autoId}
 * Fields: userId, userName, userAvatar, rating, text,
 *         verifiedAttendee, createdAt
 *
 * Review eligibility mirrors RunDetailsScreen:
 *   canReview = pointsAwarded.gymVisits.includes(gymId)
 *             || pointsAwarded.runGyms.includes(gymId)
 * Points are awarded at most once per user per gym (permanent transaction
 * guard in pointsService) — fire-and-forget in reviewService.
 */

import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useProfile } from '../hooks';
import {
  checkReviewEligibility,
  submitReview,
} from '../services/reviewService';
import { sanitizeFreeText } from '../utils/sanitize';
import { hapticSuccess, hapticLight, hapticMedium } from '../utils/haptics';
import { FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * timeAgo — Human-readable relative timestamp for a Firestore Timestamp or Date.
 * Matches the same helper used in RunDetailsScreen.
 */
const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function GymReviewsScreen({ route, navigation }) {
  const { gymId, gymName } = route.params || {};
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Current user
  const uid = auth.currentUser?.uid;
  const { profile } = useProfile();

  // ── Live reviews ─────────────────────────────────────────────────────────
  const [reviews, setReviews]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!gymId) { setLoading(false); return; }

    const q = query(
      collection(db, 'gyms', gymId, 'reviews'),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        if (__DEV__) console.error('[GymReviewsScreen] snapshot error:', err.code, err.message);
        setFetchError(true);
        setLoading(false);
      },
    );

    return unsub;
  }, [gymId]);

  // ── Review eligibility ───────────────────────────────────────────────────
  // canReview: user has checked in or attended a run here
  // hasVerifiedRun: user completed a verified run here (badge signal only)
  const [canReview, setCanReview]           = useState(false);
  const [hasVerifiedRun, setHasVerifiedRun] = useState(false);

  useEffect(() => {
    if (!uid || !gymId) return;
    checkReviewEligibility(uid, gymId)
      .then(({ canReview: eligible, hasVerifiedRun: runVerified }) => {
        setCanReview(eligible);
        setHasVerifiedRun(runVerified);
      })
      .catch((err) => {
        if (__DEV__) console.error('[GymReviewsScreen] eligibility error:', err);
      });
  }, [uid, gymId]);

  // Derived: true if this user already has a review for this gym
  const hasReviewed = !!uid && reviews.some((r) => r.userId === uid);

  // ── Review modal state ───────────────────────────────────────────────────
  const [modalVisible, setModalVisible]       = useState(false);
  const [selectedRating, setSelectedRating]   = useState(0);
  const [reviewText, setReviewText]           = useState('');
  const [submitting, setSubmitting]           = useState(false);

  const handleSubmitReview = async () => {
    if (selectedRating === 0) {
      Alert.alert('Rating Required', 'Please tap a star to rate this gym.');
      return;
    }
    if (!uid) return;
    if (hasReviewed) {
      Alert.alert('Already Reviewed', "You've already reviewed this gym.");
      setModalVisible(false);
      return;
    }

    setSubmitting(true);
    try {
      const { success, alreadyReviewed } = await submitReview(
        uid,
        gymId,
        profile?.name     || 'Anonymous',
        profile?.photoURL ?? null,
        selectedRating,
        reviewText.trim(),
        hasVerifiedRun,
      );

      if (alreadyReviewed) {
        Alert.alert('Already Reviewed', "You've already reviewed this gym.");
        setModalVisible(false);
        return;
      }
      if (!success) {
        Alert.alert('Error', 'Could not submit your review. Please try again.');
        return;
      }

      // Review written — close immediately. Points are fire-and-forget.
      hapticSuccess();
      setModalVisible(false);
      setSelectedRating(0);
      setReviewText('');
      Alert.alert('Review submitted! ✓');
    } catch (err) {
      if (__DEV__) console.error('[GymReviewsScreen] handleSubmitReview error:', err);
      Alert.alert('Error', 'Could not submit your review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedRating(0);
    setReviewText('');
  };

  // ── Derived: aggregate stats ─────────────────────────────────────────────
  const { avgRating, ratingBreakdown } = useMemo(() => {
    if (reviews.length === 0) {
      return {
        avgRating: 0,
        ratingBreakdown: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: 0, pct: 0 })),
      };
    }
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avg   = total / reviews.length;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 0)));
      counts[star] += 1;
    });
    const breakdown = [5, 4, 3, 2, 1].map((s) => ({
      stars: s,
      count: counts[s],
      pct: counts[s] / reviews.length,
    }));
    return { avgRating: avg, ratingBreakdown: breakdown };
  }, [reviews]);

  // Sorted: verified attendees first → rating desc → newest
  const sortedReviews = useMemo(() => (
    [...reviews].sort((a, b) => {
      const vDiff = (b.verifiedAttendee ? 1 : 0) - (a.verifiedAttendee ? 1 : 0);
      if (vDiff !== 0) return vDiff;
      const rDiff = (b.rating || 0) - (a.rating || 0);
      if (rDiff !== 0) return rDiff;
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    })
  ), [reviews]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Player Reviews</Text>
          {!!gymName && (
            <Text style={styles.headerSub} numberOfLines={1}>{gymName}</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <View style={styles.centeredFill}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load reviews</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
        </View>
      )}

      {/* Content */}
      {!loading && !fetchError && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Rating summary card — only when reviews exist */}
          {reviews.length > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryLeft}>
                <Text style={styles.bigRating}>{avgRating.toFixed(1)}</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons
                      key={i}
                      name={i <= Math.round(avgRating) ? 'star' : 'star-outline'}
                      size={18}
                      color="#F59E0B"
                    />
                  ))}
                </View>
                <Text style={styles.ratingCount}>
                  {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                </Text>
              </View>

              <View style={styles.summaryRight}>
                {ratingBreakdown.map((row) => (
                  <View key={row.stars} style={styles.breakdownRow}>
                    <Text style={styles.breakdownStarLabel}>{row.stars}</Text>
                    <Ionicons name="star" size={11} color="#F59E0B" style={{ marginRight: 4 }} />
                    <View style={styles.breakdownTrack}>
                      <View
                        style={[
                          styles.breakdownFill,
                          { width: `${Math.round(row.pct * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.breakdownCount}>{row.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Write a Review CTA ── */}
          {!canReview ? (
            // Not eligible — hasn't checked in or attended a run here
            <View style={styles.gateRow}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
              <Text style={styles.gateText}>Check in here to leave a review</Text>
            </View>
          ) : hasReviewed ? (
            // Already reviewed
            <View style={styles.gateRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={[styles.gateText, { color: colors.success }]}>
                You've reviewed this gym
              </Text>
            </View>
          ) : (
            // Eligible — show the button
            <TouchableOpacity
              style={styles.writeReviewBtn}
              onPress={() => { hapticLight(); setModalVisible(true); }}
            >
              <Ionicons name="star" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.writeReviewBtnText}>Leave a Review</Text>
            </TouchableOpacity>
          )}

          {/* Empty state */}
          {reviews.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="star-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptySub}>
                Check in or attend a run here to be the first to leave one.
              </Text>
            </View>
          )}

          {/* Review cards */}
          {sortedReviews.length > 0 && (
            <View style={styles.reviewsList}>
              {sortedReviews.map((review) => {
                const initial = (review.userName || 'A')[0].toUpperCase();
                return (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewTop}>

                      {/* Avatar or initial fallback */}
                      {review.userAvatar ? (
                        <Image source={{ uri: review.userAvatar }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarInitial}>{initial}</Text>
                        </View>
                      )}

                      <View style={styles.reviewMeta}>
                        <Text style={styles.reviewerName}>
                          {review.userName || 'Anonymous'}
                        </Text>

                        <View style={styles.starsDateRow}>
                          <View style={styles.reviewStars}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Ionicons
                                key={i}
                                name={i <= review.rating ? 'star' : 'star-outline'}
                                size={13}
                                color="#F59E0B"
                              />
                            ))}
                          </View>
                          <Text style={styles.reviewDate}>
                            {timeAgo(review.createdAt)}
                          </Text>
                        </View>

                        {/* Verified Run badge */}
                        {review.verifiedAttendee && (
                          <View style={styles.verifiedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#6366F1" />
                            <Text style={styles.verifiedBadgeText}>Verified Run</Text>
                          </View>
                        )}
                      </View>

                    </View>

                    {/* Comment — only rendered when non-empty */}
                    {!!review.text && (
                      <Text style={styles.reviewComment}>{review.text}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}

      {/* ── Leave a Review Modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback accessible={false}>
              <View style={styles.modalCard}>

                <Text style={styles.modalTitle}>Rate This Gym</Text>

                {/* Star picker */}
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => { hapticMedium(); setSelectedRating(star); }}
                    >
                      <Ionicons
                        name={star <= selectedRating ? 'star' : 'star-outline'}
                        size={38}
                        color="#F59E0B"
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Optional comment */}
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Share your experience (optional)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={400}
                  value={reviewText}
                  onChangeText={(t) => setReviewText(sanitizeFreeText(t, 400))}
                />

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                  onPress={handleSubmitReview}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Review</Text>
                  )}
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCloseModal}
                  disabled={submitting}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Loading / error
  centeredFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Scroll
  scroll: {
    padding: SPACING.md,
  },

  // Summary card
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  summaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bigRating: {
    fontSize: 48,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
    lineHeight: 52,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  summaryRight: {
    flex: 1,
    justifyContent: 'center',
    gap: 5,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  breakdownStarLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textSecondary,
    width: 10,
    textAlign: 'right',
  },
  breakdownTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: 6,
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  breakdownCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    width: 16,
    textAlign: 'right',
  },

  // Write a review CTA
  writeReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  writeReviewBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#fff',
  },

  // Gate row (locked / already reviewed)
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.lg,
  },
  gateText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },

  // Reviews list
  reviewsList: {
    gap: SPACING.sm,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  starsDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 3,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6366F1',
  },
  reviewComment: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: SPACING.xs,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  starRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reviewInput: {
    width: '100%',
    minHeight: 90,
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    color: colors.textPrimary,
    fontSize: FONT_SIZES.body,
    textAlignVertical: 'top',
  },
  submitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#fff',
  },
  cancelBtn: {
    paddingVertical: SPACING.xs,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
});
