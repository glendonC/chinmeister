import { memo } from 'react';
import SectionTitle from '../components/SectionTitle/SectionTitle.js';
import SectionEmpty from '../components/SectionEmpty/SectionEmpty.js';
import styles from '../views/OverviewView/OverviewView.module.css';
import { getWidget } from './widget-catalog.js';
import { widgetBodies } from './bodies/registry.js';
import type { WidgetBodyProps } from './bodies/types.js';

interface WidgetRendererProps extends WidgetBodyProps {
  widgetId: string;
}

function WidgetRendererInner({ widgetId, ...bodyProps }: WidgetRendererProps) {
  const def = getWidget(widgetId);
  if (!def) return null;
  const Body = widgetBodies[widgetId];
  return (
    <>
      <div className={styles.widgetHead}>
        <SectionTitle>{def.name}</SectionTitle>
      </div>
      <div className={styles.widgetBody}>
        {Body ? <Body {...bodyProps} /> : <SectionEmpty>Unknown widget</SectionEmpty>}
      </div>
    </>
  );
}

export const WidgetRenderer = memo(WidgetRendererInner);
