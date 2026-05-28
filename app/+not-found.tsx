import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle } from "lucide-react-native";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Page Not Found", headerShown: false }} />
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <AlertCircle size={64} color="#FFD700" />
        <Text style={styles.title}>Page Not Found</Text>
        <Text style={styles.subtitle}>
          The page you&apos;re looking for doesn&apos;t exist.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>Go Home</Text>
        </TouchableOpacity>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginTop: 8,
  },
  button: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: "#FFD700",
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#0F0F1E",
  },
});
