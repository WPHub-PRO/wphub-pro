export type SubscriptionTimelineItem = {
  time: string
  title: string
  description: string
  by: string
  variant: string
}

type RawEv = SubscriptionTimelineItem & { at: number }

export function subscriptionActivityTimeline(
  sub: Record<string, unknown>,
  formatTs: (ts: unknown) => string,
): SubscriptionTimelineItem[] {
  const raw: RawEv[] = []

  const add = (at: unknown, title: string, description: string, by: string, variant: string) => {
    if (typeof at !== 'number') return
    raw.push({
      at,
      time: formatTs(at),
      title,
      description,
      by,
      variant,
    })
  }

  if (typeof sub.canceled_at === 'number') {
    add(
      sub.canceled_at,
      'Subscription canceled',
      'The subscription is no longer active in Stripe.',
      'Stripe',
      'danger',
    )
  } else if (sub.cancel_at_period_end && typeof sub.cancel_at === 'number') {
    add(
      sub.cancel_at,
      'Cancellation scheduled',
      'The subscription is set to end at the end of the current billing period.',
      'Billing settings',
      'warning',
    )
  }

  if (typeof sub.trial_end === 'number') {
    add(
      sub.trial_end,
      'Trial ends',
      `Trial period through ${formatTs(sub.trial_end)}.`,
      'Stripe',
      'info',
    )
  } else if (typeof sub.trial_start === 'number') {
    add(
      sub.trial_start,
      'Trial started',
      'Trial access began for this subscription.',
      'Stripe',
      'info',
    )
  }

  if (typeof sub.current_period_end === 'number') {
    add(
      sub.current_period_end,
      'Current period ends',
      'Next billing or renewal is scheduled at this time unless the subscription is canceled or paused.',
      'Billing cycle',
      'success',
    )
  }

  if (typeof sub.start_date === 'number') {
    add(
      sub.start_date,
      'Subscription start',
      'Billing and access became active for this plan.',
      'Stripe',
      'success',
    )
  }

  if (typeof sub.created === 'number') {
    add(sub.created, 'Record created', 'Subscription object created in Stripe.', 'Stripe', 'light')
  }

  raw.sort((a, b) => b.at - a.at)

  return raw.map(({ at: _a, ...rest }) => rest)
}
