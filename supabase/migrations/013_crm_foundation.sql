-- CRM Foundation Tables
-- Creator Activity Log (unified timeline)
CREATE TABLE creator_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  activity_type TEXT NOT NULL, -- 'note', 'status_change', 'outreach', 'message', 'payment', 'milestone', 'tag_change', 'retainer_change', 'brand_change'
  title TEXT,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  created_by TEXT DEFAULT 'system', -- 'system', 'tyler', 'alex', 'bot'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activity_creator ON creator_activity_log(creator_id, created_at DESC);
CREATE INDEX idx_activity_type ON creator_activity_log(activity_type);

-- Creator Tags
CREATE TABLE creator_tags (
  creator_id UUID NOT NULL,
  tag TEXT NOT NULL,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (creator_id, tag)
);
CREATE INDEX idx_tags_tag ON creator_tags(tag);

-- Creator Tasks/Reminders
CREATE TABLE creator_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  assigned_to TEXT DEFAULT 'tyler',
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tasks_due ON creator_tasks(due_date) WHERE NOT completed;
CREATE INDEX idx_tasks_creator ON creator_tasks(creator_id);
CREATE INDEX idx_tasks_assigned ON creator_tasks(assigned_to) WHERE NOT completed;

-- Saved Views
CREATE TABLE saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  filters JSONB NOT NULL, -- {brands: [], statuses: [], tags: [], search: ''}
  created_by TEXT DEFAULT 'tyler',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
