import { createAdminClient } from '@/lib/supabase/server';

// ── Types ──────────────────────────────────────────────

export type ActivityType =
  | 'note' | 'status_change' | 'outreach' | 'message'
  | 'payment' | 'milestone' | 'tag_change' | 'retainer_change' | 'brand_change';

export interface ActivityEntry {
  id: string;
  creator_id: string;
  activity_type: ActivityType;
  title: string | null;
  body: string | null;
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
}

export interface CreatorTag {
  creator_id: string;
  tag: string;
  created_by: string;
  created_at: string;
}

export interface CreatorTask {
  id: string;
  creator_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_to: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: { brands?: string[]; statuses?: string[]; tags?: string[]; search?: string };
  created_by: string;
  is_default: boolean;
  created_at: string;
}

export interface TaskFilters {
  assignedTo?: string;
  creatorId?: string;
  dueDate?: string;
  completed?: boolean;
}

// ── Timeline ───────────────────────────────────────────

export async function getCreatorTimeline(creatorId: string, page = 1, limit = 50) {
  const supabase = await createAdminClient();
  const offset = (page - 1) * limit;
  const { data, error } = await supabase
    .from('creator_activity_log')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data as ActivityEntry[];
}

export async function addTimelineEntry(
  creatorId: string,
  type: ActivityType,
  title: string | null,
  body: string | null,
  metadata: Record<string, any> = {},
  createdBy = 'system'
) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_activity_log')
    .insert({ creator_id: creatorId, activity_type: type, title, body, metadata, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data as ActivityEntry;
}

// ── Tags ───────────────────────────────────────────────

export async function getCreatorTags(creatorId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_tags')
    .select('*')
    .eq('creator_id', creatorId)
    .order('tag');
  if (error) throw error;
  return data as CreatorTag[];
}

export async function getAllTags() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_tags')
    .select('tag')
    .order('tag');
  if (error) throw error;
  const unique = [...new Set((data || []).map((d: any) => d.tag))];
  return unique as string[];
}

export async function addCreatorTag(creatorId: string, tag: string, createdBy = 'system') {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_tags')
    .upsert({ creator_id: creatorId, tag, created_by: createdBy }, { onConflict: 'creator_id,tag' })
    .select()
    .single();
  if (error) throw error;
  return data as CreatorTag;
}

export async function removeCreatorTag(creatorId: string, tag: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('creator_tags')
    .delete()
    .eq('creator_id', creatorId)
    .eq('tag', tag);
  if (error) throw error;
}

// ── Tasks ──────────────────────────────────────────────

export async function getTasks(filters: TaskFilters = {}) {
  const supabase = await createAdminClient();
  let query = supabase.from('creator_tasks').select('*').order('due_date', { ascending: true });
  if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
  if (filters.creatorId) query = query.eq('creator_id', filters.creatorId);
  if (filters.dueDate) query = query.lte('due_date', filters.dueDate);
  if (filters.completed !== undefined) query = query.eq('completed', filters.completed);
  const { data, error } = await query;
  if (error) throw error;
  return data as CreatorTask[];
}

export async function createTask(task: Partial<CreatorTask>) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw error;
  return data as CreatorTask;
}

export async function updateTask(id: string, updates: Partial<CreatorTask>) {
  const supabase = await createAdminClient();
  if (updates.completed) updates.completed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('creator_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CreatorTask;
}

export async function deleteTask(id: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase.from('creator_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ── Saved Views ────────────────────────────────────────

export async function getSavedViews() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from('saved_views').select('*').order('name');
  if (error) throw error;
  return data as SavedView[];
}

export async function createSavedView(name: string, filters: SavedView['filters'], createdBy = 'tyler') {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('saved_views')
    .insert({ name, filters, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data as SavedView;
}

export async function deleteSavedView(id: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase.from('saved_views').delete().eq('id', id);
  if (error) throw error;
}
