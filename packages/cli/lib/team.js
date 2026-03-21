import { writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, configExists } from './config.js';
import { api } from './api.js';

export async function handleTeamCommand(subcmd, arg) {
  if (!configExists()) {
    console.log('Run `npx chinwag` first to create an account.');
    return;
  }

  const config = loadConfig();
  const client = api(config);

  if (subcmd === 'create') {
    try {
      const result = await client.post('/teams', {});
      const teamId = result.team_id;

      const chinwagFile = join(process.cwd(), '.chinwag');
      writeFileSync(chinwagFile, JSON.stringify({ team: teamId }, null, 2) + '\n');

      console.log(`Team created: ${teamId}`);
      console.log(`Wrote .chinwag to ${chinwagFile}`);
      console.log('Commit this file so teammates auto-join.');
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  } else if (subcmd === 'join') {
    if (!arg) {
      console.log('Usage: chinwag team join <team-id>');
      return;
    }
    try {
      await client.post(`/teams/${arg}/join`, {});

      const chinwagFile = join(process.cwd(), '.chinwag');
      writeFileSync(chinwagFile, JSON.stringify({ team: arg }, null, 2) + '\n');

      console.log(`Joined team: ${arg}`);
      console.log(`Wrote .chinwag to ${chinwagFile}`);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  } else {
    console.log('Usage: chinwag team <create|join> [team-id]');
  }
}
