/**
 * GymReviewsScreen.js — Full Player Reviews List
 *
 * Displays the complete review history for a gym, accessible from the
 * "See All Reviews" link in RunDetailsScreen. Includes an aggregate
 * rating summary with a star-breakdown bar chart, a "Write a Review"
 * button (coming soon placeholder), and the full reviews list.
 *
 * Each review card shows:
 *   - Reviewer's avatar, name, and skill-level badge (color-coded)
 *   - Star rating and relative date
 *   - Full review comment text
 *
 * This screen uses a custom header (back button + title + gym name)
 * instead of the default React Navigation header, keeping `headerShown: false`
 * in the navigator and managing the header manually in JSX.
 *
 * Data:
 *   `reviews` can be passed via `route.params` from RunDetailsScreen.
 *   `FAKE_REVIEWS` and `RATING_BREAKDOWN` are static placeholder constants
 *   until a real Firestore reviews collection is implemented.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';

/** Placeholder review data — to be replaced by a Firestore reviews collection. */
const FAKE_REVIEWS = [
  { id: 'r1', name: 'Big Ray',    avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   rating: 5, comment: 'Best run in the city. Good competition, everybody plays the right way. Been coming here for years. If you want a real game, this is the spot.', date: '2 days ago',  skillLevel: 'Competitive' },
  { id: 'r2', name: 'Aaliyah S.', avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', rating: 4, comment: 'Good spot. Gets packed on weekends but the courts are clean and well-lit at night. Staff is cool too.', date: '5 days ago',  skillLevel: 'Either' },
  { id: 'r3', name: 'Coach D',    avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   rating: 5, comment: 'Community is welcoming to all skill levels. Perfect for beginners wanting to improve in a real environment.', date: '1 week ago', skillLevel: 'Competitive' },
  { id: 'r4', name: 'Lil TJ',     avatarUrl: 'https://randomuser.me/api/portraits/men/4.jpg',    rating: 4, comment: 'Rims are a little tight but the competition is real. Usually run 5v5 full court here after school.', date: '2 weeks ago', skillLevel: 'Casual' },
  { id: 'r5', name: 'Marcus W.',  avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',   rating: 5, comment: 'Always a good run. Respectful players, no ball hogs. Great for evening games after work.', date: '3 weeks ago', skillLevel: 'Either' },
  { id: 'r6', name: 'Keisha L.',  avatarUrl: 'https://randomuser.me/api/portraits/women/45.jpg', rating: 4, comment: 'Love seeing women out here holding their own. Inclusive environment, no weird vibes.', date: '1 month ago', skillLevel: 'Casual' },
  { id: 'r7', name: 'O.G. Andre', avatarUrl: 'https://randomuser.me/api/portraits/men/91.jpg',   rating: 5, comment: "Been playing here since '09. This gym has character. The regulars look out for each other.", date: '1 month ago', skillLevel: 'Competitive' },
];

/**
 * Rating breakdown used to render the star distribution bar chart.
 * `pct` is a 0–1 value representing the proportion of reviews at that star level.
 */
const RATING_BREAKDOWN = [
  { stars: 5, count: 14, pct: 0.78 },
  { stars: 4, count: 3,  pct: 0.17 },
  { stars: 3, count: 1,  pct: 0.05 },
  { stars: 2, count: 0,  pct: 0 },
  { stars: 1, count: 0,  pct: 0 },
];

/**
 * GymReviewsScreen — Full reviews list for a specific gym.
 *
 * @param {object} props
 * @param {object} props.route — React Navigation route object.
 * @param {object} props.route.params
 * @param {string} props.route.params.gymName — Display name of the gym for the header.
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function GymReviewsScreen({ route, navigation }) {
  const { gymName } = route.params || {};
  const { colors, isDark, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleWriteReview — Placeholder for the review submission flow.
   *
   * Shows a "Coming Soon" alert until the review creation feature is
   * built out with a Firestore write and a dedicated input screen.
   */
  const handleWriteReview = () => {
    Alert.alert('Coming Soon', 'Review writing will be available in a future update!');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Custom header — back button on the left, title + gym name centered */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Player Reviews</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{gymName}</Text>
        </View>
        {/* Empty view on the right balances the header layout */}
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Rating Summary Card — aggregate score + star breakdown bars */}
        <View style={styles.summaryCard}>
          {/* Left: large numeric rating + stars + review count */}
          <View style={styles.summaryLeft}>
            <Text style={styles.bigRating}>4.7</Text>
            <View style={styles.starsRow}>
              {[1,2,3,4,5].map(i => (
                <Ionicons key={i} name={i <= 4 ? 'star' : 'star-half'} size={18} color="#F97316" />
              ))}
            </View>
            <Text style={styles.ratingCount}>{FAKE_REVIEWS.length} reviews</Text>
          </View>
          {/* Right: star distribution bar chart (5★ → 1★) */}
          <View style={styles.summaryRight}>
            {RATING_BREAKDOWN.map(row => (
              <View key={row.stars} style={styles.breakdownRow}>
                <Text style={styles.breakdownStarLabel}>{row.stars}</Text>
                <Ionicons name="star" size={11} color="#F97316" style={{ marginRight: 4 }} />
                {/* Track bar with a proportionally-filled inner view */}
                <View style={styles.breakdownTrack}>
                  <View style={[styles.breakdownFill, { width: `${row.pct * 100}%` }]} />
                </View>
                <Text style={styles.breakdownCount}>{row.count}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Write a Review CTA */}
        <TouchableOpacity style={styles.writeReviewBtn} onPress={handleWriteReview}>
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={styles.writeReviewText}>Write a Review</Text>
        </TouchableOpacity>

        {/* Full Reviews List */}
        <View style={styles.reviewsList}>
          {FAKE_REVIEWS.map((review) => {
            // Look up the skill level's badge colors from the theme's skillColors map
            const badgeColors = skillColors?.[review.skillLevel];
            return (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <Image source={{ uri: review.avatarUrl }} style={styles.avatar} />
                  <View style={styles.reviewMeta}>
                    <View style={styles.nameRow}>
                      <Text style={styles.reviewerName}>{review.name}</Text>
                      {/* Skill badge — only rendered if the level has a mapped color */}
                      {badgeColors && (
                        <View style={[styles.skillBadge, { backgroundColor: badgeColors.bg }]}>
                          <Text style={[styles.skillBadgeText, { color: badgeColors.text }]}>
                            {review.skillLevel}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.starsDateRow}>
                      <View style={styles.reviewStars}>
                        {[1,2,3,4,5].map(i => (
                          <Ionicons key={i} name={i <= review.rating ? 'star' : 'star-outline'} size={13} color="#F97316" />
                        ))}
                      </View>
                      <Text style={styles.reviewDate}>{review.date}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </View>
            );
          })}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for GymReviewsScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    backgroundColor: '#F97316',
    borderRadius: 3,
  },
  breakdownCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    width: 16,
    textAlign: 'right',
  },

  // Write review button
  writeReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  writeReviewText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.primary,
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
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  reviewMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  reviewerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  skillBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  skillBadgeText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
  reviewComment: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
