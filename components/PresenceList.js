/**
 * PresenceList Component
 *
 * Reusable list component for displaying players (presences or schedules).
 *
 * USAGE:
 * <PresenceList
 *   items={presences}
 *   type="presence"
 *   emptyMessage="No one here yet"
 *   emptySubtext="Be the first to check in!"
 * />
 *
 * <PresenceList
 *   items={todaySchedules}
 *   type="schedule"
 *   emptyMessage="No one scheduled"
 * />
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, SKILL_LEVEL_COLORS } from '../constants/theme';
import { useTheme } from '../contexts';

/**
 * Calculate duration since check-in
 * @param {Object} timestamp - Firestore timestamp
 * @returns {string} Duration string (e.g., "Here for 15m")
 */
const getHereDuration = (timestamp) => {
  if (!timestamp) return '';
  const checkedInAt = timestamp.toDate();
  const minutes = Math.round((new Date() - checkedInAt) / 60000);
  if (minutes < 1) return 'Here for <1m';
  if (minutes < 60) return `Here for ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `Here for ${hours}h ${mins}m` : `Here for ${hours}h`;
};

/**
 * Format scheduled time for display
 * @param {Object} timestamp - Firestore timestamp
 * @returns {string} Time string (e.g., "2:00 PM")
 */
const formatScheduledTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * PresenceList Component
 *
 * @param {Object} props
 * @param {Array} props.items - Array of presence or schedule objects
 * @param {string} props.type - 'presence' or 'schedule'
 * @param {string} props.emptyMessage - Message when list is empty
 * @param {string} props.emptySubtext - Optional subtext when list is empty
 */
export const PresenceList = ({
  items = [],
  type = 'presence',
  emptyMessage = 'No players',
  emptySubtext,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        {emptySubtext && <Text style={styles.emptySubtext}>{emptySubtext}</Text>}
      </View>
    );
  }

  return (
    <>
      {items.map((item) => {
        const name = item.userName || 'Anonymous';
        const initial = name.charAt(0).toUpperCase();
        const skillLevel = item.skillLevel;
        const skillColors = SKILL_LEVEL_COLORS[skillLevel] || SKILL_LEVEL_COLORS.Casual;

        // Determine time info based on type
        const timeInfo =
          type === 'presence'
            ? getHereDuration(item.checkedInAt)
            : formatScheduledTime(item.scheduledTime);

        return (
          <View key={item.id} style={styles.playerCard}>
            <View style={styles.playerAvatar}>
              <Text style={styles.playerInitial}>{initial}</Text>
            </View>
            <View style={styles.playerInfo}>
              <View style={styles.playerNameRow}>
                <Text style={styles.playerName}>{name}</Text>
                {skillLevel && (
                  <View style={[styles.skillBadge, { backgroundColor: skillColors.bg }]}>
                    <Text style={[styles.skillBadgeText, { color: skillColors.text }]}>
                      {skillLevel}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.playerTime}>{timeInfo}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
};

const getStyles = (colors) =>
  StyleSheet.create({
    emptyState: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.lg,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyText: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    emptySubtext: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
    },
    playerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    playerAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    playerInitial: {
      color: '#fff',
      fontSize: FONT_SIZES.subtitle,
      fontWeight: 'bold',
    },
    playerInfo: {
      flex: 1,
    },
    playerNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    playerName: {
      fontSize: FONT_SIZES.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    skillBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,  // FitBuddy: tighter badge radius
      marginLeft: SPACING.xs,
    },
    skillBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
    },
    playerTime: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });

export default PresenceList;
