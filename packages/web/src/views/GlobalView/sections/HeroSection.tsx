import { useMemo, type ReactNode } from 'react';
import DottedMap from 'dotted-map/without-countries';

import { COUNTRY_COORDS } from '../../../components/GlobalMap/countryCoords.js';

import { formatNum } from '../format.js';
import { MAP_JSON } from '../mapData.js';
import styles from '../GlobalView.module.css';

// Pre-computed accent-blue shades at three intensities. dotted-map's color
// arg goes directly into an SVG `fill` attribute, and the library rejects
// `rgba()` strings silently, the earlier attempt to vary alpha dropped pins
// entirely. Hex works, so density is encoded via (a) a discrete 3-step
// palette that darkens with count share, and (b) a continuous radius ramp.
// The darkest step is the token accent; the lighter steps blend toward the
// page background so low-density countries stay present without shouting.
const ACCENT_DENSITY_PALETTE = ['#a4b6ff', '#6683ff', '#1d46ff'] as const;

function WorldMap({ countries }: { countries: Record<string, number> }): ReactNode {
  const svgStr = useMemo(() => {
    const map = new DottedMap({ map: JSON.parse(MAP_JSON) });
    const counts = Object.values(countries);
    const maxCount = Math.max(...counts, 1);
    for (const [cc, count] of Object.entries(countries)) {
      if (!(cc in COUNTRY_COORDS)) continue;
      const [lat, lng] = COUNTRY_COORDS[cc];
      // `^0.6` pulls tiny-count countries above the perceptual floor,
      // pure linear scaling would leave single-dev countries visibly
      // indistinguishable from the gray base map.
      const intensity = Math.pow(count / maxCount, 0.6);
      const bucket = intensity >= 0.66 ? 2 : intensity >= 0.33 ? 1 : 0;
      const color = ACCENT_DENSITY_PALETTE[bucket];
      const radius = 0.6 + intensity * 0.9;
      map.addPin({ lat, lng, svgOptions: { color, radius } });
    }
    return map.getSVG({
      radius: 0.2,
      color: '#bbb',
      shape: 'circle',
      backgroundColor: 'transparent',
    });
  }, [countries]);
  return <div className={styles.mapWrap} dangerouslySetInnerHTML={{ __html: svgStr }} />;
}

interface Props {
  online: number;
  totalUsers: number;
  countryCount: number;
  totalSessions: number;
  totalEdits: number;
  countries: Record<string, number>;
}

export function HeroSection({
  online,
  totalUsers,
  countryCount,
  totalSessions,
  totalEdits,
  countries,
}: Props): ReactNode {
  return (
    <div className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.onlinePulse}>
          <span className={styles.onlineCount}>{online.toLocaleString()}</span>
          <span className={styles.onlineLabel}>
            {online === 1 ? 'developer online' : 'developers online'}
          </span>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{totalUsers.toLocaleString()}</span>
            <span className={styles.heroStatLabel}>developers</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{countryCount}</span>
            <span className={styles.heroStatLabel}>countries</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{formatNum(totalSessions)}</span>
            <span className={styles.heroStatLabel}>sessions</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{formatNum(totalEdits)}</span>
            <span className={styles.heroStatLabel}>edits</span>
          </div>
        </div>
      </div>
      <WorldMap countries={countries} />
    </div>
  );
}
