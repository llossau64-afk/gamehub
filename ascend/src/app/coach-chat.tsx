import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AText } from '../components/AText';
import { ChatView } from '../components/ChatView';
import { IconButton } from '../components/Controls';
import { colors, spacing } from '../theme';

/** Coach as a modal so it can be opened mid-workout without losing progress. */
export default function CoachChatModal() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <AText variant="h2">Coach</AText>
          <AText variant="tiny" muted>
            Your workout keeps running in the background.
          </AText>
        </View>
        <IconButton icon="close" label="Close coach" onPress={() => (router.canGoBack() ? router.back() : router.replace('/workout'))} />
      </View>
      <ChatView bottomInset={insets.bottom} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
