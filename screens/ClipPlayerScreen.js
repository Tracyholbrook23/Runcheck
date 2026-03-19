/**
 * ClipPlayerScreen.js — Full-Screen TikTok-Style Clip Player
 *
 * Opened by navigating to the "ClipPlayer" route from RunDetailsScreen.
 * Receives a single `videoUrl` route param — the Firebase Storage download
 * URL already resolved by RunDetailsScreen before navigation.
 *
 * Layout:
 *   • Edge-to-edge black container (no safe-area insets, no header).
 *   • Video fills the entire screen with resizeMode="cover" (TikTok fill).
 *   • White circular close button at top-right dismisses via goBack().
 *
 * Playback:
 *   • Autoplays on mount (shouldPlay).
 *   • Loops continuously (isLooping).
 *   • Pauses and unloads the video before navigating back to free resources.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { ReportModal } from '../components';
import { useIsAdmin, useAuth } from '../hooks';
import { callFunction, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// Category display config — shared palette for caption/category badges
const CATEGORY_CONFIG = {
  vibe:      { label: 'Vibe',      color: '#8B5CF6' },
  highlight: { label: 'Highlight', color: '#F59E0B' },
  energy:    { label: 'Energy',    color: '#EF4444' },
  funny:     { label: 'Funny',     color: '#22C55E' },
};

/**
 * ClipPlayerScreen
 *
 * @param {object} props
 * @param {object} props.route   — React Navigation route; carries { videoUrl }.
 * @param {object} props.navigation — React Navigation prop; used for goBack().
 * @returns {JSX.Element}
 */
