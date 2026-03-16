/**
 * AdminToolsScreen.js — Admin Tools Dashboard
 *
 * Entry screen for admin-only tools. Currently provides access to:
 *   - Gym Requests (active — navigates to future admin review screen)
 *
 * Placeholder rows for upcoming tools:
 *   - Gym Management
 *   - Reports / Moderation
 *   - Featured Content
 *
 * No Firestore logic or role gating yet — this is a UI-only screen.
 */

import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Tool row definitions
// ---------------------------------------------------------------------------

const ADMIN_TOOLS = [
  {
    id: 'gym-requests',
    label: 'Gym Requests',
    subtitle: 'Review and manage user-submitted gym requests',
    icon: 'document-text-outline',
    active: true,
  },
  {
    id: 'gym-management',
    label: 'Gym Management',
    subtitle: 'Edit gym details, images, and status',
    icon: 'basketball-outline',
    active: false,
  },
  {
    id: 'reports-moderation',
    label: 'Reports / Moderation',
    subtitle: 'Review flagged content and user reports',
    icon: 'shield-checkmark-outline',
    active: false,
  },
  {
    id: 'featured-content',
    label: 'Featured Content',
    subtitle: 'Manage featured gyms, clips, and highlights',
    icon: 'star-outline',
    active: false,
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminToolsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);

  const handlePress = (tool) => {
    if (!tool.active) return;
    if (tool.id === 'gym-requests') {
      navigation.navigate('AdminGymRequests');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header blurb */}
        <View style={styles.headerSection}>
          <Ionicons name="construct-outline" size={28} color={colors.primary} />
          <Text style={styles.headerTitle}>Admin Tools</Text>
          <Text style={styles.headerSubtitle}>
            Manage gyms, requests, and community content.
          </Text>
        </View>

        {/* Tool rows */}
        {ADMIN_TOOLS.map((tool) => {
          const isActive = tool.active;

          return (
            <TouchableOpacity
              key={tool.id}
              style={[styles.toolRow, !isActive && styles.toolRowInactive]}
              activeOpacity={isActive ? 0.7 : 1}
              onPress={() => handlePress(tool)}
            >
              <View style={styles.toolLeft}>
                <View style={[styles.iconCircle, !isActive && styles.iconCircleInactive]}>
                  <Ionicons
                    name={tool.icon}
                    size={20}
                    color={isActive ? colors.primary : colors.textMuted}
                  />
                </View>
                <View style={styles.toolTextBlock}>
                  <Text style={[styles.toolLabel, !isActive && styles.toolLabelInactive]}>
                    {tool.label}
                  </Text>
                  <Text style={styles.toolSubtitle}>{tool.subtitle}</Text>
                </View>
              </View>

              <View style={styles.toolRight}>
                {!isActive && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Soon</Text>
                  </View>
                )}
                {isActive && (
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.lg * 2,
    },

    // Header
    headerSection: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    headerTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.xs,
    },
    headerSubtitle: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      marginTop: SPACING.xxs,
    },

    // Tool row (card-style, matches gymRequestsRow pattern)
    toolRow: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    toolRowInactive: {
      opacity: 0.5,
    },

    toolLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,107,53,0.12)' : '#FFF3ED',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleInactive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    },
    toolTextBlock: {
      flex: 1,
    },
    toolLabel: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    toolLabelInactive: {
      color: colors.textMuted,
    },
    toolSubtitle: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      marginTop: 2,
    },

    toolRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginLeft: SPACING.xs,
    },

    // Coming soon badge
    comingSoonBadge: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    comingSoonText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textMuted,
    },
  });
