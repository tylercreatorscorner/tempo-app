# Tempo Feature Specs

> Written: 2026-03-03 | Author: Alex (AI) | Platform: Next.js + Supabase

---

# Feature 1: Messages Section Redesign

## Problem Statement

The current messages section feels like a developer prototype — conversation list, chat thread, bulk messaging, and test DM exist but lack the polish and workflow integration brand managers expect. The goal is a CRM-grade messaging experience that's dead simple for clients who manage dozens to hundreds of creator relationships.

## Design Philosophy

**Inspiration mapping:**
- **HubSpot Sequences** → Multi-step outreach automation with delays, conditions, and templates. Brand managers enroll creators into sequences rather than manually sending each message.
- **Intercom Inbox** → Three-panel layout (sidebar list → conversation → context panel). Real-time, unified inbox across channels. Conversation states (open/snoozed/closed). Team assignment.
- **CreatorIQ/Grin** → Creator-centric CRM where messaging is tied to campaign context. Contact info aggregation across platforms. Bulk outreach with personalization variables.

**Core principle:** A brand manager should be able to select 50 creators, pick a template, and send personalized outreach in under 60 seconds — then track every reply from one inbox.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Messages Page                         │
├──────────┬──────────────────────┬───────────────────────┤
│ Sidebar  │   Conversation View  │   Context Panel       │
│          │                      │                        │
│ Filters  │   Message Thread     │   Creator Profile      │
│ Segments │   Reply Box          │   Contact Info         │
│ Folders  │   Template Insert    │   Campaign History     │
│ Search   │                      │   Tags & Notes         │
│          │                      │   Quick Actions        │
└──────────┴──────────────────────┴───────────────────────┘
```

---

## Data Models

### `conversations`
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  creator_id UUID REFERENCES creators(id),
  channel TEXT NOT NULL, -- 'email' | 'discord' | 'tiktok_dm' | 'in_app'
  status TEXT DEFAULT 'open', -- 'open' | 'snoozed' | 'closed' | 'archived'
  snoozed_until TIMESTAMPTZ,
  assigned_to UUID REFERENCES users(id),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT DEFAULT 0,
  tags TEXT[],
  campaign_id UUID REFERENCES campaigns(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversations_brand_status ON conversations(brand_id, status);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

### `messages`
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  sender_type TEXT NOT NULL, -- 'brand_manager' | 'creator' | 'system'
  sender_id UUID,
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT,
  template_id UUID REFERENCES message_templates(id),
  sequence_step_id UUID,
  status TEXT DEFAULT 'sent', -- 'draft' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced'
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}', -- channel-specific data (email message-id, discord message id, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

### `message_templates`
```sql
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  name TEXT NOT NULL,
  subject TEXT, -- for email
  body TEXT NOT NULL,
  body_html TEXT,
  channel TEXT NOT NULL, -- 'email' | 'discord' | 'tiktok_dm' | 'universal'
  category TEXT, -- 'outreach' | 'follow_up' | 'onboarding' | 'payment' | 'custom'
  variables TEXT[], -- ['creator_name', 'brand_name', 'commission_rate', 'product_name']
  is_shared BOOLEAN DEFAULT false, -- shared across brand managers
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `sequences`
```sql
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'archived'
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id),
  step_order INT NOT NULL,
  action TEXT NOT NULL, -- 'send_message' | 'wait' | 'condition'
  template_id UUID REFERENCES message_templates(id),
  channel TEXT,
  delay_days INT, -- wait X days before this step
  delay_hours INT,
  condition_type TEXT, -- 'no_reply' | 'opened' | 'clicked' | null
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id),
  creator_id UUID REFERENCES creators(id),
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active' | 'completed' | 'replied' | 'unenrolled' | 'bounced'
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  enrolled_by UUID REFERENCES users(id)
);
```

### `creator_contacts`
```sql
CREATE TABLE creator_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id),
  channel TEXT NOT NULL, -- 'email' | 'discord' | 'tiktok' | 'instagram' | 'phone'
  value TEXT NOT NULL, -- the actual handle/address
  is_primary BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  source TEXT, -- 'manual' | 'tiktok_bio' | 'application_form' | 'import'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, channel, value)
);
```

