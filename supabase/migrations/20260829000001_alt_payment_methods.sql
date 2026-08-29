-- Alternative payment methods (sponsor request 2026-08-29). The first tenant
-- accepts Apple Pay, Cash, Venmo, and Zelle (her public Thumbtack listing) —
-- Venmo already has a first-class handle + pay button (20260825000003), but
-- Zelle and Apple Pay could only live as free text in payment_instructions_md.
-- Give them first-class columns so the public invoice page can render proper
-- "send to" rows when the owner sets them, and add apple_pay to the
-- payment_method enum so recorded payments can carry it.
--
-- Both handles nullable: null hides the row on the invoice page (the
-- venmo_handle precedent). Zelle enrolls an email or US phone; Apple Pay
-- (Apple Cash) sends to a phone/email through Messages — neither has a
-- deep-link convention like Venmo's, so these are display primitives only:
-- the invoice-public function ships them, the page renders them, no URL is
-- ever built.

alter table public.businesses
  add column zelle_handle text,
  add column apple_pay_handle text;

-- ADD VALUE is transaction-safe on this PG as long as the new label is not
-- used in the same migration — and it is not.
alter type public.payment_method add value if not exists 'apple_pay' after 'zelle';
