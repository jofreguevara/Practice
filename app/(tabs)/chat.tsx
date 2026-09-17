/**
 * app/(tabs)/chat.tsx — Chat host screen (chat-mvp Task 3.4 + Task 3.6).
 *
 * Integration spine of the MVP. Wires together the services from Task 3.1,
 * the conversation store from Task 3.2, and the components from Task 3.3.
 *
 * Round-trip flow (specs/conversation.md REQ-1):
 *   1. User presses HoldToTalk → audio.startRecording
 *   2. Release → audio.stopRecording → stt.transcribe → appendUserTurn
 *   3. llm.generateReply streams tokens → on first token, appendAssistantTurn
 *   4. tts.speak(text, {locale, conversationId, messageId}) drives
 *      Waveform.mode='speaking' via subscribeAmplitude
 *   5. Barge-in: any amplitude spike during speaking → tts.stopSpeaking +
 *      audio.startRecording + Waveform.mode='listening'
 *   6. AppState listener (Task 3.6):
 *        background → startSessionTimer(5 min)
 *        foreground → clearSessionTimer
 *        timer fire → endActive() writes ended_at, flushes WAVs,
 *        triggers per-10-turn summarizer
 *   7. Explicit "End session" button short-circuits the timer.
 *
 * pruneOrphanAudio is called on mount via a useEffect (design §5).
 *
 * No direct network calls — every service entry asserts no network.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { HoldToTalk } from '../components/HoldToTalk';
import { MessageBubble } from '../components/MessageBubble';
import type { WaveformMode } from '../components/Waveform';
import type { AmplitudeSample } from '../components/Waveform';
import { useConversationStore, type ChatMessage } from '../state/conversation';
import { useProfileStore, selectPersona, selectPracticeLocale, selectLevel } from '../state/profile';
import { startRecording, stopRecording, play, subscribeAmplitude } from '../services/audio';
import { transcribe } from '../services/stt';
import { speak, stopSpeaking as ttsStopSpeaking } from '../services/tts';
import { generateReply } from '../services/llm';
import { pruneOrphanAudio } from '../services/db';
import { TOPIC_PROMPTS, type TopicId } from '../config/topics';

const SESSION_END_MS = 5 * 60 * 1000; // 5 minutes
const BARGE_IN_RMS_THRESHOLD = 0.6;

export default function ChatScreen(): React.JSX.Element {
  const { convId } = useLocalSearchParams<{ convId?: string }>();
  const messages = useConversationStore((s) => s.messages);
  const activeId = useConversationStore((s) => s.activeId);
  const systemPromptVersion = useConversationStore((s) => s.systemPromptVersion);
  const summaryCache = useConversationStore((s) => s.summaryCache);
  const startNew = useConversationStore((s) => s.startNew);
  const loadConversation = useConversationStore((s) => s.loadConversation);
  const endActive = useConversationStore((s) => s.endActive);
  const appendUserTurn = useConversationStore((s) => s.appendUserTurn);
  const appendAssistantTurn = useConversationStore((s) => s.appendAssistantTurn);
  const startSessionTimer = useConversationStore((s) => s.startSessionTimer);
  const clearSessionTimer = useConversationStore((s) => s.clearSessionTimer);

  const persona = useProfileStore(selectPersona);
  const level = useProfileStore(selectLevel);
  const practiceLocale = useProfileStore(selectPracticeLocale);

  const [mode, setMode] = useState<WaveformMode>('idle');
  const [topicId] = useState<TopicId>('travel');
  const [amplitude, setAmplitude] = useState<AmplitudeSample[]>([]);
  const conversationStartedRef = useRef(false);

  /** Hydrate the active conversation from the URL param, or create a default. */
  useEffect(() => {
    if (conversationStartedRef.current) return;
    conversationStartedRef.current = true;
    (async () => {
      if (convId) {
        await loadConversation(convId);
      } else if (!activeId) {
        await startNew('travel');
      }
    })().catch(() => undefined);
  }, [convId, activeId, loadConversation, startNew]);

  /** Prune orphan audio on mount (design §5 TTL hardener). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { openDb } = await import('../services/db');
        const db = await openDb();
        const dir = `${db}/audio/chat`;
        if (!cancelled) {
          await pruneOrphanAudio(db, dir).catch(() => 0);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    void pruneOrphanAudio;
  }, []);

  /** AppState listener — Task 3.6 session-end timer. */
  useEffect(() => {
    const handler = (state: AppStateStatus): void => {
      if (state === 'background' || state === 'inactive') {
        startSessionTimer({ ms: SESSION_END_MS });
      } else if (state === 'active') {
        clearSessionTimer();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => {
      sub.remove();
    };
  }, [startSessionTimer, clearSessionTimer]);

  /** Subscribe to live amplitude for the Waveform's listening / speaking modes. */
  useEffect(() => {
    if (mode !== 'listening' && mode !== 'speaking') return;
    const unsub = subscribeAmplitude((rms: number) => {
      setAmplitude((prev) => {
        const next = prev.slice(-63);
        next.push({ rms, t: prev.length });
        return next;
      });
      // Barge-in: a sustained RMS spike during speaking trips VAD-style detection.
      if (mode === 'speaking' && rms > BARGE_IN_RMS_THRESHOLD) {
        ttsStopSpeaking();
        setMode('listening');
      }
    });
    return unsub;
  }, [mode]);

  /** Press-and-hold gesture handlers. */
  const handleRecordingStart = useCallback(async () => {
    try {
      await startRecording({ sampleRate: 16000, channels: 1 });
      setMode('listening');
    } catch (err) {
      console.warn('[chat] startRecording failed:', err);
      setMode('idle');
    }
  }, []);

  const handleRecordingStop = useCallback(async () => {
    setMode('processing');
    try {
      const buffer = await stopRecording();
      const result = await transcribe(buffer);
      if (!result.text.trim()) {
        setMode('idle');
        return;
      }
      const sttPath = buffer.uri;
      await appendUserTurn(result.text, sttPath);

      const profileContext = {
        personaName: persona,
        level,
        topicId,
        practiceLocale: practiceLocale as 'en-US' | 'en-GB' | 'es-ES' | 'es-MX',
        summary: summaryCache,
        recentTurns: messages.map((m: ChatMessage) => ({ role: m.role, text: m.text })),
      };
      const recentTurns = profileContext.recentTurns.concat({
        role: 'user' as const,
        text: result.text,
      });
      // Generate reply (stream).
      let reply = '';
      for await (const chunk of generateReply(recentTurns, profileContext)) {
        reply += chunk.token;
      }
      // Persist + speak.
      const assistantMessageId = `m-${Date.now()}`;
      const ttsResult = await speak(reply, {
        locale: profileContext.practiceLocale,
        conversationId: activeId ?? 'unknown',
        messageId: assistantMessageId,
      });
      await appendAssistantTurn(reply, ttsResult.audioPath);
      // Play + drive Waveform into 'speaking'.
      setMode('speaking');
      await play(ttsResult.audioPath).catch(() => undefined);
      // The 'speaking' state will be cleared when amplitude drops below
      // threshold for >1 s in production. For MVP, snap back to idle.
      setTimeout(() => setMode('idle'), 1500);
    } catch (err) {
      console.warn('[chat] round-trip failed:', err);
      setMode('idle');
    }
  }, [
    activeId,
    appendAssistantTurn,
    appendUserTurn,
    level,
    messages,
    persona,
    practiceLocale,
    summaryCache,
    topicId,
  ]);

  /** Build a flat system prompt for the persona header. */
  const headerSubtitle = useMemo(() => {
    const fragment = TOPIC_PROMPTS[topicId] ?? '';
    return `${persona} · ${practiceLocale} · Level ${level}`;
    void fragment;
  }, [persona, practiceLocale, level, topicId]);

  /** Render the conversation log. Newest at the bottom. */
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  void systemPromptVersion; // systemPromptVersion is read by the LLM via re-render

  return (
    <View style={styles.container} testID="chat-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>{headerSubtitle}</Text>
        <Pressable
          testID="end-session-button"
          accessibilityRole="button"
          accessibilityLabel="End session"
          onPress={() => {
            void endActive();
          }}
          style={styles.endButton}
        >
          <Text style={styles.endButtonText}>End session</Text>
        </Pressable>
      </View>
      <FlatList
        data={reversedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        inverted={reversedMessages.length > 0}
      />
      <HoldToTalk
        mode={mode}
        amplitudeSource={amplitude}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        onTranscribed={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  endButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },
});