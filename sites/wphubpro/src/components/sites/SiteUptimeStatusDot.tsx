import { isSiteMonitorDown } from '@/domains/sites';
import type { Site } from '@/types';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

function uptimeMoodTooltip(isDown: boolean): string {
  return isDown ? 'Site is down (uptime monitor)' : 'Site is up';
}

type SiteUptimeStatusDotProps = {
  site: Site;
  /** When set, the dot is a control (opens e.g. Site Monitor) in addition to the status tooltip. */
  onPress?: () => void;
};

export default function SiteUptimeStatusDot({ site, onPress }: SiteUptimeStatusDotProps) {
  const isDown = isSiteMonitorDown(site);
  const statusLabel = uptimeMoodTooltip(isDown);
  const tooltipText = onPress ? `${statusLabel}. Click to open Site Monitor.` : statusLabel;
  const overlay = <Tooltip id={`uptime-mood-${site.$id}`}>{tooltipText}</Tooltip>;

  if (onPress) {
    return (
      <OverlayTrigger placement="top" overlay={overlay}>
        <button
          type="button"
          className="btn btn-link p-0 m-0 border-0 bg-transparent shadow-none lh-1 d-inline-flex align-items-center justify-content-center text-decoration-none"
          style={{ color: 'inherit' }}
          aria-label={tooltipText}
          onClick={(e) => {
            e.preventDefault();
            onPress();
          }}
        >
          <span className="d-inline-flex align-items-center justify-content-center" style={{ lineHeight: 0 }} aria-hidden>
            <span className={`site-uptime-dot ${isDown ? 'site-uptime-dot--down' : 'site-uptime-dot--up'}`} />
          </span>
        </button>
      </OverlayTrigger>
    );
  }

  return (
    <OverlayTrigger placement="top" overlay={overlay}>
      <span className="d-inline-flex align-items-center justify-content-center" style={{ lineHeight: 0 }}>
        <span
          className={`site-uptime-dot ${isDown ? 'site-uptime-dot--down' : 'site-uptime-dot--up'}`}
          role="img"
          aria-label={statusLabel}
        />
      </span>
    </OverlayTrigger>
  );
}
