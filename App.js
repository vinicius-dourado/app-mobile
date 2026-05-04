import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o-mini';
const PROMPT =
  'Leia cuidadosamente a imagem e identifique enunciado e alternativas. Responda em duas linhas: 1) apenas a(s) alternativa(s) correta(s), ex: "A" ou "A e C". 2) uma explicacao com no maximo 30 palavras. Se estiver ilegivel, escreva: "Imagem ilegivel".';

const isWeb = Platform.OS === 'web';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isWeb) return;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

    if (screen === 'camera') {
      const webFacingMode = cameraFacing === 'front' ? 'user' : 'environment';
      stopStream();
      setCameraReady(false);
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: webFacingMode } } })
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
      stopStream();
      setCameraReady(false);
    }
  }, [screen, cameraFacing]);

  const openCamera = async () => {
    setResponse('');
    setError('');
    setCameraFacing('back');
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

  const flipCamera = () => {
    setCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const takePhoto = async () => {
    try {
      let base64;
      if (isWeb) {
        setScreen('loading');
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      } else {
        setScreen('loading');
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 1,
          skipProcessing: false,
        });
        base64 = photo.base64;
      }
      await analyzeImage(base64);
    } catch (e) {
      setError(e?.message || String(e));
      setScreen('error');
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        base64: true,
      });

      if (result.canceled) return;

      const base64 = result.assets?.[0]?.base64;
      if (!base64) {
        Alert.alert('Erro', 'Nao foi possivel ler a imagem selecionada.');
        return;
      }

      setScreen('loading');
      await analyzeImage(base64);
    } catch (e) {
      setError(e?.message || String(e));
      setScreen('error');
    }
  };

  const analyzeImage = async (base64) => {
    const text = await sendToOpenAI(base64);
    setResponse(text);
    setScreen('result');
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
          <CameraView
            ref={cameraRef}
            style={styles.flex}
            facing={cameraFacing}
            onCameraReady={() => setCameraReady(true)}
          />
        )}
        <TouchableOpacity style={styles.flipButton} onPress={flipCamera} activeOpacity={0.8}>
          <Ionicons name="camera-reverse" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.galleryButton} onPress={pickFromGallery} activeOpacity={0.8}>
          <Ionicons name="images" size={22} color="#fff" />
        </TouchableOpacity>
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

async function sendToOpenAI(base64) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'Configure EXPO_PUBLIC_OPENAI_API_KEY no arquivo .env e reinicie o expo'
    );
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content:
            'Voce resolve questoes a partir de imagem. A resposta deve ter exatamente duas linhas: primeira linha com alternativa(s) correta(s); segunda linha com explicacao objetiva de ate 30 palavras.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
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
  const text = data?.choices?.[0]?.message?.content || '(sem resposta)';
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
  flipButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryButton: {
    position: 'absolute',
    top: 56,
    left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
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