---

## Component Structure

### Page Layout: `MessagesPage`

```
app/
  messages/
    page.tsx                    -- Main messages layout
    components/
      ConversationSidebar.tsx   -- Left panel: search, filters, conversation list
      ConversationList.tsx      -- Scrollable conversation items
      ConversationItem.tsx      -- Single conversation row (avatar, name, preview, time, unread badge)
      ChatThread.tsx            -- Center panel: message history + reply
      MessageBubble.tsx         -- Individual message (sent vs received styling)
      ReplyComposer.tsx         -- Rich text reply box with template insert
      CreatorContextPanel.tsx   -- Right panel: creator info, history, actions
      TemplateLibrary.tsx       -- Modal/drawer: browse, search, insert templates
      TemplateEditor.tsx        -- Create/edit template with variable picker
      BulkComposer.tsx          -- Modal: select recipients, pick template, preview, send
      SequenceBuilder.tsx       -- Visual sequence editor (step cards with drag)
      SequenceEnrollModal.tsx   -- Enroll selected creators into a sequence
      DeliveryTracker.tsx       -- Status badges and delivery analytics
      SegmentPicker.tsx         -- Filter creators by tier/brand/activity for bulk ops
      ContactLinker.tsx         -- UI to add/verify creator contact methods
```

### `ConversationSidebar` — Left Panel

**Sections:**
1. **Search bar** — Full-text search across conversations and messages
2. **Quick filters** (tab-style):
   - All | Unread | Mine | Unassigned
3. **Folder filters** (collapsible):
   - By Status: Open, Snoozed, Closed
   - By Channel: Email, Discord, TikTok DM
   - By Campaign: dropdown of active campaigns
   - By Tag: custom tags
4. **Conversation list** — Sorted by `last_message_at DESC`

Each `ConversationItem` shows:
- Creator avatar (from TikTok)
- Creator name + handle
- Channel icon (email/discord/tiktok)
- Last message preview (truncated 80 chars)
- Relative timestamp
- Unread count badge
- Assigned-to avatar (small)
- Campaign tag pill

**Keyboard navigation:** Up/Down arrows to navigate, Enter to select.

### `ChatThread` — Center Panel

**Header bar:**
- Creator name + avatar
- Channel indicator
- Status dropdown (Open → Snoozed → Closed)
- Assign dropdown
- More menu (archive, tag, add to sequence)

**Message area:**
- Chronological message bubbles
- Sent messages right-aligned (brand color)
- Received messages left-aligned (gray)
- System messages centered (enrollment notifications, status changes)
- Each bubble shows: content, timestamp, delivery status icon (✓ sent, ✓✓ delivered, 👁 read, ⚠ failed)
- Date separators between days

**ReplyComposer:**
- Rich text input (bold, italic, links — no complex formatting)
- Template insert button → opens TemplateLibrary drawer
- Variable chip insertion (@creator_name auto-resolves)
- Channel selector if creator has multiple contact methods
- Send button + keyboard shortcut (Cmd+Enter)
- "Schedule send" option

### `CreatorContextPanel` — Right Panel

**Sections (accordion-style):**

1. **Profile Summary**
   - Avatar, name, TikTok handle
   - Follower count, engagement rate
   - Tier badge (Gold/Silver/Bronze)
   - Active brands

2. **Contact Info** (`ContactLinker`)
   - Email (verified ✓ / unverified)
   - Discord ID
   - TikTok handle
   - "Add contact method" button
   - Source tag (from bio, manual, form)

3. **Campaign History**
   - List of campaigns they're in
   - GMV/sales per campaign
   - Commission earned

4. **Conversation History**
   - Timeline of all past conversations across channels
   - Clickable to navigate

5. **Notes & Tags**
   - Free-text notes field
   - Tag editor

6. **Quick Actions**
   - "Add to campaign"
   - "Enroll in sequence"
   - "Send template"
   - "View creator profile" (full page)

### `TemplateLibrary`

