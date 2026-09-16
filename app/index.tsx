import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PHASE 0</Text>
        <Text style={styles.title}>Family Location</Text>
        <Text style={styles.subtitle}>
          Privacy-first family location sharing. Android reliability comes first.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bootstrap ready</Text>
          <Text style={styles.item}>React Native + Expo development build</Text>
          <Text style={styles.item}>expo-updates boundary for xprem OTA</Text>
          <Text style={styles.item}>Strict TypeScript</Text>
          <Text style={styles.item}>Native Android work starts in Phase 1</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f2' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 2, opacity: 0.5 },
  title: { fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 17, lineHeight: 25, opacity: 0.65, maxWidth: 420 },
  card: { marginTop: 16, padding: 20, borderRadius: 18, backgroundColor: '#ffffff', gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  item: { fontSize: 15, lineHeight: 21, opacity: 0.72 },
});
