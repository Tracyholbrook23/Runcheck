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

import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { ReportModal } from '../components';
import { useIsAdmin } from '../hooks';
import { callFunction } from '../config/firebase';

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
});
