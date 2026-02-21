export default function LearnPage() {
  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">📚 Level Up</h1>
        <p className="text-gray-500 mt-1">Courses and resources to boost your content game</p>
      </div>

      {/* Learning Tracks */}
      <section className="animate-fade-in">
        <h3 className="font-semibold text-[#1A1B3A] mb-4">Learning Tracks</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-children">
          {TRACKS.map((track) => (
            <div key={track.title} className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer">
              <div className="text-3xl mb-3">{track.icon}</div>
              <h4 className="font-semibold text-[#1A1B3A] group-hover:text-[#FF4D8D] transition-colors">{track.title}</h4>
              <p className="text-sm text-gray-500 mt-1 mb-3">{track.desc}</p>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] transition-all duration-500"
                  style={{ width: `${track.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{track.completed} of {track.total} lessons</span>
                <span>~{track.timeLeft} left</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Case Study */}
      <section className="animate-fade-in">
        <h3 className="font-semibold text-[#1A1B3A] mb-4">🏆 From the Top</h3>
        <div className="bg-gradient-to-br from-[#7C5CFC]/5 to-[#FF4D8D]/5 border border-purple-100 rounded-2xl p-5">
          <span className="text-xs font-bold uppercase tracking-widest text-[#7C5CFC]">📖 Case Study</span>
          <p className="text-sm text-[#1A1B3A] mt-3 leading-relaxed">
            <strong>How top creators go from 0 to $2,000+ GMV in 30 days:</strong>{' '}
            They post daily, use proven formats like &ldquo;I tried X for Y days&rdquo; for 60% of their videos, 
            and always reply to their top 3 comments within the first hour.
          </p>
        </div>
      </section>

      {/* Video Trainings */}
      <section className="animate-fade-in">
        <h3 className="font-semibold text-[#1A1B3A] mb-4">🎓 Video Trainings</h3>
        <div className="space-y-3">
          {TRAININGS.map((t) => (
            <div key={t.title} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group">
              <div className="text-2xl flex-shrink-0">{t.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#1A1B3A] group-hover:text-[#FF4D8D] transition-colors">
                  {t.title}
                  {t.isNew && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF4D8D] text-white">NEW</span>}
                </p>
                <p className="text-xs text-gray-500">{t.desc}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ${t.badgeColor}`}>{t.badge}</span>
                  <span className="text-xs text-gray-400">{t.duration}</span>
                </div>
              </div>
              <div className="text-xl text-gray-300 group-hover:text-[#FF4D8D] transition-colors">▶️</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const TRACKS = [
  { icon: '🎣', title: 'Hook Mastery', desc: 'Learn the hooks driving the most revenue this month.', progress: 40, completed: 4, total: 10, timeLeft: '25 min' },
  { icon: '📱', title: 'Film Like a Pro', desc: 'Lighting, angles, and editing tips for professional content.', progress: 0, completed: 0, total: 8, timeLeft: '40 min' },
  { icon: '🧪', title: 'Product Deep Dives', desc: 'Know your products inside and out.', progress: 75, completed: 6, total: 8, timeLeft: '10 min' },
  { icon: '💰', title: 'Maximize Your Earnings', desc: 'Strategies top earners use to convert viewers into buyers.', progress: 0, completed: 0, total: 12, timeLeft: '55 min' },
];

const TRAININGS = [
  { icon: '🧠', title: 'GMV Max 101', desc: 'Understanding the Algorithm', badge: 'ESSENTIAL', badgeColor: 'bg-[#FF4D8D]', duration: '12 min', isNew: false },
  { icon: '🎤', title: 'Beans Interview', desc: '$5M GMV Creator & Founder of Daily Virals', badge: 'INTERVIEW', badgeColor: 'bg-[#7C5CFC]', duration: '28 min', isNew: true },
  { icon: '📊', title: 'Reading Your Data', desc: 'How to use analytics to improve', badge: 'ESSENTIAL', badgeColor: 'bg-[#FF4D8D]', duration: '15 min', isNew: false },
  { icon: '🎬', title: 'Editing Hacks', desc: 'Quick edits that boost watch time', badge: 'POPULAR', badgeColor: 'bg-[#34D399]', duration: '20 min', isNew: true },
];
