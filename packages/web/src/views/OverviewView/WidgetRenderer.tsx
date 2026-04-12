import { memo } from 'react';
import { getWidget } from './widget-catalog.js';
import { widgetBodies } from './widgets/registry.js';
import type { WidgetBodyProps } from './widgets/types.js';
import styles from './OverviewView.module.css';

interface WidgetRendererProps extends WidgetBodyProps {
  widgetId: string;
}

function WidgetRendererInner({ widgetId, ...bodyProps }: WidgetRendererProps) {
  const def = getWidget(widgetId);
  if (!def) return null;
  const Body = widgetBodies[widgetId];
  return (
    <>
      <span className={styles.sectionLabel}>{def.name}</span>
      {Body ? <Body {...bodyProps} /> : <span className={styles.sectionEmpty}>Unknown widget</span>}
    </>
  );
}

export const WidgetRenderer = memo(WidgetRendererInner);
