/**
 * DMConversationScreen.js — 1:1 Direct Message Conversation
 *
 * Real-time chat screen for a direct message conversation between two users.
 * Messages live in: conversations/{conversationId}/messages/{messageId}
 *
 * Route params (required):
 *   - conversationId  {string} — Firestore conversation document ID
 *   - otherUserId     {string} — UID of the other participant
 *   - otherUserName   {string} — Display name of the other participant
 *   - otherUserAvatar {string|null} — Avatar URL of the other participant
 *
 * Access control:
 *   - Firestore rules allow read/write only to participants (via participantIds).
 *   - Navigation only reaches here via MessagesScreen (inbox) or UserProfileScreen
 *     (Message button), both of which require a valid conversationId.
 *   - No explicit participation check in this screen — the rule layer handles it.
 *
 * On mount: calls markConversationSeen() to clear the inbox unread indicator.
 *
 * Header: custom (headerShown: false in App.js). Shows back arrow, other user's
 *   avatar + name. Tapping name/avatar navigates to UserProfileScreen.
 *
 * MVP scope (intentionally excluded):
 *   - Read receipts
 *   - Typing indicators
 *   - Message reactions
 *   - Media uploads
 *   - Message deletion
 *   - Pagination (loads all messages — fine at MVP scale)
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
  ActivityIndicator,
  Modal,
  Alert,
  ActionSheetIOS,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { auth, storage } from '../config/firebase';
import {
  subscribeToConversationMessages,
  subscribeToConversation,
  sendDMMessage,
  sendDMMedia,
  markConversationSeen,
  getConversationMuteState,
  muteConversation,
  unmuteConversation,
} from '../services/dmService';
import ReportModal from '../components/ReportModal';
import { sanitizeFreeText } from '../utils/sanitize';

// ─── Giphy ────────────────────────────────────────────────────────────────────
const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const GIPHY_TRENDING = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`;
const GIPHY_SEARCH   = (q) => `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * formatMessageTime — Short timestamp for a message bubble (e.g. "2:35 PM").
 */
function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * getInitials — Up to 2 initials from a display name.
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * getDateLabel — Returns a human-readable date label for a message timestamp.
 * Used to render date separators between messages sent on different days.
 */
