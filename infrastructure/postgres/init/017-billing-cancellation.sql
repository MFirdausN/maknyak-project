ALTER TABLE workspace.billing_events
  DROP CONSTRAINT billing_events_event_type_check,
  ADD CONSTRAINT billing_events_event_type_check
    CHECK (event_type IN ('subscription.activated', 'subscription.cancelled'));
