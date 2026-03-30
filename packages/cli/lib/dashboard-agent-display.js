import { formatFiles, shortAgentId } from './dashboard-view.js';

export function isAgentAddressable(agent) {
  if (!agent?.agent_id) return false;
  if (agent._managed) return agent.status === 'running';
  return agent.status === 'active';
}

export function getAgentTargetLabel(agent) {
  if (!agent) return 'agent';
  if (agent.handle && agent._display) return `${agent.handle} (${agent._display})`;
  return agent.handle || agent._display || 'agent';
}

export function getAgentIntent(agent) {
  if (!agent) return null;
  if (agent._managed && agent._dead && agent.outputPreview) return agent.outputPreview;
  if (agent._summary) return agent._summary;
  const files = formatFiles(agent.activity?.files || []);
  if (files) return `Working in ${files}`;
  if (agent._managed && agent.task) return `Delegated task: ${agent.task}`;
  return 'Idle';
}

export function getAgentOriginLabel(agent) {
  if (!agent) return null;
  if (agent._managed) {
    return agent._connected ? 'started here' : 'starting here';
  }
  return 'joined automatically';
}

export function getAgentDisplayLabel(agent, nameCounts) {
  if (!agent) return 'agent';
  const baseLabel = agent._display || agent.toolName || agent.tool || 'agent';
  if ((nameCounts?.get(baseLabel) || 0) <= 1) return baseLabel;
  const suffix = shortAgentId(agent.agent_id) || String(agent.id || '').slice(-4);
  return suffix ? `${baseLabel} #${suffix}` : baseLabel;
}

export function getIntentColor(intent) {
  if (!intent) return 'gray';
  if (/idle/i.test(intent)) return 'yellow';
  if (/error|failed|blocked|conflict/i.test(intent)) return 'red';
  return 'cyan';
}

export function getAgentMeta(agent) {
  if (!agent) return null;

  const parts = [];
  parts.push(getAgentOriginLabel(agent));

  const files = formatFiles(agent.activity?.files || []);
  if (files) parts.push(files);

  if (agent.minutes_since_update != null && agent.minutes_since_update > 0) {
    parts.push(`updated ${Math.round(agent.minutes_since_update)}m ago`);
  }

  return parts.join(' \u00b7 ');
}

export function getRecentResultSummary(agent, toolState) {
  if (agent._failed && toolState?.detail) return toolState.detail;
  if (agent.outputPreview) return agent.outputPreview;
  if (agent.task) return agent.task;
  return agent._failed ? 'Task failed' : 'Task completed';
}
