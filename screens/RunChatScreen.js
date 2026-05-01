/**
 * RunChatScreen.js — Run Group Chat
 *
 * Real-time group chat for a specific run. Messages live in:
 *   runs/{runId}/messages/{messageId}
 *
 * Access rules (enforced in both UI and Firestore rules):
 *  - Participants only — users who have joined the run can read and send.
 *  - Non-participants cannot enter this screen (Chat button is hidden in
 *    RunDetailsScreen) and Firestore rules deny reads/writes.
 *  - If a user leaves the run while on this screen, `isParticipant` becomes
 *    false in real time (live `runParticipants` subscription via useGymRuns),
 *    the message subscription is torn down, messages are cleared, and a gated
 *    state is shown. No crash, no stale data.
 *
 * Participation source of truth:
 *    runParticipants/{runId}_{userId}  — deleted on leaveRun.
 *    exists() check is used in Firestore rules; joinedRunIds Set is used here.
 *
 * Route params:
 *   - runId    {string} — Firestore run document ID
 *   - gymId    {string} — Firestore gym document ID (needed for participation check)
 *   - gymName  {string} — Gym name shown in the header
 *
 * MVP scope (intentionally excluded):
 *   - Read receipts
 *   - Typing indicators
 *   - Message reactions
 *   - Media uploads
 *   - Pagination
 *   - Message deletion
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  Modal,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  ActionSheetIOS,
  ScrollView,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

// ─── Giphy ────────────────────────────────────────────────────────────────────
const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const GIPHY_TRENDING = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`;
const GIPHY_SEARCH   = (q) => `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { auth } from '../config/firebase';
import { useProfile } from '../hooks';
import { useGymRuns } from '../hooks/useGymRuns';
import { subscribeToRunMessages, sendRunMessage, sendRunMedia, markRunChatSeen, muteRunChat, unmuteRunChat, getRunChatMuteState, RUN_CHAT_EXPIRY_MS } from '../services/runChatService';
import { sanitizeFreeText } from '../utils/sanitize';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * formatMessageTime — Short timestamp for a message bubble.
 * Shows time only (e.g. "2:35 PM"). Handles Firestore Timestamps and Dates.
 */
function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * getInitials — Extracts up to 2 initials from a display name.
 * Used as a fallback when no avatar URL is available.
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * AvatarBubble — Small circular avatar for a message row.
 * Shows the image if available, otherwise shows initials on a colored background.
 */
function AvatarBubble({ uri, name, size = 32, colors }) {
  const [imgError, setImgError] = useState(false);

  if (uri && !imgError) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: FONT_WEIGHTS.bold }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

/**
 * MessageBubble — A single chat message row.
 *
 * Own messages (isOwn = true) are right-aligned with the primary color.
 * Other messages are left-aligned with sender name + avatar shown.
 */
