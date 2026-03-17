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

import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
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
  const videoRef = useRef(null);
  const [showReport, setShowReport] = useState(false);
  const { isAdmin } = useIsAdmin();
  const [featuring, setFeaturing] = useState(false);
  const { userId: currentUid } = useAuth();

  // Clip metadata fetched from Firestore
  const [clipMeta, setClipMeta] = useState({ caption: null, category: null, uploaderUid: null });
  const [deleting, setDeleting] = useState(false);

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
          });
        }
      } catch (_) { /* silently ignore — older clips may not exist */ }
    })();

    return () => { cancelled = true; };
  }, [clipId]);

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
      console.error('featureClip error:', err);
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
              console.error('deleteClip error:', err);
              Alert.alert('Delete Failed', err?.message || 'Could not delete clip. Please try again.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  /**
   * handleClose — Pauses + unloads the video before going back so the
   * underlying audio session is released immediately.
   */
  const handleClose = async () => {
    try {
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
        await videoRef.current.unloadAsync();
      }
    } catch {
      // Ignore teardown errors — we're closing regardless.
    }
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFill}
        source={{ uri: videoUrl }}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        useNativeControls
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded && status.didJustFinish) {
            console.log('[ClipPlayer] playback finished');
          }
        }}
      />

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

      {/* Caption + category overlay — bottom-left, TikTok-style */}
      {(clipMeta.caption || clipMeta.category) && (
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
});
