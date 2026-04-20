import SplitPillLink from '../SplitPillLink/SplitPillLink.js';

interface Props {
  label: string;
  onClick: () => void;
}

export default function BackLink({ label, onClick }: Props) {
  return (
    <SplitPillLink
      label={label}
      icon={'\u2190'}
      iconPosition="leading"
      tone="muted"
      onClick={onClick}
      ariaLabel={`Back to ${label}`}
    />
  );
}
