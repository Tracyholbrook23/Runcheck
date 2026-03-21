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

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { auth } from '../config/firebase';
import {
  subscribeToConversationMessages,
  sendDMMessage,
  markConversationSeen,
} from '../services/dmService';

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
function MessageBubble({ message, isOwn, otherUserAvatar, otherUserName, colors }) {
  return (
    <View
      style={[
        dmStyles.messageRow,
        isOwn ? dmStyles.messageRowOwn : dmStyles.messageRowOther,
      ]}
    >
      {/* Avatar — only for the other participant's messages */}
      {!isOwn && (
        <View style={dmStyles.avatarWrapper}>
          <AvatarBubble
            uri={otherUserAvatar}
            name={otherUserName}
            size={30}
            colors={colors}
          />
        </View>
      )}

      <View style={[dmStyles.bubbleWrapper, isOwn && dmStyles.bubbleWrapperOwn]}>
        <View
          style={[
            dmStyles.bubble,
            isOwn
              ? [dmStyles.bubbleOwn, { backgroundColor: colors.primary }]
              : [dmStyles.bubbleOther, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              dmStyles.bubbleText,
              { color: isOwn ? '#FFFFFF' : colors.textPrimary },
            ]}
          >
            {message.text}
          </Text>
        </View>

        <Text style={[dmStyles.messageTime, { color: colors.textMuted }]}>
          {formatMessageTime(message.createdAt)}
        </Text>
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

  const flatListRef = useRef(null);

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

    try {
      await sendDMMessage({
        conversationId,
        senderId: uid,
        text: textToSend,
      });
    } catch (err) {
      if (__DEV__) console.error('[DMConversationScreen] send error:', err);
      // Restore text so the user doesn't lose their message
      setInputText(textToSend);
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
  const renderMessage = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === uid}
        otherUserAvatar={otherUserAvatar}
        otherUserName={otherUserName}
        colors={colors}
      />
    ),
    [uid, otherUserAvatar, otherUserName, colors],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['left', 'right', 'top']}
    >
      {/* Custom header */}
      <View style={[dmStyles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={dmStyles.headerBack}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Tappable avatar + name → UserProfileScreen */}
        <TouchableOpacity
          style={dmStyles.headerCenter}
          onPress={handleViewProfile}
          activeOpacity={0.7}
        >
          <AvatarBubble
            uri={otherUserAvatar}
            name={otherUserName}
            size={34}
            colors={colors}
          />
          <Text style={[dmStyles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {otherUserName || 'Player'}
          </Text>
        </TouchableOpacity>

        {/* Right spacer to keep header centered */}
        <View style={dmStyles.headerRight} />
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
                dmStyles.inputBar,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                },
              ]}
            >
              <TextInput
                style={[
                  dmStyles.textInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Message..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                maxLength={500}
                multiline
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[
                  dmStyles.sendButton,
                  {
                    backgroundColor: inputText.trim() ? colors.primary : colors.surfaceLight,
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const dmStyles = StyleSheet.create({
  // Custom header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    padding: SPACING.xs,
    width: 44,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    justifyContent: 'center',
  },
  headerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    flexShrink: 1,
  },
  headerRight: {
    width: 44, // mirrors back button width for visual centering
  },

  // States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xl,
  },
  errorTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  errorSubtext: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
  },

  // Message list
  messageList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  messageListEmpty: {
    flex: 1,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xxxl,
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

  // Message rows — shared with RunChatScreen layout pattern
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
  },
});