export default function ClipPlayerScreen({ route, navigation }) {
  const { videoUrl, clipId } = route.params;
  const [showReport, setShowReport] = useState(false);
  const { isAdmin } = useIsAdmin();
  const [featuring, setFeaturing] = useState(false);
  const { userId: currentUid } = useAuth();

  // Clip metadata fetched from Firestore
  const [clipMeta, setClipMeta] = useState({ caption: null, category: null, uploaderUid: null, taggedPlayers: [] });
  const [deleting, setDeleting] = useState(false);
  const [addingToProfile, setAddingToProfile] = useState(false);

  // Playback state — loading, buffering, and error feedback
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  // Ref so the statusChange listener can check if initial load has completed
  // without depending on stale closure state
  const videoLoadedRef = useRef(false);

  // expo-video player instance — autoplay on mount, no looping
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  // Derived: is the current user tagged in this clip?
  const myTagEntry = currentUid
    ? clipMeta.taggedPlayers.find((p) => p.uid === currentUid)
    : null;
  const isTaggedUser = !!myTagEntry;
  const alreadyAddedToProfile = myTagEntry?.addedToProfile === true;

  useEffect(() => {
    if (!clipId) return;
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'gymClips', clipId));
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          setClipMeta({
            caption: d.caption || null,
            category: d.category || null,
            uploaderUid: d.uploaderUid || d.uid || null,
            taggedPlayers: Array.isArray(d.taggedPlayers) ? d.taggedPlayers : [],
          });
        }
      } catch (_) { /* silently ignore — older clips may not exist */ }
    })();

    return () => { cancelled = true; };
  }, [clipId]);

  // Track player status for loading/error states
  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        videoLoadedRef.current = true;
        setVideoLoaded(true);
        setIsBuffering(false);
      } else if (status === 'loading') {
        // Only show buffering spinner after the initial load has completed —
        // before that the full-screen loading spinner is already shown.
        if (videoLoadedRef.current) setIsBuffering(true);
      } else if (status === 'error') {
        if (__DEV__) console.error('playback error:', error);
        setPlaybackError(true);
      }
    });
    return () => statusSub.remove();
  }, [player]);

  const handleFeature = async () => {
    if (!clipId || featuring) return;
    setFeaturing(true);
    try {
      const result = await callFunction('featureClip', { clipId });
      if (result.alreadyFeatured) {
        Alert.alert('Already Featured', 'This clip is already featured.');
      } else {
        Alert.alert('Clip Featured', 'This clip has been added to featured clips.');
      }
    } catch (err) {
      if (__DEV__) console.error('featureClip error:', err);
      Alert.alert('Feature Failed', err?.message || 'Could not feature clip. Please try again.');
    } finally {
      setFeaturing(false);
    }
  };

  const handleDelete = () => {
    if (!clipId || deleting) return;
    Alert.alert(
      'Delete Clip',
      'This clip will be removed from all feeds. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const result = await callFunction('deleteClip', { clipId });
              if (result.alreadyDeleted) {
                Alert.alert('Already Deleted', 'This clip was already deleted.');
              }
              // Navigate back regardless — clip is gone from feeds
              navigation.goBack();
            } catch (err) {
              if (__DEV__) console.error('deleteClip error:', err);
              Alert.alert('Delete Failed', err?.message || 'Could not delete clip. Please try again.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleAddToProfile = async () => {
    if (!clipId || !currentUid || addingToProfile || alreadyAddedToProfile) return;
    setAddingToProfile(true);
    try {
      await callFunction('addClipToProfile', { clipId });
      // Update local state so the button reflects the change immediately
      const updatedTaggedPlayers = clipMeta.taggedPlayers.map((p) =>
        p.uid === currentUid ? { ...p, addedToProfile: true } : p,
      );
      setClipMeta((prev) => ({ ...prev, taggedPlayers: updatedTaggedPlayers }));
      Alert.alert('Added!', 'This clip now appears on your profile.');
    } catch (err) {
      if (__DEV__) console.error('addToProfile error:', err);
      Alert.alert('Failed', err?.message || 'Could not add clip to your profile.');
    } finally {
      setAddingToProfile(false);
    }
  };

  /**
   * handleClose — Pauses the video before going back. The player is
   * automatically released by the useVideoPlayer hook on unmount.
   */
  const handleClose = () => {
    try { player.pause(); } catch { /* ignore teardown */ }
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls
      />

      {/* Playback error state — full-screen overlay with recovery action */}
      {playbackError && (
        <View style={styles.playbackOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 12 }} />
          <Text style={styles.playbackErrorText}>Couldn't play this clip</Text>
          <TouchableOpacity style={styles.playbackGoBackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.playbackGoBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading spinner — shown until video reports isLoaded */}
      {!videoLoaded && !playbackError && (
        <View style={styles.playbackOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Buffering spinner — shown when playback stalls mid-video */}
      {videoLoaded && isBuffering && !playbackError && (
        <View style={styles.playbackOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* Close button — top-right, white circle */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Report button — below close button */}
      {clipId && (
        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => setShowReport(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="flag-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Feature button — admin only, below report button */}
      {clipId && isAdmin && (
        <TouchableOpacity
          style={styles.featureButton}
          onPress={handleFeature}
          disabled={featuring}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {featuring ? (
            <ActivityIndicator size="small" color="#FBBF24" />
          ) : (
            <Ionicons name="star-outline" size={20} color="#FBBF24" />
          )}
        </TouchableOpacity>
      )}

      {/* Delete button — uploader only, below feature/report button */}
      {clipId && currentUid && clipMeta.uploaderUid === currentUid && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={deleting}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          )}
        </TouchableOpacity>
      )}

      {/* Caption + category + tagged players overlay — bottom-left, TikTok-style */}
      {(clipMeta.caption || clipMeta.category || clipMeta.taggedPlayers.length > 0) && (
        <View style={styles.captionOverlay}>
          {clipMeta.category && CATEGORY_CONFIG[clipMeta.category] && (
            <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_CONFIG[clipMeta.category].color }]}>
              <Text style={styles.categoryBadgeText}>
                {CATEGORY_CONFIG[clipMeta.category].label}
              </Text>
            </View>
          )}
          {clipMeta.caption && (
            <Text style={styles.captionText} numberOfLines={3}>
              {clipMeta.caption}
            </Text>
          )}
          {clipMeta.taggedPlayers.length > 0 && (
            <View style={styles.taggedRow}>
              <Ionicons name="people" size={12} color="rgba(255,255,255,0.55)" />
              {clipMeta.taggedPlayers.map((p) => (
                <TouchableOpacity
                  key={p.uid}
                  activeOpacity={0.7}
                  onPress={() => {
                    try { player.pause(); } catch { /* ignore teardown */ }
                    navigation.navigate('Home', { screen: 'UserProfile', params: { userId: p.uid } });
                  }}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                >
                  <Text style={styles.taggedChipText} numberOfLines={1}>@{p.displayName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* "Add to my profile" — shown only to tagged users who haven't added yet */}
          {isTaggedUser && !alreadyAddedToProfile && (
            <TouchableOpacity
              style={styles.addToProfileBtn}
              onPress={handleAddToProfile}
              disabled={addingToProfile}
              activeOpacity={0.8}
            >
              {addingToProfile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={14} color="#fff" />
                  <Text style={styles.addToProfileText}>Add to my profile</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {isTaggedUser && alreadyAddedToProfile && (
            <View style={styles.addedToProfileBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
              <Text style={styles.addedToProfileText}>On your profile</Text>
            </View>
          )}
        </View>
      )}

      {/* Report modal */}
      {clipId && (
        <ReportModal
          visible={showReport}
          onClose={() => setShowReport(false)}
          type="clip"
          targetId={clipId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  playbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  playbackErrorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  playbackGoBackBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  playbackGoBackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportButton: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureButton: {
    position: 'absolute',
    top: 148,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  deleteButton: {
    position: 'absolute',
    top: 196,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Caption + category overlay (bottom-left)
  captionOverlay: {
    position: 'absolute',
    bottom: 48,
    left: 16,
    right: 72,
    gap: 6,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  captionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    lineHeight: 20,
  },
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  taggedChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 120,
  },
  addToProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 2,
  },
  addToProfileText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  addedToProfileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 2,
  },
  addedToProfileText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#22C55E',
  },
});
