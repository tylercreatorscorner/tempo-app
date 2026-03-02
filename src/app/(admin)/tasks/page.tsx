import { TaskList } from '@/components/crm/task-list';

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Tasks</h1>
        <p className="text-sm text-gray-400 mt-1">Manage all creator-related tasks</p>
      </div>
      <TaskList />
    </div>
  );
}
