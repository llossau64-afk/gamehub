import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { useReduceMotion } from '../hooks/useMotion';
import { askCoach } from '../services/coachApi';
import { haptic } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, fonts, radius, spacing } from '../theme';
import { AText } from './AText';

const SUGGESTIONS_EN = ['What should I train today?', 'Shorten today’s workout', 'How do I perform a Romanian deadlift?', 'Replace bench press', 'How should I recover between sessions?', 'Why did my performance decrease?'];
const SUGGESTIONS_DE = ['Was soll ich heute trainieren?', 'Mach das Training kürzer', 'Wie mache ich Kniebeugen?', 'Wie sieht meine Woche aus?'];

export function ChatView({ bottomInset = 0, compact }: { bottomInset?: number; compact?: boolean }) {
  const reduce = useReduceMotion();
  const { chat, addChat, profile, plan, sessions, checkins } = useAppStore(
    useShallow((s) => ({ chat: s.chat, addChat: s.addChat, profile: s.profile, plan: s.plan, sessions: s.sessions, checkins: s.checkins })),
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList>(null);

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: !reduce }), 80);
    return () => clearTimeout(t);
  }, [chat.length, busy, reduce]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy || !profile) return;
    setText('');
    haptic('light');
    const history = useAppStore.getState().chat;
    addChat({ role: 'user', text: m });
    setBusy(true);
    try {
      const reply = await askCoach(m, history, { profile, plan, sessions, checkins });
      addChat({ role: 'coach', text: reply.text, source: reply.source });
    } catch {
      addChat({ role: 'coach', text: 'I could not answer just now. Please try again in a moment.', source: 'offline' });
    } finally {
      setBusy(false);
    }
  };

  const suggestions = profile?.coachLanguage === 'de' ? SUGGESTIONS_DE : SUGGESTIONS_EN;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={compact ? 0 : 10}>
      <FlatList
        ref={list}
        data={chat}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ gap: spacing.md, paddingTop: spacing.lg }}>
            <AText variant="h2">Ask your coach</AText>
            <AText variant="small" muted>
              Your coach knows your program, recent sessions and check-ins. English and German are both welcome. It gives general fitness guidance — not medical advice.
            </AText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {suggestions.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => send(s)} style={styles.suggest}>
                  <AText variant="small">{s}</AText>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View entering={reduce ? undefined : FadeInUp.duration(250)} style={[styles.bubble, item.role === 'user' ? styles.user : styles.coach]}>
            {item.role === 'coach' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="sparkles" size={12} color={colors.violetBright} />
                <AText variant="tiny" color={colors.violetBright}>
                  {item.source === 'ai' ? 'AI COACH' : 'COACH · OFFLINE MODE'}
                </AText>
              </View>
            )}
            <AText variant="body" selectable>
              {item.text}
            </AText>
          </Animated.View>
        )}
        ListFooterComponent={
          busy ? (
            <View style={[styles.bubble, styles.coach, { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }]}>
              <ActivityIndicator color={colors.violetBright} size="small" />
              <AText variant="small" muted>
                Thinking…
              </AText>
            </View>
          ) : null
        }
      />
      <View style={[styles.inputBar, { paddingBottom: spacing.md + bottomInset }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask anything about your training…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          maxLength={800}
          accessibilityLabel="Message your coach"
          onSubmitEditing={() => send(text)}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={() => send(text)} style={[styles.send, (!text.trim() || busy) && { opacity: 0.4 }]}>
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.lg },
  user: { alignSelf: 'flex-end', backgroundColor: colors.violetDeep, borderBottomRightRadius: 4 },
  coach: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  suggest: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
});
