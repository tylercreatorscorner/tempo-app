'use client';

import { useState } from 'react';
import { MessageCircle, X, Star, Send, Check } from 'lucide-react';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!rating) return;
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          message: message.trim() || null,
          page_url: window.location.pathname,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setRating(0);
        setMessage('');
      }, 2000);
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-lg shadow-[#FF4D8D]/20 hover:opacity-90 transition-all flex items-center justify-center"
        aria-label="Send feedback"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 rounded-2xl border border-gray-200 bg-white shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {submitted ? (
            <div className="text-center py-6 space-y-2">
              <div className="inline-flex h-12 w-12 rounded-full bg-green-100 items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-semibold">Thanks for your feedback!</p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-semibold text-sm">How&apos;s your experience?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Your feedback helps us improve Tempo</p>
              </div>

              {/* Stars */}
              <div className="flex gap-1 justify-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        n <= (hoverRating || rating)
                          ? 'fill-[#FF4D8D] text-[#FF4D8D]'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us more (optional)..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
              />

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!rating || submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {submitting ? 'Sending...' : 'Send Feedback'} <Send className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
