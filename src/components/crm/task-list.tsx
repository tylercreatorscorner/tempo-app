'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Plus, Loader2, AlertTriangle, Calendar, Clock } from 'lucide-react';
import type { CreatorTask } from '@/lib/data/crm';

function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
}
function isToday(d: string | null) {
  if (!d) return false;
  const t = new Date(); const dd = new Date(d);
  return dd.getFullYear() === t.getFullYear() && dd.getMonth() === t.getMonth() && dd.getDate() === t.getDate();
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-500',
  high: 'text-orange-500',
  normal: 'text-gray-500',
  low: 'text-gray-400',
};

export function TaskList({ creatorId, assignedTo }: { creatorId?: string; assignedTo?: string }) {
  const [tasks, setTasks] = useState<CreatorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    const params = new URLSearchParams();
    if (creatorId) params.set('creator_id', creatorId);
    if (assignedTo) params.set('assigned_to', assignedTo);
    const res = await fetch(`/api/crm/tasks?${params}`);
    const d = await res.json();
    setTasks(d.tasks || []);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [creatorId, assignedTo]);

  const toggleComplete = async (task: CreatorTask) => {
    const updated = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: updated, completed_at: updated ? new Date().toISOString() : null } : t));
    await fetch(`/api/crm/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: updated }),
    });
  };

  const addTask = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    await fetch('/api/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        due_date: dueDate || null,
        priority,
        assigned_to: 'tyler',
        creator_id: creatorId || null,
      }),
    });
    setTitle(''); setDueDate(''); setPriority('normal'); setShowAdd(false);
    setSubmitting(false);
    fetchTasks();
  };

  const overdue = tasks.filter(t => !t.completed && isOverdue(t.due_date));
  const today = tasks.filter(t => !t.completed && isToday(t.due_date));
  const upcoming = tasks.filter(t => !t.completed && !isOverdue(t.due_date) && !isToday(t.due_date));
  const completed = tasks.filter(t => t.completed);

  const groups = [
    { label: 'Overdue', items: overdue, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Today', items: today, icon: Clock, color: 'text-orange-500' },
    { label: 'Upcoming', items: upcoming, icon: Calendar, color: 'text-blue-500' },
    { label: 'Completed', items: completed, icon: CheckCircle2, color: 'text-green-500' },
  ].filter(g => g.items.length > 0);

  if (loading) return <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#1A1B3A]">Tasks</h3>
          <p className="text-xs text-gray-400 mt-0.5">{tasks.filter(t => !t.completed).length} open</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <Plus className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {showAdd && (
        <div className="px-6 py-4 border-b border-gray-50 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
          <div className="flex gap-2">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
            <select value={priority} onChange={e => setPriority(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button onClick={addTask} disabled={submitting || !title.trim()} className="px-4 py-1.5 rounded-lg bg-[#FF4D8D] text-white text-sm font-medium hover:bg-pink-600 disabled:opacity-50 transition flex items-center gap-1">
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />} Add
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div className="px-6 py-12 text-center text-gray-400 text-sm">No tasks yet</div>
      )}

      {groups.map(group => (
        <div key={group.label}>
          <div className="px-6 py-2 bg-gray-50 flex items-center gap-2">
            <group.icon className={`h-3.5 w-3.5 ${group.color}`} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{group.label}</span>
            <span className="text-xs text-gray-400">({group.items.length})</span>
          </div>
          <div className="divide-y divide-gray-50">
            {group.items.map(task => (
              <div key={task.id} className="px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                <button onClick={() => toggleComplete(task)} className="flex-shrink-0">
                  {task.completed
                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : <Circle className="h-5 w-5 text-gray-300 hover:text-[#FF4D8D] transition" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${task.completed ? 'line-through text-gray-400' : 'text-[#1A1B3A]'}`}>{task.title}</span>
                  {task.due_date && (
                    <span className={`ml-2 text-xs ${isOverdue(task.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                      {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority] || 'text-gray-400'}`}>{task.priority}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
