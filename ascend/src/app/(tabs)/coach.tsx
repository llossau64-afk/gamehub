import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AText } from '../../components/AText';
import { ChatView } from '../../components/ChatView';
import { IconButton } from '../../components/Controls';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';

export default function Coach() {
  const insets = useSafeAreaInsets();
  const clear = useAppStore((s) => s.clearChat);
  const count = useAppStore((s) => s.chat.length);
  const confirmClear = () => {
    if (Platform.OS === 'web') return globalThis.confirm?.('Clear conversation?') && clear();
    Alert.alert('Clear conversation?', 'This removes the chat history from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }]);
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <AText variant="h1">Coach</AText>
          <AText variant="small" muted>
            Personal guidance from your own training data
          </AText>
        </View>
        {count > 0 && <IconButton icon="trash-outline" label="Clear conversation" onPress={confirmClear} />}
      </View>
      {/* Leave room for the floating tab bar */}
      <View style={{ flex: 1, paddingBottom: 76 + Math.max(insets.bottom, 10) }}>
        <ChatView />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
