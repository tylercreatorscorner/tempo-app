import { NextRequest, NextResponse } from 'next/server';
import { getTasks, createTask, updateTask } from '@/lib/data/crm';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const filters: any = {};
    if (sp.get('assigned_to')) filters.assignedTo = sp.get('assigned_to');
    if (sp.get('creator_id')) filters.creatorId = sp.get('creator_id');
    if (sp.get('due_date')) filters.dueDate = sp.get('due_date');
    if (sp.has('completed')) filters.completed = sp.get('completed') === 'true';
    const tasks = await getTasks(filters);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const task = await createTask(body);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const task = await updateTask(id, updates);
    return NextResponse.json({ task });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