Opens as a **right-side drawer** or **modal**.

**Layout:**
- Search bar
- Category tabs: All | Outreach | Follow-Up | Onboarding | Payment | Custom
- Channel filter: All | Email | Discord | Universal
- Grid of template cards:
  - Template name
  - Preview (first 2 lines)
  - Usage count
  - Last used
  - "Use" button → inserts into composer
  - "Edit" button → opens TemplateEditor

**Variable system:**
| Variable | Resolves To |
|---|---|
| `{{creator_name}}` | Creator's display name |
| `{{creator_handle}}` | @tiktokhandle |
| `{{brand_name}}` | Current brand name |
| `{{commission_rate}}` | Their commission % |
| `{{product_name}}` | Featured product |
| `{{product_link}}` | TikTok Shop product URL |
| `{{campaign_name}}` | Campaign they're in |
| `{{manager_name}}` | Brand manager's name |
| `{{custom_1}}` through `{{custom_5}}` | Freeform per-send |

### `BulkComposer`

**Flow (3 steps):**

**Step 1: Select Recipients**
- Start from: creator list, segment, campaign, or manual selection
- `SegmentPicker` with filters:
  - Tier (Gold, Silver, Bronze, New)
  - Brand(s)
  - Activity: Active (posted in 30d), Inactive (no post in 30d), Never posted
  - GMV range
  - Tags
- Shows count: "247 creators selected"
- Preview list with ability to remove individuals

**Step 2: Compose Message**
- Pick channel (email preferred, fallback to discord, etc.)
- Pick or write template
- Variable preview: shows 3 random recipients with variables resolved
- Subject line (for email)
- "Send as sequence" toggle → picks a sequence instead

**Step 3: Review & Send**
- Summary: X recipients, channel breakdown, template preview
- Delivery estimate (rate-limited sending)
- Schedule option (send now or pick date/time)
- "Send" button with confirmation dialog

### `SequenceBuilder`

**Visual editor** (inspired by HubSpot):

```
┌─────────────────┐
│ Step 1: Email    │  ← Template: "Initial Outreach"
│ Send immediately │
└────────┬────────┘
         │
    ⏱ Wait 3 days
         │
    ┌────┴────┐
    │ Replied? │
    ├─Yes──────┤──→ [End: Move to "Engaged" segment]
    │ No       │
    └────┬─────┘
         │
┌────────┴────────┐
│ Step 2: Email    │  ← Template: "Follow Up #1"
│ If no reply      │
└────────┬────────┘
         │
    ⏱ Wait 5 days
         │
┌────────┴────────┐
│ Step 3: Discord  │  ← Template: "Discord Nudge"
│ If no reply      │
└─────────────────┘
```

- Drag-and-drop step cards
- Step types: Send Message, Wait, Condition (replied/opened/clicked)
- Each send step picks a template + channel
- Auto-unenroll on reply (configurable)
- Enrollment stats shown inline (X active, Y completed, Z replied)

---

## API Routes

```
app/api/
  messages/
    conversations/
      route.ts              -- GET (list), POST (create)
      [id]/
        route.ts            -- GET (single), PATCH (update status/assignment)
        messages/
          route.ts          -- GET (thread), POST (send message)
    templates/
      route.ts              -- GET (list), POST (create)
      [id]/
        route.ts            -- GET, PATCH, DELETE
    sequences/
      route.ts              -- GET (list), POST (create)
      [id]/
        route.ts            -- GET, PATCH, DELETE
        enroll/
          route.ts          -- POST (enroll creators)
        steps/
          route.ts          -- GET, POST, PUT (reorder)
    bulk/
      route.ts              -- POST (bulk send)
      preview/
        route.ts            -- POST (preview with variables resolved)
    contacts/
      route.ts              -- GET, POST (creator contacts)
      verify/
        route.ts            -- POST (trigger verification)
```