function ReplyQuote({ replyTo, colors, onPress }) {
  if (!replyTo) return null;
  const previewText = replyTo.type === 'image'
    ? '📷 Photo'
    : replyTo.type === 'gif'
      ? '🎞 GIF'
      : replyTo.text || '';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[chatStyles.replyQuote, { backgroundColor: colors.background, borderLeftColor: colors.primary }]}
    >
      <Text style={[chatStyles.replyQuoteName, { color: colors.primary }]} numberOfLines={1}>
        {replyTo.senderName}
      </Text>
      <Text style={[chatStyles.replyQuoteText, { color: colors.textMuted }]} numberOfLines={2}>
        {previewText}
      </Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ message, isOwn, colors, onLongPress, onReplyQuotePress, onMediaPress }) {
  const isMedia = message.type === 'image' || message.type === 'gif';

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[
        chatStyles.messageRow,
        isOwn ? chatStyles.messageRowOwn : chatStyles.messageRowOther,
      ]}
    >
      {/* Avatar — only shown for other users' messages */}
      {!isOwn && (
        <View style={chatStyles.avatarWrapper}>
          <AvatarBubble
            uri={message.senderAvatar}
            name={message.senderName}
            size={30}
            colors={colors}
          />
        </View>
      )}

      <View style={[chatStyles.bubbleWrapper, isOwn && chatStyles.bubbleWrapperOwn]}>
        {/* Sender name — only shown for other users' messages */}
        {!isOwn && (
          <Text style={[chatStyles.senderName, { color: colors.textSecondary }]}>
            {message.senderName}
          </Text>
        )}

        <ReplyQuote
          replyTo={message.replyTo}
          colors={colors}
          onPress={() => onReplyQuotePress?.(message.replyTo?.messageId)}
        />

        {isMedia ? (
          /* Image / GIF bubble — tappable to full-screen */
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onMediaPress?.({ uri: message.mediaUrl, type: message.type })}
            onLongPress={onLongPress}
            delayLongPress={400}
            style={chatStyles.mediaBubble}
          >
            <Image
              source={{ uri: message.mediaUrl }}
              style={chatStyles.mediaImage}
              resizeMode="cover"
            />
            {message.type === 'gif' && (
              <View style={[chatStyles.gifBadge, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: FONT_WEIGHTS.bold }}>GIF</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View
            style={[
              chatStyles.bubble,
              isOwn
                ? [chatStyles.bubbleOwn, { backgroundColor: colors.primary }]
                : [chatStyles.bubbleOther, { backgroundColor: colors.surface, borderColor: colors.border }],
            ]}
          >
            <Text
              style={[
                chatStyles.bubbleText,
                { color: isOwn ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              {message.text}
            </Text>
          </View>
        )}

        <Text style={[chatStyles.messageTime, { color: colors.textMuted }]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RunChatScreen({ route, navigation }) {
  const { runId, gymId, gymName, startTime } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Current user identity
  const uid = auth.currentUser?.uid;
  const { profile } = useProfile();

  // Participation check.
  // `participantLoading` is true until useGymRuns has received its first
  // snapshot — during that window joinedRunIds is an empty Set, which looks
  // identical to "confirmed not a participant". We must not show the gated
  // state until we actually know whether the user is in the run.
  const { joinedRunIds, loading: participantLoading } = useGymRuns(gymId);
  const isParticipant = joinedRunIds.has(runId);

  // Mute state — loaded once on mount when participation is confirmed
  const [isMuted, setIsMuted] = useState(false);

  // Messages state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState(false);

  // ── Chat expiration ────────────────────────────────────────────────────────
  // The chat window closes RUN_CHAT_EXPIRY_MS after startTime.
  // After expiry: messages are still readable (history preserved) but the
  // input bar is hidden and new messages are blocked.
  //
  // startTime comes from route.params (set by MessagesScreen when navigating
  // here). It may be a Firestore Timestamp or a plain Date — handle both.
  // If startTime is absent (e.g., very old participant doc), treat as not expired.
  const isChatExpired = useMemo(() => {
    if (!startTime) return false;
    const startMs = startTime.toDate
      ? startTime.toDate().getTime()
      : new Date(startTime).getTime();
    return startMs + RUN_CHAT_EXPIRY_MS < Date.now();
  }, [startTime]);

  // Input state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // FlatList ref for auto-scroll
  const flatListRef = useRef(null);

  // ── Subscribe to messages — gated on confirmed participation ──────────────
  //
  // The subscription opens ONLY when BOTH conditions are true:
  //   1. participantLoading is false  — participation check has resolved
  //   2. isParticipant is true        — user is confirmed in the run
  //
  // Including participantLoading in the guard AND in the deps array is the
  // critical fix. Without it, React Strict Mode (used by all Expo dev builds)
  // double-invokes effects and can open the subscription in the gap between
  // the two invocations before loading fully resolves. This caused the
  // "Missing or insufficient permissions" Firestore error for non-participants.
  //
  // When isParticipant flips false mid-session (user left the run), the effect
  // cleanup unsubscribes, messages are cleared, and the gated state renders.
  useEffect(() => {
    if (!runId || participantLoading || !isParticipant) {
      // Not yet confirmed as participant — clear any stale messages and wait.
      setMessages([]);
      setMessagesError(false);
      return;
    }

    setMessagesLoading(true);
    setMessagesError(false);

    const unsubscribe = subscribeToRunMessages(runId, (newMessages, error) => {
      if (error) {
        // Firestore denied the read — treat as access lost, not a crash.
        if (__DEV__) console.warn('[RunChatScreen] messages subscription denied:', error);
        setMessagesError(true);
        setMessagesLoading(false);
        return;
      }
      setMessages(newMessages);
      setMessagesLoading(false);
    });

    return unsubscribe;
  }, [runId, participantLoading, isParticipant]);

  // ── Mark chat as seen when user opens it ──────────────────────────────────
  // Clears the unread badge on HomeScreen. Fires as soon as participant status
  // is confirmed. Non-fatal if it fails (unread badge may stay until next open).
  useEffect(() => {
    if (!runId || !uid || !isParticipant) return;
    markRunChatSeen(runId, uid);
  }, [runId, uid, isParticipant]);

  // ── Load initial mute state ────────────────────────────────────────────────
  // Reads once when participation is confirmed. Non-fatal on error.
  useEffect(() => {
    if (!runId || !uid || !isParticipant) return;
    getRunChatMuteState(runId, uid).then(setIsMuted).catch(() => {});
  }, [runId, uid, isParticipant]);

  // ── Mute toggle ────────────────────────────────────────────────────────────
  const handleMuteToggle = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next); // optimistic
    try {
      if (next) {
        await muteRunChat(runId, uid);
      } else {
        await unmuteRunChat(runId, uid);
      }
    } catch {
      setIsMuted(!next); // revert on error
    }
  }, [isMuted, runId, uid]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    // Small delay gives the FlatList time to lay out before scrolling
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // ── Image / media state ────────────────────────────────────────────────────
  const [imageUploading, setImageUploading] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState(null); // { uri, type }

  // ── GIF picker state ───────────────────────────────────────────────────────
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifSearching, setGifSearching] = useState(false);
  const gifDebounce = useRef(null);

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (!showGifPicker) return;
    setGifSearching(true);
    fetch(GIPHY_TRENDING)
      .then((r) => r.json())
      .then((json) => setGifResults(json.data || []))
      .catch(() => setGifResults([]))
      .finally(() => setGifSearching(false));
  }, [showGifPicker]);

  // Debounced GIF search
  useEffect(() => {
    clearTimeout(gifDebounce.current);
    if (!gifQuery.trim()) return;
    setGifSearching(true);
    gifDebounce.current = setTimeout(() => {
      fetch(GIPHY_SEARCH(gifQuery.trim()))
        .then((r) => r.json())
        .then((json) => setGifResults(json.data || []))
        .catch(() => setGifResults([]))
        .finally(() => setGifSearching(false));
    }, 400);
    return () => clearTimeout(gifDebounce.current);
  }, [gifQuery]);

  const handleSendGif = useCallback(async (gif) => {
    setShowGifPicker(false);
    setGifQuery('');
    const gifUrl = gif?.images?.fixed_height?.url || gif?.images?.original?.url;
    if (!gifUrl || !runId || !uid) return;
    try {
      await sendRunMedia({
        runId,
        senderId: uid,
        senderName: profile?.name || 'Player',
        senderAvatar: profile?.photoURL || null,
        mediaType: 'gif',
        mediaUrl: gifUrl,
      });
    } catch (err) {
      if (__DEV__) console.warn('[RunChat] gif send error:', err);
    }
  }, [runId, uid, profile]);

  const handleAttach = useCallback(() => {
    if (!isParticipant || isChatExpired) return;

    const doPickImage = async (source) => {
      try {
        let result;
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Camera access required', 'Please enable camera access in Settings.');
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.75,
            allowsEditing: true,
          });
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Photo access required', 'Please enable photo library access in Settings.');
            return;
          }
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.75,
          });
        }

        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset?.uri) return;

        setImageUploading(true);
        // Upload to Firebase Storage
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const ext = asset.uri.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${uid}.${ext}`;
        const storageRef = ref(storage, `runChatImages/${runId}/${fileName}`);
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, blob);
          task.on('state_changed', null, reject, resolve);
        });
        const downloadUrl = await getDownloadURL(storageRef);

        await sendRunMedia({
          runId,
          senderId: uid,
          senderName: profile?.name || 'Player',
          senderAvatar: profile?.photoURL || null,
          mediaType: 'image',
          mediaUrl: downloadUrl,
        });
      } catch (err) {
        if (__DEV__) console.error('[RunChatScreen] image upload error:', err);
        Alert.alert('Upload failed', 'Could not send the photo. Please try again.');
      } finally {
        setImageUploading(false);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library', 'GIF'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) doPickImage('camera');
          if (idx === 2) doPickImage('library');
          if (idx === 3) setShowGifPicker(true);
        },
      );
    } else {
      Alert.alert('Add Photo', null, [
        { text: 'Take Photo', onPress: () => doPickImage('camera') },
        { text: 'Choose from Library', onPress: () => doPickImage('library') },
        { text: 'GIF', onPress: () => setShowGifPicker(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [isParticipant, isChatExpired, runId, uid, profile]);

  // ── Reply state ────────────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState(null);
  const inputRef = useRef(null);

  const handleReply = useCallback((message) => {
    setReplyingTo({
      messageId: message.id,
      senderName: message.senderName || 'Player',
      text: message.text || '',
      type: message.type || 'text',
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleScrollToMessage = useCallback((messageId) => {
    if (!messageId || !flatListRef.current) return;
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    try {
      flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    } catch { /* ignore if not yet rendered */ }
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim() || sending || !isParticipant || !uid || isChatExpired) return;

    const textToSend = inputText.trim();
    const currentReply = replyingTo;
    setInputText('');
    setReplyingTo(null);
    setSending(true);

    try {
      await sendRunMessage({
        runId,
        senderId: uid,
        senderName: profile?.name || 'Player',
        senderAvatar: profile?.photoURL || null,
        text: textToSend,
        replyTo: currentReply,
      });
    } catch (err) {
      if (__DEV__) console.error('[RunChatScreen] send error:', err);
      setInputText(textToSend);
      setReplyingTo(currentReply);
    } finally {
      setSending(false);
    }
  };

  // ── Render message item ────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }) => {
      const isOwn = item.senderId === uid;
      const handleLongPress = () => {
        Alert.alert(null, null, [
          { text: 'Reply', onPress: () => handleReply(item) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      };
      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          colors={colors}
          onLongPress={handleLongPress}
          onReplyQuotePress={handleScrollToMessage}
          onMediaPress={setFullScreenMedia}
        />
      );
    },
    [uid, colors, handleReply, handleScrollToMessage],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ── Header title ───────────────────────────────────────────────────────────
  // Two-line header: "Run Chat" bold + "Gym Name · 7:00 PM" subtitle.
  // Subtitle only shows time if startTime is available.
  useEffect(() => {
    let subtitle = gymName || null;
    if (subtitle && startTime) {
      try {
        const date = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        subtitle = `${subtitle} · ${timeStr}`;
      } catch {
        // startTime unreadable — just show gym name
      }
    }

    navigation.setOptions({
      headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold }}>
            Run Chat
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.textMuted, fontSize: FONT_SIZES.xs }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleMuteToggle}
          style={{ marginRight: 4, padding: 8 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isMuted ? 'notifications-off' : 'notifications-outline'}
            size={22}
            color={isMuted ? colors.textMuted : colors.textPrimary}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, gymName, startTime, colors, isMuted, handleMuteToggle]);

  // ─── Render ────────────────────────────────────────────────────────────────
  // Render priority:
  //   1. participantLoading  — still resolving membership; show spinner.
  //   2. !isParticipant      — confirmed non-participant; show gated state.
  //   3. messagesError       — Firestore denied the read (defensive layer);
  //                            show gated state (not a crash).
  //   4. messagesLoading     — confirmed participant, waiting on first snapshot.
  //   5. Normal chat         — messages + input bar.
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['left', 'right']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* State 1: checking participation */}
        {participantLoading ? (
          <View style={chatStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        /* State 2: confirmed non-participant (or left the run mid-session) */
        ) : !isParticipant ? (
          <View style={chatStyles.gatedContainer}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
            <Text style={[chatStyles.gatedTitle, { color: colors.textPrimary }]}>
              Participants only
            </Text>
            <Text style={[chatStyles.gatedSubtext, { color: colors.textMuted }]}>
              Join this run to view and send messages.
            </Text>
          </View>

        /* State 3: Firestore denied the read — defensive fallback, not a crash */
        ) : messagesError ? (
          <View style={chatStyles.gatedContainer}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
            <Text style={[chatStyles.gatedTitle, { color: colors.textPrimary }]}>
              Chat unavailable
            </Text>
            <Text style={[chatStyles.gatedSubtext, { color: colors.textMuted }]}>
              Could not load messages. Try going back and rejoining the run.
            </Text>
          </View>

        /* State 4: participant confirmed, waiting on first messages snapshot */
        ) : messagesLoading ? (
          <View style={chatStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        /* State 4: normal chat */
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                chatStyles.messageList,
                messages.length === 0 && chatStyles.messageListEmpty,
              ]}
              onContentSizeChange={scrollToBottom}
              ListEmptyComponent={
                <View style={chatStyles.emptyContainer}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                  <Text style={[chatStyles.emptyTitle, { color: colors.textPrimary }]}>
                    No messages yet
                  </Text>
                  <Text style={[chatStyles.emptySubtext, { color: colors.textMuted }]}>
                    Be the first to say something!
                  </Text>
                </View>
              }
            />

            {/* Bottom bar — input for active chats, expiry notice for closed ones */}
            {isChatExpired ? (
              <View
                style={[
                  chatStyles.expiredBar,
                  {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                  },
                ]}
              >
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[chatStyles.expiredText, { color: colors.textMuted }]}>
                  This run chat has ended
                </Text>
              </View>
            ) : (
              <>
                {/* Reply bar — shown when user is replying to a specific message */}
                {replyingTo && (
                  <View
                    style={[
                      chatStyles.replyBar,
                      {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                        borderLeftColor: colors.primary,
                      },
                    ]}
                  >
                    <View style={chatStyles.replyBarContent}>
                      <Text
                        style={[chatStyles.replyBarName, { color: colors.primary }]}
                        numberOfLines={1}
                      >
                        Replying to {replyingTo.senderName}
                      </Text>
                      <Text
                        style={[chatStyles.replyBarText, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {replyingTo.type === 'image'
                          ? '📷 Photo'
                          : replyingTo.type === 'gif'
                            ? '🎞 GIF'
                            : replyingTo.text}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setReplyingTo(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}

              <View
                style={[
                  chatStyles.inputBar,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                  },
                ]}
              >
                {/* Attachment button */}
                <TouchableOpacity
                  onPress={handleAttach}
                  style={chatStyles.attachButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                </TouchableOpacity>

                <TextInput
                  ref={inputRef}
                  style={[
                    chatStyles.textInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="Message..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={(text) => setInputText(sanitizeFreeText(text, 500))}
                  maxLength={500}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[
                    chatStyles.sendButton,
                    {
                      backgroundColor:
                        inputText.trim() ? colors.primary : colors.surfaceLight,
                    },
                  ]}
                  onPress={handleSend}
                  disabled={!inputText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name="send"
                      size={18}
                      color={inputText.trim() ? '#fff' : colors.textMuted}
                    />
                  )}
                </TouchableOpacity>
              </View>
              </>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      {/* Upload progress overlay */}
      {imageUploading && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 8, fontSize: FONT_SIZES.small }}>
            Sending photo…
          </Text>
        </View>
      )}

      {/* GIF picker modal */}
      <Modal visible={showGifPicker} animationType="slide" onRequestClose={() => setShowGifPicker(false)}>
        <View style={[chatStyles.gifPickerContainer, { backgroundColor: colors.background }]}>
          <View style={[chatStyles.gifPickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[chatStyles.gifPickerTitle, { color: colors.textPrimary }]}>GIFs</Text>
            <TouchableOpacity onPress={() => { setShowGifPicker(false); setGifQuery(''); }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={[chatStyles.gifSearchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[chatStyles.gifSearchInput, { color: colors.textPrimary }]}
              placeholder="Search GIFs..."
              placeholderTextColor={colors.textMuted}
              value={gifQuery}
              onChangeText={setGifQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {gifQuery.length > 0 && (
              <TouchableOpacity onPress={() => setGifQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {gifSearching ? (
            <View style={chatStyles.gifLoader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={chatStyles.gifGrid}>
              {gifResults.map((gif) => {
                const preview = gif?.images?.fixed_height_small?.url || gif?.images?.fixed_height?.url;
                if (!preview) return null;
                return (
                  <TouchableOpacity
                    key={gif.id}
                    style={chatStyles.gifItem}
                    onPress={() => handleSendGif(gif)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: preview }} style={chatStyles.gifItemImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              })}
              {gifResults.length === 0 && !gifSearching && (
                <Text style={[chatStyles.gifEmpty, { color: colors.textMuted }]}>
                  {gifQuery ? 'No GIFs found.' : 'Search for a GIF above.'}
                </Text>
              )}
            </ScrollView>
          )}

          <View style={[chatStyles.giphyAttrib, { borderTopColor: colors.border }]}>
            <Text style={[chatStyles.giphyAttribText, { color: colors.textMuted }]}>Powered by GIPHY</Text>
          </View>
        </View>
      </Modal>

      {/* Full-screen media viewer */}
      <Modal
        visible={!!fullScreenMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenMedia(null)}
      >
        <View style={chatStyles.fullScreenOverlay}>
          <TouchableOpacity
            style={chatStyles.fullScreenClose}
            onPress={() => setFullScreenMedia(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {fullScreenMedia && (
            <Image
              source={{ uri: fullScreenMedia.uri }}
              style={chatStyles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Static styles (no theme dependency) — theme colors are applied inline above.

const chatStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  messageListEmpty: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.xs,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },

  // Message rows
  messageRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    alignItems: 'flex-end',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  avatarWrapper: {
    marginRight: SPACING.xs,
    marginBottom: 2,
  },
  bubbleWrapper: {
    maxWidth: '75%',
  },
  bubbleWrapperOwn: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
    marginHorizontal: 2,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.xs,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    fontSize: FONT_SIZES.body,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  // Expired chat bar — replaces the input bar after chatExpiresAt
  expiredBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.xxs,
  },
  expiredText: {
    fontSize: FONT_SIZES.small,
  },

  // Gated state — shown when user is confirmed non-participant
  // (or has left the run mid-session)
  gatedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
  },
  gatedTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  gatedSubtext: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
  },

  // Reply bar — shown above input when replying
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    gap: SPACING.xs,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  replyBarText: {
    fontSize: FONT_SIZES.xs,
    marginTop: 1,
  },

  // Reply quote — shown inside a bubble when a message has a replyTo
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 3,
    marginBottom: 4,
    maxWidth: '100%',
  },
  replyQuoteName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
  },

  // Attachment button
  attachButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Image bubble
  mediaBubble: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    maxWidth: 220,
  },
  mediaImage: {
    width: 220,
    height: 160,
    borderRadius: RADIUS.md,
  },
  gifBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  // GIF picker modal
  gifPickerContainer: {
    flex: 1,
  },
  gifPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 56,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gifPickerTitle: {
    fontSize: FONT_SIZES.large,
    fontWeight: FONT_WEIGHTS.bold,
  },
  gifSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    height: 40,
    gap: 8,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    paddingVertical: 0,
  },
  gifGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.sm,
    gap: 4,
  },
  gifItem: {
    width: (SCREEN_WIDTH - SPACING.sm * 2 - 4) / 2,
    height: (SCREEN_WIDTH - SPACING.sm * 2 - 4) / 2 * 0.65,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  gifItemImage: {
    width: '100%',
    height: '100%',
  },
  gifLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifEmpty: {
    width: '100%',
    textAlign: 'center',
    paddingTop: SPACING.xl,
    fontSize: FONT_SIZES.body,
  },
  giphyAttrib: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  giphyAttribText: {
    fontSize: FONT_SIZES.xs,
  },

  // Full-screen image overlay
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
});
