import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX, PLAYER_COLORS, type ChatMessage } from '@starry/shared';

interface ChatPanelProps {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => Promise<boolean>;
  className?: string;
}

export function ChatPanel({ messages, myId, onSend, className = '' }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onSend(t);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm" aria-live="polite">
        {messages.length === 0 && <p className="py-6 text-center text-white/40">還沒有訊息，打個招呼吧 👋</p>}
        {messages.map((m) =>
          m.system ? (
            <p key={m.id} className="text-center text-xs text-cyan-100/60">
              ✦ {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.playerId === myId ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 ${
                  m.playerId === myId ? 'rounded-br-md bg-violet-500/35' : 'rounded-bl-md bg-white/10'
                }`}
              >
                {m.playerId !== myId && (
                  <span className="block text-xs font-semibold" style={{ color: PLAYER_COLORS[m.colorIndex]?.light ?? '#fff' }}>
                    {m.nickname}
                  </span>
                )}
                <span className="whitespace-pre-wrap break-words text-white/90">{m.text}</span>
              </div>
            </div>
          ),
        )}
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          className="field py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX}
          placeholder="輸入訊息…"
          aria-label="聊天訊息"
          enterKeyHint="send"
        />
        <button className="btn-teal shrink-0 whitespace-nowrap px-4" disabled={!text.trim() || sending} type="submit">
          送出
        </button>
      </form>
    </div>
  );
}
