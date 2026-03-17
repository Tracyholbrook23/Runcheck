/**
 * AdminAllClipsScreen.js — Browse & Manage All Clips
 *
 * Admin browser for the full `gymClips` collection with filter modes:
 *   - All (newest first)
 *   - By Gym (gym picker → newest first within that gym)
 *   - Hidden (isHidden === true)
 *   - Featured (isDailyHighlight === true)
 *
 * Each card shows thumbnail, uploader info, gym name, relative time, status
 * badges (hidden / featured / processing), and contextual admin actions
 * (Feature, Unfeature, Hide, Unhide).
 *
 * Modeled on AdminFeaturedClipsScreen for consistency.
 *
 * Uses a real-time `onSnapshot` listener (limit 25 for All / By Gym modes).
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
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin, useGyms } from '../hooks';
import { db, callFunction, storage } from '../config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_MODES = [
  { key: 'all', label: 'All' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'mostLiked', label: 'Most Liked' },
  { key: 'byGym', label: 'By Gym' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'featured', label: 'Featured' },
];

const PAGE_LIMIT = 25;

// Candidates mode over-fetches to compensate for client-side filtering
const CANDIDATES_FETCH_LIMIT = 75;

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

export default function AdminAllClipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { gyms } = useGyms();

  // Filter state
  const [filterMode, setFilterMode] = useState('all');
  const [selectedGymId, setSelectedGymId] = useState(null);
  const [gymPickerVisible, setGymPickerVisible] = useState(false);

  // Data state
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Action state — tracks which clipId has an action in progress
  const [actioning, setActioning] = useState(null);

  // Resolved user data: uid → { name, photoURL }
  const [userProfiles, setUserProfiles] = useState({});
  // Resolved clip thumbnails: clipId → url
  const [thumbnails, setThumbnails] = useState({});
  // Resolved clip video URLs: clipId → download URL
  const [videoUrls, setVideoUrls] = useState({});

  // Build a gymId → gymName lookup from the gyms array
  const gymNameMap = useMemo(() => {
    const map = {};
    for (const g of gyms) {
      map[g.id] = g.name || g.id;
    }
    return map;
  }, [gyms]);

  // Selected gym label for the filter bar
  const selectedGymName = selectedGymId ? (gymNameMap[selectedGymId] || selectedGymId) : null;

  // ── Real-time listener — rebuilds when filterMode or selectedGymId changes ─
  useEffect(() => {
    if (!isAdmin) return;

    let q;

    if (filterMode === 'all') {
      q = query(
        collection(db, 'gymClips'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_LIMIT)
      );
    } else if (filterMode === 'candidates') {
      // Over-fetch by likesCount, then client-side filter for feature-worthy clips
      q = query(
        collection(db, 'gymClips'),
        orderBy('likesCount', 'desc'),
        limit(CANDIDATES_FETCH_LIMIT)
      );
    } else if (filterMode === 'mostLiked') {
      q = query(
        collection(db, 'gymClips'),
        orderBy('likesCount', 'desc'),
        limit(PAGE_LIMIT)
      );
    } else if (filterMode === 'byGym') {
      if (!selectedGymId) {
        // No gym selected yet — show empty until they pick one
        setClips([]);
        setLoading(false);
        return;
      }
      q = query(
        collection(db, 'gymClips'),
        where('gymId', '==', selectedGymId),
        orderBy('createdAt', 'desc'),
        limit(PAGE_LIMIT)
      );
    } else if (filterMode === 'hidden') {
      q = query(
        collection(db, 'gymClips'),
        where('isHidden', '==', true)
      );
    } else if (filterMode === 'featured') {
      q = query(
        collection(db, 'gymClips'),
        where('isDailyHighlight', '==', true)
      );
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Candidates mode: client-side filter for feature-worthy clips
        // Already sorted by likesCount desc from Firestore, so just filter + cap
        if (filterMode === 'candidates') {
          docs = docs.filter((c) =>
            c.isHidden !== true &&
            c.isDailyHighlight !== true &&
            (c.status === 'ready' || c.status === 'ready_raw') &&
            !!c.storagePath &&
            (c.likesCount || 0) > 0
          ).slice(0, PAGE_LIMIT);
        }

        // Client-side sort for Hidden / Featured modes (matching existing admin screens)
        if (filterMode === 'hidden') {
          docs.sort((a, b) => {
            const aDate = a.hiddenAt?.toDate?.() || new Date(0);
            const bDate = b.hiddenAt?.toDate?.() || new Date(0);
            return bDate - aDate;
          });
        } else if (filterMode === 'featured') {
          docs.sort((a, b) => {
            const aDate = (a.featuredAt || a.createdAt)?.toDate?.() || new Date(0);
            const bDate = (b.featuredAt || b.createdAt)?.toDate?.() || new Date(0);
            return bDate - aDate;
          });
        }

        // Minimal exclusion: only drop docs missing both storagePath and status
        // (these are abandoned reservation stubs, not real clips)
        if (filterMode !== 'candidates') {
          docs = docs.filter((c) => c.storagePath || c.status);
        }

        setClips(docs);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('AdminAllClipsScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [isAdmin, filterMode, selectedGymId]);

  // ── Resolve user profiles ─────────────────────────────────────────────────
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolve() {
      const newProfiles = {};
      const idsToFetch = new Set();

      for (const c of clips) {
        const uploaderUid = c.uploaderUid || c.uid;
        if (uploaderUid && !userProfiles[uploaderUid]) idsToFetch.add(uploaderUid);
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

  // ── Resolve clip thumbnails ───────────────────────────────────────────────
  useEffect(() => {
    if (clips.length === 0) return;
    let cancelled = false;

    async function resolveThumbs() {
      const newThumbs = {};

      for (const c of clips) {
        if (thumbnails[c.id]) continue;

        // Step 1: try backend thumbnail from thumbnailPath
        if (c.thumbnailPath) {
          try {
            const url = await getDownloadURL(ref(storage, c.thumbnailPath));
            newThumbs[c.id] = url;
            continue;
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

  // ── Resolve clip video URLs ───────────────────────────────────────────────
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

  // ── Refresh handler ───────────────────────────────────────────────────────
  const handleRefresh = () => {
    setRefreshing(true);
    // The onSnapshot listener auto-refreshes; this just resets the indicator
    setTimeout(() => setRefreshing(false), 1500);
  };

  // ── Filter mode switching ─────────────────────────────────────────────────
  const handleFilterChange = useCallback((mode) => {
    if (mode === filterMode) return;
    setFilterMode(mode);
    // Reset clips so loading state shows cleanly
    setClips([]);
    if (mode === 'byGym') {
      // Open gym picker if no gym selected yet
      if (!selectedGymId) {
        setGymPickerVisible(true);
      }
    }
  }, [filterMode, selectedGymId]);

  const handleGymSelect = useCallback((gymId) => {
    setSelectedGymId(gymId);
    setGymPickerVisible(false);
    // If we're not already in byGym mode, switch to it
    if (filterMode !== 'byGym') {
      setFilterMode('byGym');
    }
  }, [filterMode]);

  // ── Admin actions ─────────────────────────────────────────────────────────
  const handleFeature = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Feature Clip',
      `Feature this clip by ${uploaderName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Feature',
          onPress: async () => {
            setActioning(clip.id);
            try {
              const result = await callFunction('featureClip', { clipId: clip.id });
              if (result.alreadyFeatured) {
                Alert.alert('Already Featured', 'This clip is already featured.');
              } else {
                Alert.alert('Clip Featured', 'This clip has been added to featured clips.');
              }
            } catch (err) {
              console.error('featureClip error:', err);
              Alert.alert('Feature Failed', err?.message || 'Could not feature clip.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  const handleUnfeature = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Unfeature Clip',
      `Remove this clip by ${uploaderName} from featured clips?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfeature',
          onPress: async () => {
            setActioning(clip.id);
            try {
              await callFunction('unfeatureClip', { clipId: clip.id });
            } catch (err) {
              console.error('unfeatureClip error:', err);
              Alert.alert('Unfeature Failed', err?.message || 'Could not unfeature clip.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  const handleHide = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Hide Clip',
      `Hide this clip by ${uploaderName}? It will be removed from all user-facing surfaces.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: async () => {
            setActioning(clip.id);
            try {
              const result = await callFunction('hideClip', { clipId: clip.id, reason: 'Admin action from All Clips browser' });
              if (result.alreadyHidden) {
                Alert.alert('Already Hidden', 'This clip is already hidden.');
              } else {
                Alert.alert('Clip Hidden', 'This clip has been hidden from users.');
              }
            } catch (err) {
              console.error('hideClip error:', err);
              Alert.alert('Hide Failed', err?.message || 'Could not hide clip.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  const handleUnhide = useCallback((clip) => {
    const uploaderUid = clip.uploaderUid || clip.uid;
    const uploaderName = userProfiles[uploaderUid]?.name || uploaderUid || 'Unknown';

    Alert.alert(
      'Unhide Clip',
      `Make this clip by ${uploaderName} visible to all users again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unhide',
          onPress: async () => {
            setActioning(clip.id);
            try {
              await callFunction('unhideClip', { clipId: clip.id });
            } catch (err) {
              console.error('unhideClip error:', err);
              Alert.alert('Unhide Failed', err?.message || 'Could not unhide clip.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  }, [userProfiles]);

  // ── Gym picker modal ──────────────────────────────────────────────────────
  const renderGymPicker = () => (
    <Modal
      visible={gymPickerVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setGymPickerVisible(false)}
    >
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Gym</Text>
          <TouchableOpacity onPress={() => setGymPickerVisible(false)}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={gyms.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modalList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.gymRow,
                selectedGymId === item.id && styles.gymRowSelected,
              ]}
              activeOpacity={0.7}
              onPress={() => handleGymSelect(item.id)}
            >
              <Text
                style={[
                  styles.gymRowText,
                  selectedGymId === item.id && styles.gymRowTextSelected,
                ]}
                numberOfLines={1}
              >
                {item.name || item.id}
              </Text>
              {selectedGymId === item.id && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );

  // ── Admin gate ────────────────────────────────────────────────────────────
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

  // ── Summary text ──────────────────────────────────────────────────────────
  let summaryLabel = '';
  if (filterMode === 'all') {
    summaryLabel = `${clips.length} clip${clips.length === 1 ? '' : 's'} (newest)`;
  } else if (filterMode === 'candidates') {
    summaryLabel = `${clips.length} candidate${clips.length === 1 ? '' : 's'} to feature`;
  } else if (filterMode === 'mostLiked') {
    summaryLabel = `${clips.length} clip${clips.length === 1 ? '' : 's'} (most liked)`;
  } else if (filterMode === 'byGym') {
    const gn = selectedGymName || 'none selected';
    summaryLabel = `${clips.length} clip${clips.length === 1 ? '' : 's'} at ${gn}`;
  } else if (filterMode === 'hidden') {
    summaryLabel = `${clips.length} hidden clip${clips.length === 1 ? '' : 's'}`;
  } else if (filterMode === 'featured') {
    summaryLabel = `${clips.length} featured clip${clips.length === 1 ? '' : 's'}`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {renderGymPicker()}

      {/* ── Filter bar (horizontally scrollable for narrow screens) ──── */}
      <View style={styles.filterBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}
        >
          {FILTER_MODES.map((mode) => {
            const isActive = filterMode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                activeOpacity={0.7}
                onPress={() => handleFilterChange(mode.key)}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Gym selector button (visible in byGym mode) */}
      {filterMode === 'byGym' && (
        <TouchableOpacity
          style={styles.gymSelectorBtn}
          activeOpacity={0.7}
          onPress={() => setGymPickerVisible(true)}
        >
          <Ionicons name="basketball-outline" size={16} color={colors.primary} />
          <Text style={styles.gymSelectorText} numberOfLines={1}>
            {selectedGymName || 'Select a gym…'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>{summaryLabel}</Text>
      </View>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : clips.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="videocam-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Clips Found</Text>
          <Text style={styles.emptyText}>
            {filterMode === 'byGym' && !selectedGymId
              ? 'Select a gym to browse its clips.'
              : filterMode === 'candidates'
                ? 'No liked, visible, un-featured clips found.'
                : 'No clips match the current filter.'}
          </Text>
        </View>
      ) : (
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
            const gymName = gymNameMap[clip.gymId] || clip.gymId || null;

            const isHidden = clip.isHidden === true;
            const isFeatured = clip.isDailyHighlight === true;
            const isProcessing = clip.status === 'pending' || clip.status === 'processing';
            const isActionInProgress = actioning === clip.id;

            return (
              <View key={clip.id} style={styles.card}>
                {/* Clip thumbnail preview — tappable to play */}
                <TouchableOpacity
                  activeOpacity={clipVideoUrl ? 0.7 : 1}
                  onPress={() => {
                    if (clipVideoUrl) {
                      navigation.navigate('ClipPlayer', {
                        videoUrl: clipVideoUrl,
                        clipId: clip.id,
                        gymId: clip.gymId,
                      });
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

                    {/* Status badges — top-left stack */}
                    <View style={styles.badgeStack}>
                      {isHidden && (
                        <View style={styles.hiddenBadge}>
                          <Ionicons name="eye-off" size={10} color="#fff" />
                          <Text style={styles.hiddenBadgeText}>Hidden</Text>
                        </View>
                      )}
                      {isFeatured && (
                        <View style={styles.featuredBadge}>
                          <Ionicons name="star" size={10} color="#fff" />
                          <Text style={styles.featuredBadgeText}>Featured</Text>
                        </View>
                      )}
                      {isProcessing && (
                        <View style={styles.processingBadge}>
                          <Ionicons name="hourglass-outline" size={10} color="#fff" />
                          <Text style={styles.processingBadgeText}>{clip.status}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Uploader row: avatar + name + gym */}
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
                    {gymName && (
                      <Text style={styles.gymLabel} numberOfLines={1}>
                        {gymName}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.timeLabel}>
                    {formatRelativeTime(clip.createdAt)}
                  </Text>
                </View>

                {/* Clip ID + like count */}
                <View style={styles.metaRow}>
                  <Text style={styles.clipIdText} numberOfLines={1}>
                    {clip.id}
                  </Text>
                  {(clip.likesCount > 0 || filterMode === 'mostLiked') && (
                    <View style={styles.likeCountPill}>
                      <Ionicons name="heart" size={10} color={isDark ? '#F87171' : '#DC2626'} />
                      <Text style={styles.likeCountText}>
                        {clip.likesCount || 0}
                      </Text>
                    </View>
                  )}
                </View>

                {/* ── Contextual action buttons ──────────────────────────── */}
                <View style={styles.actionRow}>
                  {isActionInProgress ? (
                    <View style={styles.actionLoading}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : (
                    <>
                      {/* Feature — only if not hidden and not already featured */}
                      {!isHidden && !isFeatured && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnFeature]}
                          activeOpacity={0.7}
                          onPress={() => handleFeature(clip)}
                        >
                          <Ionicons name="star-outline" size={14} color={isDark ? '#FBBF24' : '#92400E'} />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextFeature]}>Feature</Text>
                        </TouchableOpacity>
                      )}

                      {/* Unfeature — only if featured */}
                      {isFeatured && !isHidden && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnFeature]}
                          activeOpacity={0.7}
                          onPress={() => handleUnfeature(clip)}
                        >
                          <Ionicons name="star-half-outline" size={14} color={isDark ? '#FBBF24' : '#92400E'} />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextFeature]}>Unfeature</Text>
                        </TouchableOpacity>
                      )}

                      {/* Hide — only if not already hidden */}
                      {!isHidden && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnHide]}
                          activeOpacity={0.7}
                          onPress={() => handleHide(clip)}
                        >
                          <Ionicons name="eye-off-outline" size={14} color={isDark ? '#F87171' : '#DC2626'} />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextHide]}>Hide</Text>
                        </TouchableOpacity>
                      )}

                      {/* Unhide — only if hidden */}
                      {isHidden && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnUnhide]}
                          activeOpacity={0.7}
                          onPress={() => handleUnhide(clip)}
                        >
                          <Ionicons name="eye-outline" size={14} color={isDark ? '#60A5FA' : '#1D4ED8'} />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextUnhide]}>Unhide</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
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

    // ── Filter bar ────────────────────────────────────────────────────
    filterBarWrapper: {
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    filterBarContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      gap: SPACING.xs,
    },
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    },
    filterPillActive: {
      backgroundColor: isDark ? 'rgba(255,107,53,0.15)' : '#FFF3ED',
    },
    filterPillText: {
      fontSize: FONT_SIZES.small,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.bold,
    },

    // ── Gym selector (byGym mode) ────────────────────────────────────
    gymSelectorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginHorizontal: SPACING.md,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: RADIUS.sm,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    gymSelectorText: {
      flex: 1,
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textPrimary,
    },

    // ── Gym picker modal ─────────────────────────────────────────────
    modalSafe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    modalTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
    modalList: {
      padding: SPACING.md,
    },
    gymRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
      borderRadius: RADIUS.sm,
      marginBottom: SPACING.xs,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
    },
    gymRowSelected: {
      backgroundColor: isDark ? 'rgba(255,107,53,0.1)' : '#FFF3ED',
    },
    gymRowText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textPrimary,
      flex: 1,
    },
    gymRowTextSelected: {
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.bold,
    },

    // ── Summary bar ──────────────────────────────────────────────────
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    summaryText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textSecondary,
    },

    // ── Empty state ──────────────────────────────────────────────────
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

    // ── Card ─────────────────────────────────────────────────────────
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.sm,
      overflow: 'hidden',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },

    // ── Thumbnail ────────────────────────────────────────────────────
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

    // ── Status badges ────────────────────────────────────────────────
    badgeStack: {
      position: 'absolute',
      top: 8,
      left: 8,
      gap: 4,
    },
    hiddenBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(220, 38, 38, 0.85)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    hiddenBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },
    featuredBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(245, 158, 11, 0.85)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    featuredBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },
    processingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(107, 114, 128, 0.85)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    processingBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },

    // ── Uploader row ─────────────────────────────────────────────────
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
    gymLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    timeLabel: {
      fontSize: 11,
      color: colors.textMuted,
    },

    // ── Meta row ─────────────────────────────────────────────────────
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      marginBottom: 2,
    },
    clipIdText: {
      fontSize: 10,
      color: colors.textMuted,
      fontFamily: 'monospace',
      flex: 1,
    },
    likeCountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: isDark ? 'rgba(248,113,113,0.12)' : '#FEE2E2',
      borderRadius: RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    likeCountText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#F87171' : '#DC2626',
    },

    // ── Action row ───────────────────────────────────────────────────
    actionRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.md,
    },
    actionLoading: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
    },
    actionBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // Feature / Unfeature
    actionBtnFeature: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderColor: isDark ? '#92400E' : '#FCD34D',
    },
    actionBtnTextFeature: {
      color: isDark ? '#FBBF24' : '#92400E',
    },

    // Hide
    actionBtnHide: {
      backgroundColor: isDark ? '#451515' : '#FEE2E2',
      borderColor: isDark ? '#991B1B' : '#FCA5A5',
    },
    actionBtnTextHide: {
      color: isDark ? '#F87171' : '#DC2626',
    },

    // Unhide
    actionBtnUnhide: {
      backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
      borderColor: isDark ? '#1E40AF' : '#93C5FD',
    },
    actionBtnTextUnhide: {
      color: isDark ? '#60A5FA' : '#1D4ED8',
    },
  });
