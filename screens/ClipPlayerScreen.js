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

import React, { useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

/**
 * ClipPlayerScreen
 *
 * @param {object} props
 * @param {object} props.route   — React Navigation route; carries { videoUrl }.
 * @param {object} props.navigation — React Navigation prop; used for goBack().
 * @returns {JSX.Element}
 */
export default function ClipPlayerScreen({ route, navigation }) {
  const { videoUrl } = route.params;
  const videoRef = useRef(null);

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
});
