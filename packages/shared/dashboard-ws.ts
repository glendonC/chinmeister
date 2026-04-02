import type {
  ActivityEvent,
  DashboardDeltaEvent,
  FileEvent,
  HeartbeatEvent,
  LockChangeEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemoryDeltaEvent,
  MessageEvent,
  StatusChangeEvent,
  TeamContext,
  TeamLock,
  TeamMemory,
  TeamMessage,
  TeamMember,
} from './contracts.js';

type UnknownRecord = Record<string, unknown>;

function asObject(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length === value.length ? items : undefined;
}

export function normalizeDashboardDeltaEvent(value: unknown): DashboardDeltaEvent | null {
  const event = asObject(value);
  if (!event) return null;
  const type = asString(event.type);
  if (!type) return null;

  switch (type) {
    case 'heartbeat': {
      const agentId = asString(event.agent_id);
      return agentId ? ({ type, agent_id: agentId } satisfies HeartbeatEvent) : null;
    }
    case 'activity': {
      const agentId = asString(event.agent_id);
      if (!agentId) return null;
      return {
        type,
        agent_id: agentId,
        files: asStringArray(event.files),
        summary: asString(event.summary),
      } satisfies ActivityEvent;
    }
    case 'file': {
      const agentId = asString(event.agent_id);
      const file = asString(event.file);
      return agentId && file ? ({ type, agent_id: agentId, file } satisfies FileEvent) : null;
    }
    case 'member_joined': {
      const agentId = asString(event.agent_id);
      if (!agentId) return null;
      return {
        type,
        agent_id: agentId,
        handle: asString(event.handle) || undefined,
        host_tool: asString(event.host_tool) || asString(event.tool) || undefined,
      } satisfies MemberJoinedEvent;
    }
    case 'member_left': {
      const agentId = asString(event.agent_id);
      return agentId ? ({ type, agent_id: agentId } satisfies MemberLeftEvent) : null;
    }
    case 'status_change': {
      const agentId = asString(event.agent_id);
      const status = asString(event.status);
      return agentId && status
        ? ({ type, agent_id: agentId, status } satisfies StatusChangeEvent)
        : null;
    }
    case 'lock_change': {
      const agentId = asString(event.agent_id);
      const action = asString(event.action);
      if (!agentId || (action !== 'claim' && action !== 'release' && action !== 'release_all')) {
        return null;
      }
      return {
        type,
        action,
        agent_id: agentId,
        files: asStringArray(event.files),
      } satisfies LockChangeEvent;
    }
    case 'message': {
      const handle = asString(event.handle) || asString(event.from_handle);
      const text = asString(event.text);
      if (!handle || !text) return null;
      return {
        type,
        handle,
        text,
        created_at: asString(event.created_at) || undefined,
      } satisfies MessageEvent;
    }
    case 'memory': {
      const text = asString(event.text);
      if (!text) return null;
      return {
        type,
        id: asString(event.id) || undefined,
        text,
        tags: asStringArray(event.tags),
        handle: asString(event.handle) || asString(event.source_handle) || undefined,
        host_tool:
          asString(event.host_tool) ||
          asString(event.source_host_tool) ||
          asString(event.tool) ||
          undefined,
        created_at: asString(event.created_at) || undefined,
      } satisfies MemoryDeltaEvent;
    }
    default:
      return null;
  }
}

export function applyDelta(
  context: TeamContext | null | undefined,
  rawEvent: DashboardDeltaEvent | unknown,
): TeamContext | null | undefined {
  const event = normalizeDashboardDeltaEvent(rawEvent) || (rawEvent as DashboardDeltaEvent | null);
  if (!context || !event?.type) return context;

  switch (event.type) {
    case 'heartbeat':
      return applyHeartbeat(context, event);
    case 'activity':
      return applyActivity(context, event);
    case 'file':
      return applyFileReport(context, event);
    case 'member_joined':
      return applyMemberJoined(context, event);
    case 'member_left':
      return applyMemberLeft(context, event);
    case 'status_change':
      return applyStatusChange(context, event);
    case 'lock_change':
      return applyLockChange(context, event);
    case 'message':
      return applyMessage(context, event);
    case 'memory':
      return applyMemory(context, event);
    default:
      return context;
  }
}

