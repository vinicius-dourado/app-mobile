import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
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

const isWeb = Platform.OS === 'web';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isWeb) return;
    if (screen === 'camera') {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => setCameraReady(true);
          }
        })
        .catch((e) => {
          setError(e?.message || String(e));
          setScreen('error');
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    }
  }, [screen]);

  const openCamera = async () => {
    setResponse('');
    setError('');
    if (!isWeb && !permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        setError('Permissão de câmera negada');
        setScreen('error');
        return;
      }
    }
    setCameraReady(false);
    setScreen('camera');
  };

  const takePhoto = async () => {
    setScreen('loading');
    try {
      let base64;
      if (isWeb) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      } else {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
          skipProcessing: true,
        });
        base64 = photo.base64;
      }
      const text = await sendToAnthropic(base64);
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
        {isWeb ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
          />
        ) : (
          <CameraView ref={cameraRef} style={styles.flex} facing="back" onCameraReady={() => setCameraReady(true)} />
        )}
        <View style={styles.cameraOverlay}>
          <TouchableOpacity
            style={[styles.shutter, !cameraReady && styles.shutterDisabled]}
            onPress={cameraReady ? takePhoto : undefined}
            activeOpacity={0.7}
          />
        </View>
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
      'anthropic-dangerous-direct-browser-access': 'true',
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
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    borderWidth: 6,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  shutterDisabled: {
    opacity: 0.3,
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
