import SplitPillLink from '../SplitPillLink/SplitPillLink.js';

interface Props {
  label?: string;
  onClick: () => void;
}

export default function LaunchLink({ label = 'Launch', onClick }: Props) {
  return (
    <SplitPillLink
      label={label}
      icon={'\u2192'}
      iconPosition="trailing"
      tone="accent"
      accentColor="var(--report-color, var(--ink))"
      onClick={onClick}
      ariaLabel={`Launch ${label}`}
    />
  );
}
