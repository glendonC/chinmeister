import { type ReactNode } from 'react';

import { COUNTRY_COORDS } from '../../components/GlobalMap/countryCoords.js';
import ViewHeader from '../../components/ViewHeader/ViewHeader.js';
import { useGlobalRank } from '../../hooks/useGlobalRank.js';
import { useGlobalStats } from '../../hooks/useGlobalStats.js';

import { HeroSection } from './sections/HeroSection.js';
import { PercentileRanksSection } from './sections/PercentileRanksSection.js';
import { YourTotalsSection } from './sections/YourTotalsSection.js';
import { YourRankSection } from './sections/YourRankSection.js';
import { WhatsWorkingSection } from './sections/WhatsWorkingSection.js';
import { StackingSection } from './sections/StackingSection.js';
import styles from './GlobalView.module.css';

export default function GlobalView(): ReactNode {
  const gs = useGlobalStats();
  const gr = useGlobalRank();
  // Only count countries we can actually place on the map. Lobby presence
  // stores `XX` for any heartbeat without a valid CF-IPCountry header
  // (wrangler dev, geolocation failures); those would inflate the hero to
  // "1 countries" while the map renders nothing, since XX is not in
  // COUNTRY_COORDS. Same filter the WorldMap applies so hero count and
  // map pin count stay in lockstep.
  const countryCount = Object.keys(gs.countries).filter((cc) => cc in COUNTRY_COORDS).length;
  const m = gr.metrics;
  const t = gr.totals;
  const avg = gs.globalAverages;
  // Threshold for surfacing percentile ranks. Not a statistical boundary,
  // just a "wait until your metrics stabilize a bit" floor. Below 5,
  // completion rate lives in 6 coarse buckets (0/20/40/60/80/100%) and
  // flips violently session-to-session. 5 is a compromise between early
  // visibility and stable ranks.
  const hasEnoughSessions = t.totalSessions >= 5;
  const sessionsRemaining = 10 - t.totalSessions;

  return (
    <div className={styles.global}>
      <ViewHeader eyebrow="Across all developers" title="Global" />

      <HeroSection
        online={gs.online}
        totalUsers={gs.totalUsers}
        countryCount={countryCount}
        totalSessions={gs.totalSessions}
        totalEdits={gs.totalEdits}
        countries={gs.countries}
      />

      <PercentileRanksSection
        metrics={m}
        hasEnoughSessions={hasEnoughSessions}
        sessionsRemaining={sessionsRemaining}
        totalDevelopers={gr.totalDevelopers}
      />

      <YourTotalsSection totals={t} averages={avg} />

      <YourRankSection
        metrics={m}
        totals={t}
        averages={avg}
        stats={gs}
        hasEnoughSessions={hasEnoughSessions}
        sessionsRemaining={sessionsRemaining}
        totalDevelopers={gr.totalDevelopers}
      />

      <WhatsWorkingSection
        toolEffectiveness={gs.toolEffectiveness}
        modelEffectiveness={gs.modelEffectiveness}
      />

      <StackingSection toolCombinations={gs.toolCombinations} />
    </div>
  );
}
