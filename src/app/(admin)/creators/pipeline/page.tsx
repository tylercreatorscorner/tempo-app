import { KanbanPipeline } from '@/components/crm/kanban-pipeline';

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Creator Pipeline</h1>
        <p className="text-sm text-gray-400 mt-1">Drag creators between stages to update their status</p>
      </div>
      <KanbanPipeline />
    </div>
  );
}
