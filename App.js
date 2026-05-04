import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const PROMPT =
  'responda a questao da imagem. Nao precisa de longas explicacoes, somente diga qual ou quais as alternativas corretas';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const openCamera = async () => {
    setResponse('');
    setError('');
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        setError('Permissão de câmera negada');
        setScreen('error');
        return;
      }
    }
    setScreen('camera');
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    setScreen('loading');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: true,
      });
      const text = await sendToAnthropic(photo.base64);
      setResponse(text);
      setScreen('result');
    } catch (e) {
      setError(e?.message || String(e));
      setScreen('error');
    }
  };

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 60) openCamera();
      },
    })
  ).current;

  if (screen === 'camera') {
    return (
      <View style={styles.flex}>
        <CameraView ref={cameraRef} style={styles.flex} facing="back">
          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.shutter}
              onPress={takePhoto}
              activeOpacity={0.7}
            />
          </View>
        </CameraView>
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.muted}>Analisando...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'result' || screen === 'error') {
    const isError = screen === 'error';
    return (
      <View style={styles.flex} {...swipeResponder.panHandlers}>
        <ScrollView contentContainerStyle={styles.resultContainer}>
          <Text style={isError ? styles.errorText : styles.responseText}>
            {isError ? error : response}
          </Text>
          <Text style={styles.hint}>
            Arraste para o lado ou toque no botão para tirar nova foto
          </Text>
        </ScrollView>
        <TouchableOpacity style={styles.fab} onPress={openCamera}>
          <Ionicons name="camera" size={28} color="#fff" />
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <TouchableOpacity onPress={openCamera} style={styles.iconButton}>
        <Ionicons name="camera" size={96} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.muted}>Toque para tirar foto</Text>
      <StatusBar style="light" />
    </View>
  );
}

async function sendToAnthropic(base64) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'Configure EXPO_PUBLIC_ANTHROPIC_API_KEY no arquivo .env e reinicie o expo'
    );
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64,
              },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text =
    data?.content
      ?.map((c) => c.text)
      .filter(Boolean)
      .join('\n') || '(sem resposta)';
  return text.trim();
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    gap: 20,
  },
  iconButton: {
    padding: 48,
    borderRadius: 200,
    backgroundColor: '#1f2937',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 60,
    backgroundColor: 'transparent',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    borderWidth: 6,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  resultContainer: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 140,
    backgroundColor: '#111',
    flexGrow: 1,
  },
  responseText: { fontSize: 22, color: '#fff', lineHeight: 30 },
  errorText: { fontSize: 16, color: '#ff6b6b', lineHeight: 22 },
  hint: {
    marginTop: 32,
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  muted: { color: '#888', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 32,
    backgroundColor: '#3b82f6',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
