import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreatorPerformanceTimeline } from '../../src/components/creators/performance/performance-timeline';
import { CreatorMetricReadout } from '../../src/components/creators/performance/metric-readout';
import type { PerformancePoint } from '../../src/components/creators/performance/model';
import './preview.css';

const amounts = [6500, 8200, 9100, 10200, 9800, 11200, 13800, 15600, 19400, 22400, 21800, 24600];
const counts = [12, 13, 12, 14, 10, 14, 16, 17, 18, 17, 16, 19];
const labels = ['Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026'];
const baseline: PerformancePoint[] = labels.map((label, i) => ({ key: String(i), label, gmv: amounts[i], posts: counts[i] }));
function Preview() {
  const [fixture, setFixture] = useState('year');
  const [dark, setDark] = useState(false);
  const points = fixture === 'empty' ? [] : fixture === 'single' ? baseline.slice(0, 1) : baseline.map((point, i) => ({ ...point,
    gmv: fixture === 'zero' ? 0 : fixture === 'gaps' && i === 4 ? null : fixture === 'large' ? point.gmv! * 1000 : point.gmv,
    posts: fixture === 'zero' ? 0 : fixture === 'gaps' && i === 7 ? null : point.posts,
  }));
  return <main style={{ colorScheme: dark ? 'dark' : 'light' }}>
    <header><h1>Creator design foundation</h1><p>Isolated component preview · Fictional data · No live requests</p></header>
    <div className="preview-controls"><label>Fixture <select value={fixture} onChange={e => setFixture(e.target.value)}><option value="year">Full year</option><option value="zero">Zero activity</option><option value="gaps">Missing data</option><option value="empty">No history</option><option value="single">Single period</option><option value="large">Large amounts</option></select></label><button type="button" onClick={() => setDark(value => !value)}>Toggle appearance</button></div>
    <CreatorPerformanceTimeline key={fixture} points={points} scopeLabel="Northstar Beauty · Sep 2025–Aug 2026" />
    <h2>Existing profile metrics</h2>
    <CreatorMetricReadout cells={[{ label: 'GMV', value: '$172,600', delta: 24 }, { label: 'Posts published', value: '178' }, { label: 'Views', value: '2.4M' }, { label: 'Engagement', value: '4.2%', foot: '96k likes' }, { label: 'GMV / post', value: '$970' }, { label: 'Orders', value: '4,100' }]} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