function getDateLabel(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * AvatarBubble — Small circular avatar used in message rows and the header.
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
 * MessageBubble — A single DM message row.
 *
 * Own messages (isOwn = true): right-aligned, orange background.
 * Other messages: left-aligned with avatar and optional sender label.
 * In a 1:1 DM, sender name is omitted (only one other person).
 */
// ── Reply quoted block (shared by DM + run chat bubbles) ─────────────────────
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
      style={[dmStyles.replyQuote, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}
    >
      <Text style={[dmStyles.replyQuoteName, { color: colors.primary }]} numberOfLines={1}>
        {replyTo.senderName}
      </Text>
      <Text style={[dmStyles.replyQuoteText, { color: colors.textMuted }]} numberOfLines={2}>
        {previewText}
      </Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ message, isOwn, isRead, otherUserAvatar, otherUserName, onLongPress, colors, onMediaPress, onReplyQuotePress }) {
  const isMedia = message.type === 'image' || message.type === 'gif';

  // ── Removed message placeholder ──────────────────────────────────────────
  if (message.isRemoved) {
    return (
      <View style={[dmStyles.messageRow, isOwn ? dmStyles.messageRowOwn : dmStyles.messageRowOther]}>
        {!isOwn && <View style={dmStyles.avatarSpacer} />}
        <View style={[dmStyles.bubbleWrapper, isOwn && dmStyles.bubbleWrapperOwn]}>
          <View style={[dmStyles.removedBubble, { borderColor: colors.border }]}>
            <Text style={[dmStyles.removedBubbleText, { color: colors.textMuted }]}>
              Message removed
            </Text>
          </View>
          <Text style={[dmStyles.messageTime, isOwn ? dmStyles.messageTimeOwn : dmStyles.messageTimeOther, { color: colors.textMuted }]}>
            {formatMessageTime(message.createdAt)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[dmStyles.messageRow, isOwn ? dmStyles.messageRowOwn : dmStyles.messageRowOther]}>
      {/* Avatar — only for the other participant's messages */}
      {!isOwn ? (
        <View style={dmStyles.avatarWrapper}>
          <AvatarBubble uri={otherUserAvatar} name={otherUserName} size={34} colors={colors} />
        </View>
      ) : (
        <View style={dmStyles.avatarSpacer} />
      )}

      <View style={[dmStyles.bubbleWrapper, isOwn && dmStyles.bubbleWrapperOwn]}>
        <ReplyQuote
          replyTo={message.replyTo}
          colors={colors}
          onPress={() => onReplyQuotePress?.(message.replyTo?.messageId)}
        />
        {isMedia ? (
          /* ── Image / GIF bubble ─────────────────────────────────────── */
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onMediaPress?.(message.mediaUrl)}
            onLongPress={onLongPress}
            delayLongPress={400}
            style={isOwn ? dmStyles.mediaWrapOwn : dmStyles.mediaWrapOther}
          >
            <Image
              source={{ uri: message.mediaUrl }}
              style={dmStyles.mediaBubble}
              resizeMode="cover"
            />
            {message.type === 'gif' && (
              <View style={dmStyles.gifBadge}>
                <Text style={dmStyles.gifBadgeText}>GIF</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : isOwn ? (
          /* ── Own text bubble — orange gradient ──────────────────────── */
          <TouchableOpacity
            onLongPress={onLongPress}
            delayLongPress={400}
            activeOpacity={0.9}
            disabled={!onLongPress}
          >
            <LinearGradient
              colors={['#FF7A47', '#E8511A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[dmStyles.bubble, dmStyles.bubbleOwn]}
            >
              <Text style={[dmStyles.bubbleText, { color: '#FFFFFF' }]}>
                {message.text}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          /* ── Other text bubble — dark card ──────────────────────────── */
          <TouchableOpacity
            onLongPress={onLongPress}
            delayLongPress={400}
            activeOpacity={0.9}
            disabled={!onLongPress}
            style={[dmStyles.bubble, dmStyles.bubbleOther, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[dmStyles.bubbleText, { color: colors.textPrimary }]}>
              {message.text}
            </Text>
          </TouchableOpacity>
        )}

        <View style={[dmStyles.messageFooter, isOwn && dmStyles.messageFooterOwn]}>
          <Text style={[dmStyles.messageTime, { color: colors.textMuted }]}>
            {formatMessageTime(message.createdAt)}
          </Text>
          {isOwn && isRead && (
            <Ionicons name="checkmark-done" size={13} color={colors.primary} style={{ marginLeft: 2 }} />
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DMConversationScreen({ route, navigation }) {
  const { conversationId, otherUserId, otherUserName, otherUserAvatar } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const uid = auth.currentUser?.uid;

  // Messages state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState(false);

  // Input state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Report modal state — player report from header
  const [showReport, setShowReport] = useState(false);
  // Message-level report state — set when user long-presses a message
  const [reportTarget, setReportTarget] = useState(null); // { messageId, senderId, messageText, messageSentAt }

  const flatListRef = useRef(null);

  // ── Read receipt: track when the other user last saw the conversation ────
  // subscribeToConversation watches lastSeenAt on the conversation doc.
  // We extract lastSeenAt[otherUserId] so we can show "Read" under the
  // last message the current user sent once the other person has opened it.
  const [otherLastSeenMs, setOtherLastSeenMs] = useState(0);

  useEffect(() => {
    if (!conversationId || !otherUserId) return;
    const unsub = subscribeToConversation(conversationId, (data) => {
      const ts = data?.lastSeenAt?.[otherUserId];
      const ms = ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : 0);
      setOtherLastSeenMs(ms);
    });
    return unsub;
  }, [conversationId, otherUserId]);

  // ── Reply state ───────────────────────────────────────────────────────────
  // replyingTo: { messageId, senderName, text, type } | null
  const [replyingTo, setReplyingTo] = useState(null);
  const inputRef = useRef(null);

  const handleReply = useCallback((message) => {
    setReplyingTo({
      messageId: message.id,
      senderName: message.senderName || (message.senderId === uid ? 'You' : otherUserName),
      text: message.text || '',
      type: message.type || 'text',
    });
    // Focus the input so keyboard comes up immediately
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [uid, otherUserName]);

  const handleScrollToMessage = useCallback((messageId) => {
    if (!messageId || !flatListRef.current) return;
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    try {
      flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    } catch {
      // If scrollToIndex fails (e.g. item not yet rendered), silently ignore
    }
  }, [messages]);

  // ── Media state ───────────────────────────────────────────────────────────
  const [imageUploading, setImageUploading] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState(null); // uri string or null
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

  // ── Image / GIF handlers ──────────────────────────────────────────────────
  const handleAttachment = useCallback(() => {
    const options = ['Camera', 'Photo Library', 'GIF', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) pickMedia('camera');
          if (idx === 1) pickMedia('library');
          if (idx === 2) setShowGifPicker(true);
        },
      );
    } else {
      Alert.alert('Attach', null, [
        { text: 'Camera',        onPress: () => pickMedia('camera')  },
        { text: 'Photo Library', onPress: () => pickMedia('library') },
        { text: 'GIF',           onPress: () => setShowGifPicker(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, []);

  const pickMedia = useCallback(async (source) => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert(
        'Permission needed',
        `Allow RunCheck to access your ${source === 'camera' ? 'camera' : 'photo library'} in Settings.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => { const { Linking } = require('react-native'); Linking.openSettings(); } }],
      );
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    await uploadAndSendImage(result.assets[0].uri);
  }, [conversationId, uid]);

  const uploadAndSendImage = useCallback(async (localUri) => {
    if (!conversationId || !uid) return;
    setImageUploading(true);
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const fileName = `${uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, `dmImages/${conversationId}/${fileName}`);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, blob);
        task.on('state_changed', null, reject, resolve);
      });
      const downloadURL = await getDownloadURL(storageRef);
      const user = auth.currentUser;
      await sendDMMedia({
        conversationId,
        senderId: uid,
        senderName: user?.displayName || 'Player',
        senderAvatar: user?.photoURL || null,
        mediaType: 'image',
        mediaUrl: downloadURL,
      });
    } catch (err) {
      if (__DEV__) console.warn('[DM] image upload error:', err);
      Alert.alert('Upload failed', 'Could not send the photo. Please try again.');
    } finally {
      setImageUploading(false);
    }
  }, [conversationId, uid]);

  const handleSendGif = useCallback(async (gif) => {
    setShowGifPicker(false);
    setGifQuery('');
    const gifUrl = gif?.images?.fixed_height?.url || gif?.images?.original?.url;
    if (!gifUrl || !conversationId || !uid) return;
    try {
      const user = auth.currentUser;
      await sendDMMedia({
        conversationId,
        senderId: uid,
        senderName: user?.displayName || 'Player',
        senderAvatar: user?.photoURL || null,
        mediaType: 'gif',
        mediaUrl: gifUrl,
      });
    } catch (err) {
      if (__DEV__) console.warn('[DM] gif send error:', err);
    }
  }, [conversationId, uid]);

  // ── Subscribe to messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    setMessagesLoading(true);
    setMessagesError(false);

    const unsubscribe = subscribeToConversationMessages(conversationId, (newMessages, error) => {
      if (error) {
        if (__DEV__) console.warn('[DMConversationScreen] messages error:', error);
        setMessagesError(true);
        setMessagesLoading(false);
        return;
      }
      setMessages(newMessages);
      setMessagesLoading(false);
    });

    return unsubscribe;
  }, [conversationId]);

  // ── Mark conversation seen on mount ────────────────────────────────────────
  // Clears the unread dot in the MessagesScreen inbox.
  // Fire-and-forget — failure is handled inside markConversationSeen.
  useEffect(() => {
    if (conversationId && uid) {
      markConversationSeen(conversationId, uid);
    }
  }, [conversationId, uid]);

  // ── Mute state ─────────────────────────────────────────────────────────────
  // One-shot read on mount — mute only changes via explicit user action.
  const [isMuted, setIsMuted] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);

  useEffect(() => {
    if (conversationId && uid) {
      getConversationMuteState(conversationId, uid).then(setIsMuted);
    }
  }, [conversationId, uid]);

  const handleToggleMute = useCallback(async () => {
    if (muteLoading) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted); // optimistic
    setMuteLoading(true);
    try {
      if (newMuted) {
        await muteConversation(conversationId, uid);
      } else {
        await unmuteConversation(conversationId, uid);
      }
    } catch (err) {
      setIsMuted(!newMuted); // revert on error
      if (__DEV__) console.error('[DMConversationScreen] mute toggle error:', err);
    } finally {
      setMuteLoading(false);
    }
  }, [muteLoading, isMuted, conversationId, uid]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim() || sending || !uid) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      await sendDMMessage({
        conversationId,
        senderId: uid,
        recipientId: otherUserId,
        text: textToSend,
        replyTo: currentReply,
      });
    } catch (err) {
      if (__DEV__) console.error('[DMConversationScreen] send error:', err);
      setInputText(textToSend);
      setReplyingTo(currentReply); // restore reply context on failure
    } finally {
      setSending(false);
    }
  };

  // ── Navigate to other user's profile ──────────────────────────────────────
  const handleViewProfile = () => {
    if (!otherUserId) return;
    navigation.navigate('UserProfile', { userId: otherUserId });
  };

  // ── Render message ─────────────────────────────────────────────────────────
  // Compute the ID of the last message sent by the current user so we can
  // show the "Read" receipt only under that one message (not every sent bubble).
  const lastOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === uid) return messages[i].id;
    }
    return null;
  }, [messages, uid]);

  const renderMessage = useCallback(
    ({ item, index }) => {
      const isOwn = item.senderId === uid;

      // ── Date separator: show label when date changes between messages ──────
      const prevItem = index > 0 ? messages[index - 1] : null;
      const showDateSep = !prevItem ||
        getDateLabel(item.createdAt) !== getDateLabel(prevItem.createdAt);

      // Show "Read" only under the most recent message the current user sent,
      // and only once the other user's lastSeenAt is newer than that message.
      const msgMs = item.createdAt?.toMillis
        ? item.createdAt.toMillis()
        : item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const isRead =
        isOwn &&
        item.id === lastOwnMessageId &&
        otherLastSeenMs > 0 &&
        otherLastSeenMs >= msgMs;

      const handleLongPress = () => {
        const replyOption = {
          text: 'Reply',
          onPress: () => handleReply(item),
        };
        if (isOwn) {
          // Own messages: only reply available
          Alert.alert(null, null, [
            replyOption,
            { text: 'Cancel', style: 'cancel' },
          ]);
        } else {
          // Other user's messages: reply + report
          Alert.alert(null, null, [
            replyOption,
            {
              text: 'Report',
              style: 'destructive',
              onPress: () => setReportTarget({
                messageId: item.id,
                senderId: item.senderId,
                messageText: item.text || '',
                messageSentAt: item.createdAt || null,
              }),
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }
      };

      return (
        <>
          {showDateSep && (
            <View style={dmStyles.dateSepRow}>
              <View style={[dmStyles.dateSepLine, { backgroundColor: colors.border }]} />
              <Text style={[dmStyles.dateSepLabel, { color: colors.textMuted, backgroundColor: colors.background }]}>
                {getDateLabel(item.createdAt)}
              </Text>
              <View style={[dmStyles.dateSepLine, { backgroundColor: colors.border }]} />
            </View>
          )}
          <MessageBubble
            message={item}
            isOwn={isOwn}
            isRead={isRead}
            otherUserAvatar={otherUserAvatar}
            otherUserName={otherUserName}
            colors={colors}
            onMediaPress={(uri) => setFullScreenMedia(uri)}
            onReplyQuotePress={handleScrollToMessage}
            onLongPress={handleLongPress}
          />
        </>
      );
    },
    [uid, otherUserAvatar, otherUserName, colors, lastOwnMessageId, otherLastSeenMs, handleReply, handleScrollToMessage],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['left', 'right', 'top']}
    >
      {/* Custom header */}
      <View style={[dmStyles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={dmStyles.headerBack}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Tappable avatar + name */}
        <TouchableOpacity style={dmStyles.headerCenter} onPress={handleViewProfile} activeOpacity={0.7}>
          <View style={dmStyles.headerAvatarRing}>
            <AvatarBubble uri={otherUserAvatar} name={otherUserName} size={38} colors={colors} />
          </View>
          <View style={dmStyles.headerTextBlock}>
            <Text style={[dmStyles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
              {otherUserName || 'Player'}
            </Text>
            <Text style={[dmStyles.headerSub, { color: colors.textMuted }]}>Tap to view profile</Text>
          </View>
        </TouchableOpacity>

        {/* Header right — mute + report */}
        <View style={dmStyles.headerRight}>
          <TouchableOpacity
            style={[dmStyles.headerIconBtn, { backgroundColor: colors.surface }]}
            onPress={handleToggleMute}
            disabled={muteLoading}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isMuted ? 'notifications-off' : 'notifications-outline'}
              size={18}
              color={isMuted ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[dmStyles.headerIconBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowReport(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="flag-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* State 1: loading messages */}
        {messagesLoading ? (
          <View style={dmStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        /* State 2: Firestore error */
        ) : messagesError ? (
          <View style={dmStyles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={[dmStyles.errorTitle, { color: colors.textPrimary }]}>
              Couldn't load messages
            </Text>
            <Text style={[dmStyles.errorSubtext, { color: colors.textMuted }]}>
              Go back and try again.
            </Text>
          </View>

        /* State 3: loaded (messages or empty) */
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                dmStyles.messageList,
                messages.length === 0 && dmStyles.messageListEmpty,
              ]}
              onContentSizeChange={scrollToBottom}
              ListEmptyComponent={
                <View style={dmStyles.emptyContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
                  <Text style={[dmStyles.emptyTitle, { color: colors.textPrimary }]}>
                    Say hi!
                  </Text>
                  <Text style={[dmStyles.emptySubtext, { color: colors.textMuted }]}>
                    You haven't messaged {otherUserName || 'this player'} yet.
                  </Text>
                </View>
              }
            />

            {/* Input bar */}
            <View
              style={[
                dmStyles.inputBarOuter,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                },
              ]}
            >
              {/* Reply preview bar */}
              {replyingTo && (
                <View style={[dmStyles.replyBar, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
                  <View style={dmStyles.replyBarContent}>
                    <Text style={[dmStyles.replyBarName, { color: colors.primary }]} numberOfLines={1}>
                      Replying to {replyingTo.senderName}
                    </Text>
                    <Text style={[dmStyles.replyBarText, { color: colors.textMuted }]} numberOfLines={1}>
                      {replyingTo.type === 'image' ? '📷 Photo' : replyingTo.type === 'gif' ? '🎞 GIF' : replyingTo.text}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={dmStyles.inputRow}>
                {/* Attachment */}
                <TouchableOpacity
                  style={[dmStyles.attachButton, { backgroundColor: colors.surface }]}
                  onPress={handleAttachment}
                  disabled={imageUploading}
                  activeOpacity={0.7}
                >
                  {imageUploading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Ionicons name="add" size={22} color={colors.textMuted} />
                  }
                </TouchableOpacity>

                {/* Text field */}
                <TextInput
                  ref={inputRef}
                  style={[
                    dmStyles.textInput,
                    { backgroundColor: colors.surface, color: colors.textPrimary },
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

                {/* Send button */}
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!inputText.trim() || sending || imageUploading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={inputText.trim() ? ['#FF7A47', '#E8511A'] : [colors.surfaceLight, colors.surfaceLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={dmStyles.sendButton}
                  >
                    {sending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="send" size={17} color={inputText.trim() ? '#fff' : colors.textMuted} />
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Report modal — reports the other user (type="player") */}
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        type="player"
        targetId={otherUserId}
      />

      {/* Message-level report modal — long-press on a message bubble */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        type="message"
        targetId={reportTarget?.messageId ?? ''}
        messageContext={
          reportTarget
            ? {
                conversationId,
                messageId: reportTarget.messageId,
                senderId: reportTarget.senderId,
                messageText: reportTarget.messageText,
                messageSentAt: reportTarget.messageSentAt,
              }
            : undefined
        }
        blockSenderId={reportTarget?.senderId}
      />

      {/* ── Full-screen media viewer ─────────────────────────────────── */}
      <Modal visible={!!fullScreenMedia} transparent animationType="fade" onRequestClose={() => setFullScreenMedia(null)}>
        <View style={dmStyles.fullScreenOverlay}>
          <TouchableOpacity style={dmStyles.fullScreenClose} onPress={() => setFullScreenMedia(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {fullScreenMedia && (
            <Image
              source={{ uri: fullScreenMedia }}
              style={dmStyles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* ── GIF picker modal ─────────────────────────────────────────── */}
      <Modal visible={showGifPicker} animationType="slide" onRequestClose={() => setShowGifPicker(false)}>
        <View style={[dmStyles.gifPickerContainer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[dmStyles.gifPickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[dmStyles.gifPickerTitle, { color: colors.textPrimary }]}>GIFs</Text>
            <TouchableOpacity onPress={() => { setShowGifPicker(false); setGifQuery(''); }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={[dmStyles.gifSearchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[dmStyles.gifSearchInput, { color: colors.textPrimary }]}
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

          {/* GIF grid */}
          {gifSearching ? (
            <View style={dmStyles.gifLoader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={dmStyles.gifGrid}>
              {gifResults.map((gif) => {
                const preview = gif?.images?.fixed_height_small?.url || gif?.images?.fixed_height?.url;
                if (!preview) return null;
                return (
                  <TouchableOpacity
                    key={gif.id}
                    style={dmStyles.gifItem}
                    onPress={() => handleSendGif(gif)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: preview }} style={dmStyles.gifItemImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              })}
              {gifResults.length === 0 && !gifSearching && (
                <Text style={[dmStyles.gifEmpty, { color: colors.textMuted }]}>
                  {gifQuery ? 'No GIFs found.' : 'Search for a GIF above.'}
                </Text>
              )}
            </ScrollView>
          )}

          {/* Giphy attribution */}
          <View style={[dmStyles.giphyAttrib, { borderTopColor: colors.border }]}>
            <Text style={[dmStyles.giphyAttribText, { color: colors.textMuted }]}>Powered by GIPHY</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const dmStyles = StyleSheet.create({
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    width: 40,
    alignItems: 'flex-start',
    paddingLeft: 2,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  headerAvatarRing: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FF7A4740',
    padding: 1,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingRight: 4,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── States ───────────────────────────────────────────────────────────────────
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingHorizontal: SPACING.xl,
  },
  errorTitle: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold, marginTop: SPACING.sm },
  errorSubtext: { fontSize: FONT_SIZES.small, textAlign: 'center' },

  // ── Message list ─────────────────────────────────────────────────────────────
  messageList: { paddingHorizontal: 12, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  messageListEmpty: { flex: 1 },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.xxxl,
  },
  emptyTitle: { fontSize: FONT_SIZES.subtitle, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.sm },
  emptySubtext: { fontSize: FONT_SIZES.small, textAlign: 'center', paddingHorizontal: SPACING.xl },

  // ── Date separator ───────────────────────────────────────────────────────────
  dateSepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
    gap: SPACING.sm,
  },
  dateSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dateSepLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },

  // ── Message rows ─────────────────────────────────────────────────────────────
  messageRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  messageRowOwn: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  avatarWrapper: { width: 38, marginRight: 6, alignItems: 'center', marginBottom: 2 },
  avatarSpacer: { width: 0 },

  bubbleWrapper: { maxWidth: '78%' },
  bubbleWrapperOwn: { alignItems: 'flex-end' },

  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleOwn: {
    borderRadius: 20,
    borderBottomRightRadius: 5,
  },
  bubbleOther: {
    borderRadius: 20,
    borderBottomLeftRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: {
    fontSize: FONT_SIZES.body,
    lineHeight: 21,
  },

  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    paddingHorizontal: 4,
  },
  messageFooterOwn: { justifyContent: 'flex-end' },
  messageTimeOwn: { textAlign: 'right' },
  messageTimeOther: { textAlign: 'left' },
  messageTime: { fontSize: 11 },

  // ── Removed placeholder ──────────────────────────────────────────────────────
  removedBubble: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
  },
  removedBubbleText: {
    fontSize: FONT_SIZES.small,
    fontStyle: 'italic',
    opacity: 0.55,
  },

  // ── Media bubbles ─────────────────────────────────────────────────────────────
  mediaWrapOwn: { borderRadius: 20, borderBottomRightRadius: 5, overflow: 'hidden' },
  mediaWrapOther: { borderRadius: 20, borderBottomLeftRadius: 5, overflow: 'hidden' },
  mediaBubble: {
    width: SCREEN_WIDTH * 0.62,
    height: SCREEN_WIDTH * 0.62 * 0.75,
  },
  gifBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  gifBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Reply quote (inside bubble) ───────────────────────────────────────────────
  replyQuote: {
    borderLeftWidth: 3, borderRadius: 8,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    marginBottom: 6, maxWidth: '100%',
  },
  replyQuoteName: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, marginBottom: 1 },
  replyQuoteText: { fontSize: 11, lineHeight: 15 },

  // ── Input bar ────────────────────────────────────────────────────────────────
  inputBarOuter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACING.sm,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    gap: SPACING.sm,
  },
  replyBarContent: { flex: 1 },
  replyBarName: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, marginBottom: 1 },
  replyBarText: { fontSize: 11 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
  },
  attachButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: FONT_SIZES.body,
    maxHeight: 110,
    minHeight: 38,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Full-screen media viewer ──────────────────────────────────────────────────
  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenClose: { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
  fullScreenImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },

  // ── GIF picker ────────────────────────────────────────────────────────────────
  gifPickerContainer: { flex: 1 },
  gifPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 56, paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gifPickerTitle: { fontSize: FONT_SIZES.large, fontWeight: FONT_WEIGHTS.bold },
  gifSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING.sm, height: 40, gap: 8,
  },
  gifSearchInput: { flex: 1, fontSize: FONT_SIZES.body, paddingVertical: 0 },
  gifGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.sm, gap: 4 },
  gifItem: {
    width: (SCREEN_WIDTH - SPACING.sm * 2 - 4) / 2,
    height: (SCREEN_WIDTH - SPACING.sm * 2 - 4) / 2 * 0.65,
    borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: '#1a1a1a',
  },
  gifItemImage: { width: '100%', height: '100%' },
  gifLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gifEmpty: { width: '100%', textAlign: 'center', paddingTop: SPACING.xl, fontSize: FONT_SIZES.body },
  giphyAttrib: { alignItems: 'center', paddingVertical: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth },
  giphyAttribText: { fontSize: FONT_SIZES.xs },
});
