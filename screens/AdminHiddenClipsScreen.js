/**
 * AdminHiddenClipsScreen.js — View & Manage Hidden Clips
 *
 * Lists all hidden clips (isHidden === true) from the `gymClips` collection.
 * Each card shows a visual thumbnail preview (when available), uploader
 * avatar + name, who hid it (resolved to display name), reason, date,
 * auto-moderation badge, and an Unhide action button.
 *
 * Thumbnail resolution uses the same `thumbnailPath` → `getDownloadURL`
 * pattern from RunDetailsScreen. Falls back to a dark placeholder with a
 * videocam icon when no thumbnail is available.
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
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { db, callFunction, storage } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
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

export default function AdminHiddenClipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unhiding, setUnhiding] = useState(null); // clipId being unhidden
  const [deleting, setDeleting] = useState(null); // clipId being deleted

  // Resolved user data: uid → { name, photoURL }
  const [userProfiles, setUserProfiles] = useState({});
  // Resolved clip thumbnails: clipId → url
  const [thumbnails, setThumbnails] = useState({});
  // Resolved clip video URLs: clipId → download URL
  const [videoUrls, setVideoUrls] = useState({});

  // Real-time listener: all clips with isHidden === true
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'gymClips'),
      where('isHidden', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Sort by hiddenAt descending (newest first)
          .sort((a, b) => {
            const aDate = a.hiddenAt?.toDate?.() || new Date(0);
            const bDate = b.hiddenAt?.toDate?.() || new Date(0);
            return bDate - aDate;
          });
        setClips(docs);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        if (__DEV__) console.error('AdminHiddenClipsScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  // Resolve user profiles (uploader + hiddenBy admin) → { name, photoURL }
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolve() {
      const newProfiles = {};
      const idsToFetch = new Set();

      for (const c of clips) {
        // Uploader
        const uploaderUid = c.uploaderUid || c.uid;
        if (uploaderUid && !userProfiles[uploaderUid]) idsToFetch.add(uploaderUid);
        // Hidden by (admin UID)
        const hb = c.hiddenBy;
        if (hb && hb !== 'auto-moderation' && !userProfiles[hb]) idsToFetch.add(hb);
      }

      for (const uid of idsToFetch) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d = snap.data();
            newProfiles[uid] = {
              name: d.displayName || d.name || uid,
              photoURL: d.photoURL || null,
              deleted: false,
            };
          } else {
            // User has deleted their account — store a sentinel so the card
            // can display a clear "Deleted Account" label instead of a raw UID.
            newProfiles[uid] = {
              name: 'Deleted Account',
              photoURL: null,
              deleted: true,
            };
          }
        } catch (_) { /* network error — will fall back to uid display */ }
      }

      if (cancelled) return;
      if (Object.keys(newProfiles).length > 0) {
        setUserProfiles((prev) => ({ ...prev, ...newProfiles }));
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [clips]);

  // Resolve clip thumbnails — backend thumbnailPath first, then client-side
  // fallback via expo-video-thumbnails once video URLs are available.
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolveThumbs() {
      const newThumbs = {};

      for (const c of clips) {
        if (thumbnails[c.id]) continue; // already resolved

        // Step 1: try backend thumbnail from thumbnailPath
        if (c.thumbnailPath) {
          try {
            const url = await getDownloadURL(ref(storage, c.thumbnailPath));
            newThumbs[c.id] = url;
            continue; // success — skip fallback
          } catch (_) { /* fall through to client-side */ }
        }

        // Step 2: client-side fallback from resolved video URL
        const vidUrl = videoUrls[c.id];
        if (vidUrl) {
          try {
            const thumb = await VideoThumbnails.getThumbnailAsync(vidUrl, { time: 0 });
            newThumbs[c.id] = thumb.uri;
          } catch (_) { /* no thumbnail — placeholder will show */ }
        }
      }

      if (cancelled) return;
      if (Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    }

    resolveThumbs();
    return () => { cancelled = true; };
  }, [clips, videoUrls]);

  // Resolve clip video URLs from storagePath via Firebase Storage
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolveVideos() {
      const newUrls = {};

      for (const c of clips) {
        if (videoUrls[c.id]) continue; // already resolved
        // storagePath is the authoritative playback path set by the backend.
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

  const handleUnhide = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Unhide Clip',
      `This will make the clip by ${uploaderName} visible to all users again. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unhide',
          onPress: async () => {
            setUnhiding(clip.id);
            try {
              await callFunction('unhideClip', { clipId: clip.id });
            } catch (err) {
              if (__DEV__) console.error('unhideClip error:', err);
              Alert.alert(
                'Unhide Failed',
                err?.message || 'Could not unhide clip. Please try again.'
              );
            } finally {
              setUnhiding(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  const handleDelete = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Delete Clip',
      `Permanently delete this clip by ${uploaderName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(clip.id);
            try {
              await callFunction('deleteClip', { clipId: clip.id });
              // Clip will disappear from the list once Firestore snapshot updates
            } catch (err) {
              if (__DEV__) console.error('deleteClip error:', err);
              Alert.alert(
                'Delete Failed',
                err?.message || 'Could not delete clip. Please try again.'
              );
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  /** Resolve hiddenBy to a human-readable string. */
  const getHiddenByLabel = (clip) => {
    if (clip.hiddenBy === 'auto-moderation') return 'Auto-moderation';
    if (!clip.hiddenBy) return 'Unknown';
    return userProfiles[clip.hiddenBy]?.name || clip.hiddenBy;
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
          <Ionicons name="videocam-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Hidden Clips</Text>
          <Text style={styles.emptyText}>
            There are no currently hidden clips.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const autoCount = clips.filter((c) => c.autoModerated).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {clips.length} hidden {clips.length === 1 ? 'clip' : 'clips'}
        </Text>
        {autoCount > 0 && (
          <View style={styles.autoPill}>
            <Text style={styles.autoPillText}>
              {autoCount} auto-moderated
            </Text>
          </View>
        )}
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
          const isDeletedAccount = uploaderProfile?.deleted === true;
          const uploaderName = uploaderProfile?.name || uploaderUid || 'Unknown';
          const uploaderPhoto = isDeletedAccount ? null : uploaderProfile?.photoURL;
          const uploaderInitials = isDeletedAccount ? '?' : getInitials(uploaderName !== uploaderUid ? uploaderName : null);
          const isAutoMod = clip.autoModerated === true;
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
                  {/* Hidden badge overlay */}
                  <View style={styles.hiddenOverlayBadge}>
                    <Ionicons name="eye-off" size={12} color="#fff" />
                    <Text style={styles.hiddenOverlayText}>Hidden</Text>
                  </View>
                  {/* Auto-mod badge */}
                  {isAutoMod && (
                    <View style={styles.autoModOverlay}>
                      <Ionicons name="flash" size={10} color="#FBBF24" />
                      <Text style={styles.autoModOverlayText}>Auto</Text>
                    </View>
                  )}
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
                  <View style={styles.uploaderNameRow}>
                    <Text style={[styles.uploaderName, isDeletedAccount && styles.deletedAccountName]} numberOfLines={1}>
                      {uploaderName}
                    </Text>
                    {isDeletedAccount && (
                      <View style={styles.deletedBadge}>
                        <Text style={styles.deletedBadgeText}>Deleted</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.clipIdText} numberOfLines={1}>
                    {clip.id}
                  </Text>
                </View>
              </View>

              {/* Hidden by — resolved to display name */}
              <View style={styles.metaRow}>
                <Ionicons name="shield-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Hidden by: </Text>
                <Text style={styles.metaText}>
                  {getHiddenByLabel(clip)}
                </Text>
              </View>

              {/* Reason */}
              {clip.hiddenReason ? (
                <View style={styles.metaRow}>
                  <Ionicons name="alert-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Reason: </Text>
                  <Text style={styles.metaText} numberOfLines={2}>
                    {clip.hiddenReason}
                  </Text>
                </View>
              ) : null}

              {/* Hidden date */}
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Hidden: </Text>
                <Text style={styles.metaText}>
                  {formatRelativeTime(clip.hiddenAt)}
                </Text>
              </View>

              {/* Unhide button — hidden when account is deleted (no point unhiding) */}
              {!isDeletedAccount && (
                <TouchableOpacity
                  style={styles.unhideBtn}
                  onPress={() => handleUnhide(clip)}
                  disabled={unhiding === clip.id}
                  activeOpacity={0.7}
                >
                  {unhiding === clip.id ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <>
                      <Ionicons name="eye-outline" size={16} color="#3B82F6" />
                      <Text style={styles.unhideBtnText}>Unhide Clip</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Delete button — shown for all clips, primary action for deleted accounts */}
              <TouchableOpacity
                style={[styles.deleteBtn, isDeletedAccount && styles.deleteBtnPrimary]}
                onPress={() => handleDelete(clip)}
                disabled={deleting === clip.id}
                activeOpacity={0.7}
              >
                {deleting === clip.id ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text style={styles.deleteBtnText}>
                      {isDeletedAccount ? 'Delete Clip (Account Deleted)' : 'Delete Clip'}
                    </Text>
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
    autoPill: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderRadius: RADIUS.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    autoPillText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#FBBF24' : '#92400E',
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
    hiddenOverlayBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(220, 38, 38, 0.85)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    hiddenOverlayText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },
    autoModOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(0,0,0,0.65)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    autoModOverlayText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FBBF24',
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

    // Meta rows (below thumbnail)
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

    // Unhide button
    unhideBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
      borderColor: isDark ? '#1E40AF' : '#93C5FD',
      marginHorizontal: SPACING.md,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    unhideBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#60A5FA' : '#1D4ED8',
    },

    // Delete button
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      backgroundColor: isDark ? '#2D1010' : '#FEF2F2',
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
      marginHorizontal: SPACING.md,
      marginTop: SPACING.xs,
      marginBottom: SPACING.md,
    },
    deleteBtnPrimary: {
      // Slightly stronger background when this is the only action (deleted account)
      backgroundColor: isDark ? '#3D1010' : '#FEE2E2',
      borderColor: isDark ? '#991B1B' : '#FCA5A5',
    },
    deleteBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: '#EF4444',
    },

    // Deleted account indicators
    uploaderNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    deletedAccountName: {
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    deletedBadge: {
      backgroundColor: isDark ? '#3D1010' : '#FEE2E2',
      borderRadius: RADIUS.full,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    deletedBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#EF4444',
    },
  });
