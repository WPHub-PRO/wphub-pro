import { buildLast24HourBuckets, emptyUptimeBars, UPTIME_BAR_COUNT } from '@/lib/uptimeIncidentHours';
import clsx from 'clsx';
import { useId, useMemo } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

export type SiteUptimeBarsProps = {
  /** Length 24: index 0 oldest hour, index 23 current hour; `true` = incident (red bar). */
  bars: readonly boolean[];
  isLoading?: boolean;
  className?: string;
  /** When true, bars grow equally to fill the container width (e.g. site detail card). */
  fullWidth?: boolean;
};

function formatHourRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const a = new Date(startMs).toLocaleTimeString(undefined, opts);
  const b = new Date(endMs).toLocaleTimeString(undefined, opts);
  return `${a}–${b}`;
}

const SiteUptimeBars = ({ bars, isLoading = false, className, fullWidth = false }: SiteUptimeBarsProps) => {
  const uid = useId();
  const buckets = buildLast24HourBuckets(new Date());
  const safeBars = useMemo(() => {
    if (bars.length === UPTIME_BAR_COUNT) return bars;
    const fill = emptyUptimeBars();
    for (let i = 0; i < Math.min(bars.length, UPTIME_BAR_COUNT); i++) fill[i] = Boolean(bars[i]);
    return fill;
  }, [bars]);

  const incidentCount = useMemo(() => safeBars.filter(Boolean).length, [safeBars]);
  const ariaLabel = isLoading
    ? 'Loading last 24 hours uptime'
    : `Last 24 hours uptime: ${incidentCount} hour${incidentCount === 1 ? '' : 's'} with incidents`;

  return (
    <span
      className={clsx(
        'site-uptime-bars',
        fullWidth && 'site-uptime-bars--fill',
        isLoading && 'site-uptime-bars--loading',
        className,
      )}
      role="img"
      aria-label={ariaLabel}
      title={isLoading ? 'Loading uptime…' : incidentCount === 0 ? undefined : 'UptimeRobot incidents in red hours'}
    >
      {buckets.map((bucket, i) => {
        const down = Boolean(safeBars[i]);
        const range = formatHourRange(bucket.startMs, bucket.endMs);
        const tip = isLoading ? `${range} · …` : `${range} · ${down ? 'Incident' : 'OK'}`;
        const barClass = isLoading
          ? 'site-uptime-bars__bar site-uptime-bars__bar--loading'
          : `site-uptime-bars__bar ${down ? 'site-uptime-bars__bar--down' : 'site-uptime-bars__bar--up'}`;

        return (
          <OverlayTrigger
            key={`${uid}-bar-${i}`}
            placement="top"
            overlay={
              <Tooltip id={`${uid}-bar-tip-${i}`} className="fs-xxs">
                {tip}
              </Tooltip>
            }
          >
            <span className={barClass} aria-hidden />
          </OverlayTrigger>
        );
      })}
    </span>
  );
};

export default SiteUptimeBars;