**Key API behaviors:**
- `GET /api/messages/conversations` — paginated, filterable by status/channel/campaign/assignee. Returns with last message preview. Supports `?q=` full-text search.
- `POST /api/messages/bulk` — accepts `{ template_id, creator_ids[], channel, variables_override{}, scheduled_at? }`. Returns job ID. Processing is async via background worker.
- `GET /api/messages/conversations/[id]/messages` — paginated cursor-based (for infinite scroll up).

**Real-time:** Use Supabase Realtime subscriptions on `messages` table for live updates. New message → update conversation list + thread.

---

## Contact Info Connection Flow

### How creator contact info gets into the system:

1. **TikTok bio scraping** — When a creator is added, parse their TikTok bio for email addresses, Discord handles, Linktree URLs. Store as `source: 'tiktok_bio'`, unverified.

2. **Application/onboarding form** — When creators apply to a brand's program, collect email + Discord as required fields. Store as `source: 'application_form'`, semi-verified.

3. **Manual entry** — Brand manager adds contact info from any source. Store as `source: 'manual'`.

4. **CSV import** — Bulk import creator contact info. Store as `source: 'import'`.

5. **Creator self-service** — If creators have a portal/profile, they update their own info. Store as `source: 'creator_portal'`, verified.

### Verification:
- **Email:** Send verification email with confirm link (optional — may be overkill for MVP).
- **Discord:** Verify by matching Discord user ID via bot (if they're in a shared server).
- **TikTok:** Verified by default if they authenticated via TikTok OAuth.

### `ContactLinker` Component:
- Shows all known contact methods with verified/unverified badges
- "Add" button opens a small form (channel dropdown + value input)
- "Set as primary" toggle per channel
- Shows source ("Found in TikTok bio" / "From application form" / "Added manually")

---

## Delivery Tracking

### Per-message status flow:
```
draft → queued → sent → delivered → read → (replied)
                    ↘ failed
                    ↘ bounced
```

### Channel-specific tracking:

| Channel | Sent | Delivered | Read | Reply Detection |
|---|---|---|---|---|
| Email (SendGrid/Resend) | ✓ | ✓ (webhook) | ✓ (pixel/webhook) | ✓ (inbound parse) |
| Discord (bot DM) | ✓ | ✓ (API confirms) | ✗ | ✓ (bot receives reply) |
| TikTok DM | ✓ | ✗ (no API) | ✗ | ✗ (manual check) |
| In-app | ✓ | ✓ | ✓ | ✓ |

### `DeliveryTracker` Component:
- **Inline (per message):** Small icon next to timestamp (✓ ✓✓ 👁)
- **Bulk send dashboard:** After a bulk send, show:
  - Total sent / delivered / opened / replied / failed / bounced
  - Bar chart over time (opens/replies per day)
  - List of failed/bounced with reason
  - "Retry failed" button

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Database tables (conversations, messages, templates, creator_contacts)
- Three-panel layout (ConversationSidebar, ChatThread, CreatorContextPanel)
- Basic conversation list with search and status filters
- Message thread view with send functionality (in-app channel only)
- Manual contact info entry (ContactLinker)

### Phase 2: Templates & Bulk (Week 3-4)
- Template CRUD (TemplateLibrary, TemplateEditor)
- Variable system with resolution
- BulkComposer (3-step flow)
- SegmentPicker with tier/brand/activity filters
- Basic delivery tracking (sent/failed status)

### Phase 3: Multi-Channel (Week 5-6)
- Email integration (SendGrid or Resend)
  - Send from brand's domain
  - Inbound reply parsing (webhook)
  - Open/click tracking
- Discord integration (bot DMs)
  - Send via existing Discord bot
  - Reply detection
- Channel preference per creator (primary contact method)

### Phase 4: Sequences & Automation (Week 7-8)
- Sequence builder UI
- Sequence step execution engine (background worker/cron)
- Auto-unenroll on reply
- Condition evaluation (opened, clicked, no reply)
- Enrollment management

### Phase 5: Polish (Week 9-10)
- Real-time updates (Supabase Realtime)
- Keyboard shortcuts
- Bulk send analytics dashboard
- Snooze/reminder functionality
- Mobile-responsive layout
- Performance optimization (virtual scroll for large lists)

---
---

# Feature 2: Discover / Trending Tab (Daily Virals Integration)

## Problem Statement

Brand managers need to discover trending TikTok Shop content to: (a) identify high-performing products and content formats, (b) find new creators to recruit, and (c) get inspiration for briefs. Currently they use external tools like thedailyvirals.com, Kalodata, or manual TikTok browsing. Integrating this into Tempo keeps them in one platform and connects discovery directly to action (outreach, campaign creation).

## Design Philosophy

Build a **focused, actionable** version — not a full analytics platform. The key differentiator is the workflow connection: see a trending video → one click to view the creator → one click to reach out. Every piece of data shown should help a brand manager make a decision.

---

## Data Sources Analysis

### Option A: TikTok Creative Center (Official)
- **What it provides:** Trending hashtags, songs, creators, and videos. Some product-level data via TikTok Shop APIs.
- **Access:** Free API, rate-limited. Requires TikTok for Business account.
- **Pros:** Official, reliable, legal.
- **Cons:** Limited granularity. No GMV/revenue data. Video-level metrics may be delayed. No product revenue data.
- **Verdict:** Good for trending content discovery. Insufficient for Shop-specific analytics.

### Option B: Third-Party Providers (Kalodata, FastMoss, Shoplus)
- **What they provide:** TikTok Shop-specific data — product rankings, creator GMV, video performance tied to sales, commission rates, revenue trends.
- **Access:** Paid API or data licensing. Kalodata ~$200-500/mo for API access. FastMoss similar.
- **Pros:** Rich Shop data (GMV, revenue, commissions). Exactly what brand managers need.
- **Cons:** Cost. Data accuracy varies. Terms may restrict redistribution. API stability uncertain.
- **Verdict:** Best for MVP. License data from one provider rather than building scraping infra.

### Option C: Self-Scraping
- **What we'd build:** Scrape TikTok Creative Center, public product pages, creator profiles.
- **Pros:** No licensing cost. Full control.
- **Cons:** Legal risk (ToS violations). Maintenance burden. Anti-bot measures. No direct GMV data (only public metrics).
- **Verdict:** Not recommended for MVP. Consider for supplementary data later.

### Recommended Approach
1. **MVP:** Integrate Kalodata or FastMoss API for TikTok Shop product/video/creator data
2. **Supplement:** TikTok Creative Center API for trending hashtags and content themes
3. **Internal data:** Cross-reference with Tempo's own video performance data (404K+ videos in Supabase)
4. **Long-term:** Build proprietary ranking algorithms combining external + internal data

---

## Data Models

### `discover_videos`
```sql
CREATE TABLE discover_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_video_id TEXT UNIQUE NOT NULL,
  creator_handle TEXT NOT NULL,
  creator_id UUID REFERENCES creators(id), -- null if not in our system
  caption TEXT,
  thumbnail_url TEXT,
  video_url TEXT,
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  engagement_rate DECIMAL(5,4),
  product_id TEXT, -- external product ID
  product_name TEXT,
  product_image_url TEXT,
  product_revenue_30d DECIMAL(12,2),
  product_revenue_trend DECIMAL(5,2), -- % change
  product_weekly_growth DECIMAL(5,2),
  creator_gmv_30d DECIMAL(12,2),
  creator_gmv_trend DECIMAL(5,2),
  category TEXT, -- 'health' | 'beauty' | 'skincare' | 'fashion' | etc.
  rank INT, -- daily rank
  rank_date DATE,
  data_source TEXT, -- 'kalodata' | 'fastmoss' | 'creative_center'
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_discover_rank ON discover_videos(rank_date, rank);
CREATE INDEX idx_discover_category ON discover_videos(category, rank_date);
CREATE INDEX idx_discover_creator ON discover_videos(creator_handle);
```

### `saved_products`
```sql
CREATE TABLE saved_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  brand_id UUID REFERENCES brands(id),
  product_id TEXT NOT NULL,
  product_name TEXT,
  product_image_url TEXT,
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT now()
);
```

### `discover_syncs`
```sql
CREATE TABLE discover_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source TEXT NOT NULL,
  sync_type TEXT NOT NULL, -- 'daily_trending' | 'category_refresh' | 'product_detail'
  status TEXT DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  records_fetched INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
```

---

## Component Structure

```
app/
  discover/
    page.tsx                      -- Main discover page
    components/
      DiscoverHeader.tsx          -- Title, date picker, view toggle
      FilterBar.tsx               -- Category, product search, date, sort
      CategoryTabs.tsx            -- Horizontal scrollable category pills
      VideoCardGrid.tsx           -- Grid/list of trending video cards
      VideoCard.tsx               -- Individual video card (thumbnail, metrics, actions)
      VideoCardExpanded.tsx       -- Expanded view with more detail
      CreatorQuickView.tsx        -- Hover/click popup: creator stats + "Reach Out" CTA
      ProductInfoBar.tsx          -- Product details within a card (revenue, growth)
      TrendSparkline.tsx          -- Tiny inline chart (14-day trend)
      SaveProductButton.tsx       -- Bookmark a product
      ActionBar.tsx               -- Transcribe, AI Rewrite, Add to Campaign
      VideoPreviewModal.tsx       -- Play video in modal with full details
      DiscoverEmptyState.tsx      -- When no results / loading
      PaginationControls.tsx      -- Page navigation
    hooks/
      useDiscoverVideos.ts        -- SWR/React Query hook for fetching
      useFilters.ts               -- URL-synced filter state
      useSavedProducts.ts         -- Save/unsave products
```

---

## UI Design

### Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  Discover                          [Date: Today ▾] [⊞ ≡] │
├──────────────────────────────────────────────────────────┤
│  [All] [Health] [Beauty] [Skincare] [Fashion] [Home] ... │
├──────────────────────────────────────────────────────────┤
│  Search products...    Sort: [Top Viewed ▾]   Results: 247│
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ #1                                                   │ │
│  │ ┌──────────┐  @creator_handle                       │ │
│  │ │          │  "This serum changed my skin in..."     │ │
│  │ │ 📹 thumb │  👁 2.4M  ❤️ 341K  💬 12K  ↗️ 8.2K    │ │
│  │ │          │                                         │ │
│  │ │  ▶ Play  │  Creator GMV (30D): $48,200 ↑12%       │ │
│  │ └──────────┘  ┌─────────────────────────────────┐   │ │
│  │               │ 🛍 Product: Glow Serum           │   │ │
│  │               │ Revenue: $124K ↑23% | 14d: ╱╲╱  │   │ │
│  │               │ [Save] [Filter by Product]       │   │ │
│  │               └─────────────────────────────────┘   │ │
│  │                                                      │ │
│  │  [👤 View Creator] [✉ Reach Out] [📋 Add to Brief]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ #2 ...                                               │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  [← Prev]  Page 1 of 24  [Next →]                        │
└──────────────────────────────────────────────────────────┘
```

### `VideoCard` Component — Detail

**Left section:** Video thumbnail (16:9 or 9:16 aspect) with play button overlay. Click opens `VideoPreviewModal`.

**Center section:**
- Creator handle (clickable → `CreatorQuickView` popover)
- Caption (2-line truncation, expandable)
- Metrics row: Views, Likes, Comments, Shares — with compact number formatting (2.4M, 341K)
- Creator GMV badge: "$48.2K (30D) ↑12%" with `TrendSparkline`

**Right section / Below:**
- Product card (`ProductInfoBar`):
  - Product thumbnail (small)
  - Product name
  - Revenue with trend arrow and % change
  - `TrendSparkline` (14-day revenue)
  - Weekly growth %
  - [Save Product] bookmark icon
  - [Filter by Product] → filters the grid to show all videos for this product

**Action row (bottom of card):**
- **View Creator** → navigates to full creator profile in Tempo (or creates a prospect record)
- **Reach Out** → opens BulkComposer pre-filled with this creator. If creator is already in system, opens conversation. If not, creates a prospect + opens compose.
- **Add to Brief** → saves video as reference content for a campaign brief
- **Transcribe** (stretch) → AI transcription of the video content
- **AI Rewrite** (stretch) → Generate a brief/script based on this video's approach

### `CreatorQuickView` Popover

On hover/click of creator handle:
- Avatar + name + handle
- Followers / Avg views / Engagement rate
- GMV (30D) with sparkline
- Top 3 categories
- "Already in Tempo" badge (if they're an existing creator) or "New creator" tag
- [View Full Profile] [Reach Out] buttons

### `FilterBar`

- **Category tabs** (horizontal scroll): All, Health & Wellness, Beauty, Skincare, Fashion, Home & Garden, Food, Tech, Pets, Fitness. Sourced from data. Shows count per category.
- **Product search**: Autocomplete text input searching product names
- **Date picker**: Single date (defaults to today). Option for date range.
- **Sort**: Top Viewed, Most Engaged (engagement rate), Highest Revenue, Fastest Growing, Newest
- **View toggle**: Grid view (cards) vs. compact list view (table-style)

### `TrendSparkline`

Tiny inline SVG chart (80x24px). Shows 14 data points. Green if uptrend, red if downtrend. No axes or labels — just the line. Used for both creator GMV and product revenue trends.

---

## API Routes

```
app/api/
  discover/
    videos/
      route.ts              -- GET: paginated, filtered trending videos
    products/
      route.ts              -- GET: search products (autocomplete)
      saved/
        route.ts            -- GET: user's saved products. POST: save. DELETE: unsave.
    creators/
      [handle]/
        route.ts            -- GET: creator quick stats
        prospect/
          route.ts          -- POST: add as prospect to Tempo
    sync/
      route.ts              -- POST: trigger manual sync (admin). GET: sync status.
    transcribe/
      route.ts              -- POST: AI transcribe a video
    rewrite/
      route.ts              -- POST: AI generate brief from video
```

**Key API behaviors:**

`GET /api/discover/videos`
```
Query params:
  ?date=2026-03-03
  &category=beauty
  &product=serum
  &sort=views|engagement|revenue|growth
  &page=1
  &limit=20

Response: {
  videos: DiscoverVideo[],
  total: number,
  page: number,
  totalPages: number,
  categories: { name: string, count: number }[]
}
```

### Data Sync Worker

Background job (cron, every 6 hours or daily):

```typescript
// lib/discover/sync.ts

async function syncDailyTrending() {
  // 1. Fetch from Kalodata/FastMoss API
  const externalData = await fetchFromProvider('kalodata', {
    type: 'trending_videos',
    date: today(),
    limit: 500,
  });

  // 2. Normalize to our schema
  const normalized = externalData.map(normalizeVideo);

  // 3. Cross-reference with internal creators table
  for (const video of normalized) {
    const existingCreator = await findCreatorByHandle(video.creator_handle);
    if (existingCreator) {
      video.creator_id = existingCreator.id;
    }
  }

  // 4. Upsert to discover_videos
  await supabase.from('discover_videos').upsert(normalized, {
    onConflict: 'tiktok_video_id',
  });

  // 5. Log sync
  await logSync('daily_trending', normalized.length);
}
```

---

## Brand Manager Workflow Integration

### Discovery → Outreach → Track Pipeline

```
1. DISCOVER
   Brand manager opens Discover tab
   Filters by category relevant to their brand
   Sees trending videos with creator + product data
   
2. EVALUATE
   Clicks creator → sees GMV, engagement, content style
   Checks if creator is already in Tempo (badge)
   Saves interesting products for reference
   
3. RECRUIT
   Clicks "Reach Out" on promising creator
   → If creator exists: opens Messages with pre-filled template
   → If new: creates prospect record, opens compose
   Template auto-fills: creator name, product they promoted, their metrics
   
4. TRACK
   Creator appears in campaign pipeline
   Messages tracked in conversations
   Performance tracked via existing Tempo video analytics
```

### Key integration points:
- **Discover → Creators:** "View Creator" links to creator profile. "Add as Prospect" creates a lightweight creator record.
- **Discover → Messages:** "Reach Out" pre-fills a message template with context (the video they were found from, the product).
- **Discover → Campaigns:** "Add to Brief" saves the video as reference content on a campaign.
- **Discover → Products:** Saved products can be tracked over time (price, revenue trend).

---

## Implementation Phases

### Phase 1: MVP — Static Daily Feed (Week 1-2)
- Set up data provider account (Kalodata preferred)
- Build sync worker (daily cron, fetch top 200 videos)
- Database tables (discover_videos, saved_products, discover_syncs)
- Basic Discover page: VideoCardGrid with VideoCards
- Category tabs (from data)
- Date picker (single day)
- Sort (views, engagement)
- Pagination
- Product search (basic text filter)
- TrendSparkline component
- **No** creator cross-referencing yet
- **No** action buttons beyond "Save Product"

**Deliverable:** Brand managers can browse today's trending TikTok Shop videos, filter by category, sort, and save products. Pure read-only discovery.

### Phase 2: Creator Connection (Week 3-4)
- Cross-reference discovered creators with existing Tempo creators
- CreatorQuickView popover with stats
- "Already in Tempo" badge on VideoCards
- "View Creator" button → links to Tempo creator profile
- "Add as Prospect" for new creators → creates minimal creator record
- Creator GMV sparklines

**Deliverable:** Brand managers can identify which trending creators they already work with and quickly prospect new ones.

### Phase 3: Action Integration (Week 5-6)
- "Reach Out" button → opens Messages compose with context
- Outreach template: "Hey {{creator_name}}, I saw your video about {{product_name}} — it's crushing it with {{views}} views! We'd love to work together on..."
- "Add to Brief" → saves video as campaign reference
- View toggle (grid vs. list)
- Improved filters (GMV range, growth rate, view threshold)

**Deliverable:** Full scout → reach out → track workflow within Tempo.

### Phase 4: AI Features & Polish (Week 7-8)
- Video transcription (Whisper API or similar — fetch video audio, transcribe)
- AI brief generator ("Rewrite this creator's approach as a campaign brief")
- Product tracking (saved products show updated metrics daily)
- Compact list view for power users
- Keyboard shortcuts (J/K to navigate, S to save, R to reach out)
- Performance: virtual scrolling, image lazy loading, prefetch next page
- Mobile responsive grid (1 column on mobile, 2 on tablet, 3 on desktop)

### Phase 5: Proprietary Intelligence (Future)
- Combine external data with Tempo's internal video performance data
- "Rising creators" algorithm (high growth, low follower count)
- Brand-specific recommendations ("Creators similar to your top performers")
- Trend prediction ("This product category is accelerating")
- Custom alerts ("Notify me when a creator in [Beauty] gets >1M views")

---

## Technical Considerations

### Performance
- Discover page will have many images (thumbnails). Use Next.js `<Image>` with lazy loading and blur placeholders.
- TrendSparkline should be lightweight SVG, not a charting library. ~500 bytes per sparkline.
- Consider ISR (Incremental Static Regeneration) for the daily feed — it changes once per sync, not per request.
- Virtual scrolling for list view (react-window or similar).

### Cost Management
- Third-party data API calls should be batched in sync jobs, not per-user-request.
- Cache sync results aggressively. Daily data is daily data.
- Transcription/AI features should be rate-limited per user (credits system or daily cap).

### Data Freshness
- Default sync: every 6 hours for trending data.
- Product details: daily refresh for saved products.
- Creator stats: refresh when creator profile is viewed (cache for 1 hour).
- Show "Last updated: 2h ago" timestamp on the page.

---

## Summary

| Feature | MVP Scope | Full Scope |
|---|---|---|
| **Messages** | 3-panel inbox, templates, manual send, contact linker | Sequences, multi-channel (email/discord), bulk send, delivery analytics, real-time |
| **Discover** | Daily trending feed, category filters, sort, save products | Creator cross-reference, reach out flow, AI transcribe/rewrite, alerts, recommendations |

Both features are designed to reinforce Tempo's core value proposition: **one platform for brand managers to discover, recruit, communicate with, and manage TikTok Shop creators.**