function applyHeartbeat(ctx: TeamContext, event: HeartbeatEvent): TeamContext {
  const members = (ctx.members || []).map((member) =>
    member.agent_id !== event.agent_id
      ? member
      : { ...member, status: 'active', seconds_since_update: 0 },
  );
  return { ...ctx, members };
}

function applyActivity(ctx: TeamContext, event: ActivityEvent): TeamContext {
  const members = (ctx.members || []).map((member) => {
    if (member.agent_id !== event.agent_id) return member;
    return {
      ...member,
      status: 'active',
      seconds_since_update: 0,
      activity: { files: event.files || [], summary: event.summary || null },
    };
  });
  return { ...ctx, members };
}

function applyFileReport(ctx: TeamContext, event: FileEvent): TeamContext {
  const members = (ctx.members || []).map((member) => {
    if (member.agent_id !== event.agent_id) return member;
    const existingFiles = member.activity?.files || [];
    const files = existingFiles.includes(event.file)
      ? existingFiles
      : [...existingFiles, event.file];
    return {
      ...member,
      status: 'active',
      seconds_since_update: 0,
      activity: { ...(member.activity || { summary: null }), files },
    };
  });
  return { ...ctx, members };
}

function applyMemberJoined(ctx: TeamContext, event: MemberJoinedEvent): TeamContext {
  const existing = (ctx.members || []).find((member) => member.agent_id === event.agent_id);
  if (existing) {
    const members = ctx.members.map((member) => {
      if (member.agent_id !== event.agent_id) return member;
      return {
        ...member,
        status: 'active',
        handle: event.handle || member.handle,
        host_tool: event.host_tool || member.host_tool,
      };
    });
    return { ...ctx, members };
  }

  const newMember: TeamMember = {
    agent_id: event.agent_id,
    handle: event.handle || 'unknown',
    host_tool: event.host_tool || 'unknown',
    status: 'active',
    seconds_since_update: 0,
    minutes_since_update: 0,
    activity: null,
  };
  return { ...ctx, members: [...(ctx.members || []), newMember] };
}

function applyMemberLeft(ctx: TeamContext, event: MemberLeftEvent): TeamContext {
  const members = (ctx.members || []).filter((member) => member.agent_id !== event.agent_id);
  return { ...ctx, members };
}

function applyStatusChange(ctx: TeamContext, event: StatusChangeEvent): TeamContext {
  const members = (ctx.members || []).map((member) =>
    member.agent_id !== event.agent_id ? member : { ...member, status: event.status },
  );
  return { ...ctx, members };
}

function applyLockChange(ctx: TeamContext, event: LockChangeEvent): TeamContext {
  let locks = ctx.locks || [];
  if (event.action === 'claim') {
    const newLocks: TeamLock[] = (event.files || []).map((file) => ({
      file_path: file,
      agent_id: event.agent_id,
    }));
    locks = [...locks, ...newLocks];
  } else if (event.action === 'release') {
    const released = new Set(event.files || []);
    locks = locks.filter(
      (lock) => !(lock.agent_id === event.agent_id && released.has(lock.file_path)),
    );
  } else if (event.action === 'release_all') {
    locks = locks.filter((lock) => lock.agent_id !== event.agent_id);
  }
  return { ...ctx, locks };
}

function applyMessage(ctx: TeamContext, event: MessageEvent): TeamContext {
  const newMessage: TeamMessage = {
    handle: event.handle,
    text: event.text,
    created_at: event.created_at || new Date().toISOString(),
  };
  const messages = [...(ctx.messages || []), newMessage].slice(-50);
  return { ...ctx, messages };
}

function applyMemory(ctx: TeamContext, event: MemoryDeltaEvent): TeamContext {
  const newMemory: TeamMemory = {
    id: event.id || `memory:${Date.now()}`,
    text: event.text,
    tags: event.tags || [],
    handle: event.handle,
    host_tool: event.host_tool,
    created_at: event.created_at || new Date().toISOString(),
  };
  const memories = [newMemory, ...(ctx.memories || [])].slice(0, 100);
  return { ...ctx, memories };
}
