'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

const QUICK_ACTIONS = [
  { icon: '🎣', label: 'Generate hooks for me', prompt: 'Generate 5 engaging video hooks for my next TikTok video.' },
  { icon: '📝', label: 'Write a video script', prompt: 'Write a 60-second TikTok video script for a product review.' },
  { icon: '🔍', label: 'Analyze my performance', prompt: 'Analyze my recent video performance and suggest improvements.' },
  { icon: '🔥', label: "What's working right now?", prompt: "What content formats and hooks are working best right now on TikTok Shop?" },
  { icon: '💡', label: 'Content ideas for this week', prompt: 'Give me 5 content ideas I can film this week.' },
  { icon: '📊', label: 'Why did my top video work?', prompt: 'Break down why my top-performing video was successful.' },
];

const KNOWLEDGE_TAGS = ['Your videos', 'Your GMV & sales', 'Brand top performers', "What's working now", 'Your strengths'];

export default function HarmonyPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hey! I'm Harmony, your AI content coach. 🎵\n\nI can help you write hooks, plan content, analyze your performance, and level up your TikTok Shop game.\n\nWhat would you like to work on?" },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: "Thanks for your message! 🎵 Harmony's AI backend isn't connected yet, but when it is, I'll be able to help you with personalized content strategy, hook generation, performance analysis, and more. Stay tuned!" },
    ]);
    setInput('');
  };

  return (
    <div className="max-w-5xl h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#FF4D8D] flex items-center justify-center text-lg">
            🎵
          </div>
          <div>
            <p className="font-semibold text-[#1A1B3A]">Harmony</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] inline-block" /> Ready
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#FF4D8D] text-white' : 'bg-gray-50 text-[#1A1B3A]'}`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-3 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
            }}
            placeholder="Ask me anything about your content strategy..."
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
            rows={1}
          />
          <button
            onClick={() => sendMessage(input)}
            className="h-10 w-10 rounded-xl bg-[#FF4D8D] text-white flex items-center justify-center hover:bg-[#e8447f] transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-72 space-y-4 flex-shrink-0">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm animate-fade-in">
          <h3 className="font-semibold text-sm text-[#1A1B3A] mb-3">⚡ Quick Actions</h3>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.prompt)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-gray-600 hover:bg-pink-50 hover:text-[#FF4D8D] transition-colors"
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Knowledge Tags */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm animate-fade-in">
          <h3 className="font-semibold text-sm text-[#1A1B3A] mb-3">🧠 Harmony knows about</h3>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_TAGS.map((t) => (
              <span key={t} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
