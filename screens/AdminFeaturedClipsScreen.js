/**
 * AdminFeaturedClipsScreen.js — View & Manage Featured Clips
 *
 * Lists all featured clips (isDailyHighlight === true) from the `gymClips`
 * collection. Each card shows a visual thumbnail preview, uploader avatar +
 * name, who featured it (resolved to display name), featured date, and an
 * Unfeature action button.
 *
 * Modeled closely on AdminHiddenClipsScreen for consistency.
 *
 * Uses a real-time `onSnapshot` listener so changes reflect immediately.
 *
 * Gated by useIsAdmin — non-admin users see an Access Denied screen.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { db, callFunction, storage } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a relative time string like "2h ago", "3d ago", or a short date. */
function formatRelativeTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Get initials from a display name string. */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminFeaturedClipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unfeaturing, setUnfeaturing] = useState(null); // clipId being unfeatured

  // Resolved user data: uid → { name, photoURL }
  const [userProfiles, setUserProfiles] = useState({});
  // Resolved clip thumbnails: clipId → url
  const [thumbnails, setThumbnails] = useState({});
  // Resolved clip video URLs: clipId → download URL
  const [videoUrls, setVideoUrls] = useState({});

  // Real-time listener: all clips with isDailyHighlight === true
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'gymClips'),
      where('isDailyHighlight', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Sort by featuredAt descending (newest first), fall back to createdAt
          .sort((a, b) => {
            const aDate = (a.featuredAt || a.createdAt)?.toDate?.() || new Date(0);
            const bDate = (b.featuredAt || b.createdAt)?.toDate?.() || new Date(0);
            return bDate - aDate;
          });
        setClips(docs);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('AdminFeaturedClipsScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  // Resolve user profiles (uploader + featuredBy admin) → { name, photoURL }
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolve() {
      const newProfiles = {};
      const idsToFetch = new Set();

      for (const c of clips) {
        const uploaderUid = c.uploaderUid || c.uid;
        if (uploaderUid && !userProfiles[uploaderUid]) idsToFetch.add(uploaderUid);
        const fb = c.featuredBy;
        if (fb && !userProfiles[fb]) idsToFetch.add(fb);
      }

      for (const uid of idsToFetch) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d = snap.data();
            newProfiles[uid] = {
              name: d.displayName || d.name || uid,
              photoURL: d.photoURL || null,
            };
          }
        } catch (_) { /* fallback to uid */ }
      }

      if (cancelled) return;
      if (Object.keys(newProfiles).length > 0) {
        setUserProfiles((prev) => ({ ...prev, ...newProfiles }));
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [clips]);

  // Resolve clip thumbnails from thumbnailPath via Firebase Storage
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolveThumbs() {
      const newThumbs = {};

      for (const c of clips) {
        if (thumbnails[c.id]) continue;
        const path = c.thumbnailPath;
        if (!path) continue;

        try {
          const url = await getDownloadURL(ref(storage, path));
          newThumbs[c.id] = url;
        } catch (_) { /* no thumbnail available */ }
      }

      if (cancelled) return;
      if (Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    }

    resolveThumbs();
    return () => { cancelled = true; };
  }, [clips]);

  // Resolve clip video URLs from storagePath via Firebase Storage
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolveVideos() {
      const newUrls = {};

      for (const c of clips) {
        if (videoUrls[c.id]) continue;
        const path = c.storagePath;
        if (!path) continue;

        try {
          const url = await getDownloadURL(ref(storage, path));
          newUrls[c.id] = url;
        } catch (_) { /* no video available */ }
      }

      if (cancelled) return;
      if (Object.keys(newUrls).length > 0) {
        setVideoUrls((prev) => ({ ...prev, ...newUrls }));
      }
    }

    resolveVideos();
    return () => { cancelled = true; };
  }, [clips]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const handleUnfeature = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Unfeature Clip',
      `This will remove the clip by ${uploaderName} from featured clips. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfeature',
          onPress: async () => {
            setUnfeaturing(clip.id);
            try {
              await callFunction('unfeatureClip', { clipId: clip.id });
            } catch (err) {
              console.error('unfeatureClip error:', err);
              Alert.alert(
                'Unfeature Failed',
                err?.message || 'Could not unfeature clip. Please try again.'
              );
            } finally {
              setUnfeaturing(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  /** Resolve featuredBy to a human-readable string. */
  const getFeaturedByLabel = (clip) => {
    if (!clip.featuredBy) return 'Unknown';
    return userProfiles[clip.featuredBy]?.name || clip.featuredBy;
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (clips.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="star-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Featured Clips</Text>
          <Text style={styles.emptyText}>
            Feature clips from the clip player to highlight them here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {clips.length} featured {clips.length === 1 ? 'clip' : 'clips'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {clips.map((clip) => {
          const uploaderUid = clip.uploaderUid || clip.uid;
          const uploaderProfile = userProfiles[uploaderUid];
          const uploaderName = uploaderProfile?.name || uploaderUid || 'Unknown';
          const uploaderPhoto = uploaderProfile?.photoURL;
          const uploaderInitials = getInitials(uploaderName !== uploaderUid ? uploaderName : null);
          const thumbUrl = thumbnails[clip.id];
          const clipVideoUrl = videoUrls[clip.id];

          return (
            <View key={clip.id} style={styles.card}>
              {/* Clip thumbnail preview — tappable to play */}
              <TouchableOpacity
                activeOpacity={clipVideoUrl ? 0.7 : 1}
                onPress={() => {
                  if (clipVideoUrl) {
                    navigation.navigate('ClipPlayer', { videoUrl: clipVideoUrl, clipId: clip.id });
                  }
                }}
              >
                <View style={styles.thumbnailContainer}>
                  {thumbUrl ? (
                    <Image
                      source={{ uri: thumbUrl }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.thumbnailPlaceholder}>
                      <Ionicons name="videocam-outline" size={32} color="rgba(255,255,255,0.4)" />
                    </View>
                  )}
                  {/* Play icon overlay */}
                  <View style={styles.playOverlay}>
                    <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.8)" />
                  </View>
                  {/* Featured badge overlay */}
                  <View style={styles.featuredOverlayBadge}>
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={styles.featuredOverlayText}>Featured</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Uploader row: avatar + name */}
              <View style={styles.uploaderRow}>
                {uploaderPhoto ? (
                  <Image source={{ uri: uploaderPhoto }} style={styles.uploaderAvatar} />
                ) : (
                  <View style={[styles.uploaderAvatar, styles.uploaderAvatarFallback]}>
                    <Text style={styles.uploaderInitial}>{uploaderInitials}</Text>
                  </View>
                )}
                <View style={styles.uploaderMeta}>
                  <Text style={styles.uploaderName} numberOfLines={1}>
                    {uploaderName}
                  </Text>
                  <Text style={styles.clipIdText} numberOfLines={1}>
                    {clip.id}
                  </Text>
                </View>
              </View>

              {/* Featured by — resolved to display name */}
              <View style={styles.metaRow}>
                <Ionicons name="star-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Featured by: </Text>
                <Text style={styles.metaText}>
                  {getFeaturedByLabel(clip)}
                </Text>
              </View>

              {/* Featured date */}
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Featured: </Text>
                <Text style={styles.metaText}>
                  {formatRelativeTime(clip.featuredAt || clip.createdAt)}
                </Text>
              </View>

              {/* Unfeature button */}
              <TouchableOpacity
                style={styles.unfeatureBtn}
                onPress={() => handleUnfeature(clip)}
                disabled={unfeaturing === clip.id}
                activeOpacity={0.7}
              >
                {unfeaturing === clip.id ? (
                  <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                  <>
                    <Ionicons name="star-half-outline" size={16} color="#F59E0B" />
                    <Text style={styles.unfeatureBtnText}>Unfeature Clip</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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

    // Summary bar
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    summaryText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textSecondary,
    },

    // Empty state
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

    // Card
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.sm,
      overflow: 'hidden',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },

    // Thumbnail
    thumbnailContainer: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: '#1a1a1a',
      position: 'relative',
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    thumbnailPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#2a2a2a',
    },
    playOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    featuredOverlayBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(245, 158, 11, 0.85)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    featuredOverlayText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },

    // Uploader row
    uploaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      gap: SPACING.sm,
    },
    uploaderAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#333',
    },
    uploaderAvatarFallback: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,107,53,0.15)' : '#FFF3ED',
    },
    uploaderInitial: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
    },
    uploaderMeta: {
      flex: 1,
    },
    uploaderName: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
    clipIdText: {
      fontSize: 10,
      color: colors.textMuted,
      fontFamily: 'monospace',
      marginTop: 1,
    },

    // Meta rows
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
      paddingHorizontal: SPACING.md,
    },
    metaLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      fontWeight: FONT_WEIGHTS.medium,
    },
    metaText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      flex: 1,
    },

    // Unfeature button
    unfeatureBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderColor: isDark ? '#92400E' : '#FCD34D',
      marginHorizontal: SPACING.md,
      marginTop: SPACING.xs,
      marginBottom: SPACING.md,
    },
    unfeatureBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#FBBF24' : '#92400E',
    },
  });
