/**
 * The user's manual — a LIVING DOCUMENT (CLAUDE.md Workflow rule): any change
 * to user-facing behavior updates the matching section here in the same
 * commit and bumps MANUAL_UPDATED, exactly like the PRD-checklist rule.
 *
 * Content rules:
 * - Documents SHIPPED behavior only. Nothing aspirational, nothing planned.
 * - Warm plain English for a non-technical business owner; short paragraphs;
 *   numbered steps for flows.
 * - Typed blocks, no markdown: 'p' paragraphs, 'steps' numbered lists,
 *   'tip' callouts. Rendering lives in ManualScreen.tsx.
 * - `audience` drives the badge: who the section is written for.
 * - Brand name and URLs interpolate from src/lib/brand.ts (hard rule: the
 *   display name never appears literally outside brand.ts).
 */

import { APP_NAME, PORTAL_LOGIN_URL, SUPPORT_EMAIL, WEB_BASE_URL } from '@/src/lib/brand';

export const MANUAL_VERSION = '1.0';
export const MANUAL_UPDATED = '2026-09-01';

export type ManualAudience = 'owner' | 'walker' | 'client' | 'all';

export type ManualBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'tip'; text: string };

export type ManualSection = {
  id: string;
  title: string;
  audience: ManualAudience;
  blocks: ManualBlock[];
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    audience: 'all',
    blocks: [
      {
        kind: 'p',
        text: `${APP_NAME} is the app your pet-care business runs on: the schedule, the walks, the reports your clients receive, and the invoices behind them. It works on your phone (the app) and on the web at ${WEB_BASE_URL} — the web version turns into a full desktop dashboard on a big screen.`,
      },
      {
        kind: 'p',
        text: `There are three kinds of people in ${APP_NAME}. An owner runs the business — and can walk visits too. A walker is a team member who does visits. A client is a pet parent: they never install anything, they get email links and a simple web portal.`,
      },
      {
        kind: 'p',
        text:
          'Your clients see YOUR brand, not ours: pick your brand color when you create the business (or later in Settings → Brand color) and it dresses every report page, invoice, portal screen, and email your clients get.',
      },
      {
        kind: 'p',
        text:
          'Your team lives on the Team tab: invite a walker by phone or email (they get a link that walks them into the app), set each member’s payout percent right on their row (Edit payout %) — statements pay that share of each visit’s price; and when someone leaves, Remove from team ends their access immediately — any upcoming visits assigned to them come back to you to reassign, while their past walks and payout history are kept. Revoke invite does the same for an invitation nobody accepted.',
      },
      {
        kind: 'steps',
        items: [
          'Owners and walkers sign in with their email address and password.',
          'Clients never use a password — they sign in to the portal with a one-time code sent to their email (see "The client portal" below).',
          'If you run more than one business, Settings lets you switch between them.',
        ],
      },
      {
        kind: 'tip',
        text: `Everything your clients see carries YOUR business name and color — they see the name of your business, not ${APP_NAME}.`,
      },
    ],
  },
  {
    id: 'today-and-dashboard',
    title: 'Today & the desktop dashboard',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text:
          'On your phone, Today is your morning glance. A "Needs attention" strip appears at the top only when something actually needs you: visits nobody is assigned to, offers a walker declined, and new booking requests. Below it, the "Up next" card shows your own next visit — with an "Instructions & codes" shortcut straight into the visit — followed by the rest of your day.',
      },
      {
        kind: 'p',
        text:
          'On a desktop web window at least 1024 pixels wide, Today becomes a command center: a row of numbers up top, operation panels in the middle, and your week and month at the bottom. Wider windows show more side by side.',
      },
      {
        kind: 'steps',
        items: [
          'Revenue — money actually received this week (payments you recorded), compared with last week. Weeks run Sunday to Saturday in your business time zone.',
          'Clients & pets — how many active clients and pets you serve.',
          'Walks — this week’s visits by status, so you can see what’s done and what’s coming.',
          'Outstanding — the unpaid balance across invoices you’ve sent.',
        ],
      },
      {
        kind: 'p',
        text:
          'The panels mirror the phone: Pending requests (approve or decline right there), Needs attention, and Live walks — visits in progress at this moment. The schedule area shows the week as a table plus a month calendar.',
      },
    ],
  },
  {
    id: 'scheduling',
    title: 'Scheduling visits',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text:
          'Visits are created from the Schedule tab. A visit is one service (walk, drop-in, and so on) for one client at a scheduled time, with an optional assigned walker.',
      },
      {
        kind: 'steps',
        items: [
          'Open Schedule and tap New visit.',
          'Pick the client, the service, and the date and time.',
          'For a repeating visit, choose Weekly and tap the weekdays it should repeat on. The series fills in real visits about 8 weeks ahead, and keeps extending itself as time passes — you never re-enter it.',
          'Choose a walker, or leave the visit unassigned to decide later.',
        ],
      },
      {
        kind: 'p',
        text:
          'Assigning works like an offer: when you offer a visit to a walker, their phone gets a push notification the moment it lands (each person allows notifications once, when the app asks), and they see it on their Today screen and accept or decline. You get a notification back when a walker declines and when a new booking request arrives. A decline always comes with a reason and puts the visit back in the unassigned pile — which shows up in Needs attention so nothing slips. You can also assign directly when you don’t need the accept step.',
      },
      {
        kind: 'p',
        text:
          'Each walker has a weekly availability pattern and can have time off on file; the schedule uses these so you offer visits to people who can actually take them. The walker list also flags tight transfers when there isn’t enough drive time from the walker’s previous visit — an estimate from home locations, not live traffic.',
      },
      {
        kind: 'p',
        text:
          'On a desktop web window, the Schedule tab also offers a Week view: a calendar grid of the whole week. Each person on your team has their own color — the legend above the grid shows who is who, and every assigned visit carries that color on its left edge. Visits at the same time sit side by side instead of covering each other. Today’s column is gently highlighted and an orange line marks the current time. The cards tell you status at a glance: a dashed amber outline means the visit still needs a walker (or is waiting on one to accept), an orange outline means the walk is happening right now, and finished visits fade into the background. Click any card to reassign or move that visit right there.',
      },
    ],
  },
  {
    id: 'clients-and-pets',
    title: 'Clients, pets & access codes',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text:
          'The Clients tab is your roster. Each client has contact details and an address, and each of their pets has a profile with notes and documents — vaccine records and anything else worth keeping. A document can carry an expiry date: the badge turns to a warning within 30 days of expiring and flags it once expired, so you catch an out-of-date rabies certificate before it matters.',
      },
      {
        kind: 'steps',
        items: [
          'Add a client: Clients tab → Add client. Name is all that’s required, but add their phone, email, and address while you’re there — the email is what portal invites go to, and the address places them on the map for scheduling.',
          'Add their pets: open the client, tap Add pet. Species and breed help walkers know what they’re meeting; feeding, medications, allergies, and behavior notes are what a walker sees mid-visit — write them like instructions to a new sitter. Add the vet’s info and a photo too. For age, just type what the client tells you — "3", "8 mo", or an exact birthday like 2023-03-10 if they know it.',
          'Edit anytime: open the client or pet and tap Edit — changes show up for walkers immediately. Made a duplicate pet by accident? Open it and tap Delete pet — it works only for pets with no visit history, so real records can never vanish.',
          'Vaccine records: on the pet’s profile, Add document, pick the type (Rabies, DHPP, FVRCP for cats, and so on) and the expiry date from the certificate.',
        ],
      },
      {
        kind: 'p',
        text:
          'Each client row also shows their money at a glance: a green "$50.00 credit" means you hold their deposit, a red "Owes $30.00" means unpaid invoices, and a settled client shows nothing. The same balance sits at the top of their profile (tap it to jump to Billing) and on the desktop dashboard roster.',
      },
      {
        kind: 'p',
        text:
          'Marketing photos: each client records whether they allow their pets’ photos in your marketing (social media, website). Set it on the client form — Allowed, Not allowed, or Not asked — and both you and your walkers see the answer on the client’s profile and on every visit. Until a client has said yes, treat it as a no.',
      },
      {
        kind: 'p',
        text:
          'Required vaccines: in Settings, mark which vaccines your business requires for dogs and for cats. When you book a visit, the New Visit screen warns you if a selected pet is missing a required vaccine or its record has expired — the warning never blocks the booking, it just makes sure you know before you commit.',
      },
      {
        kind: 'p',
        text:
          'Access codes — door, lockbox, gate, alarm, key location — live on the client, encrypted. They are never stored on your screen: every time someone reveals them, it happens fresh and is written to an audit log with who looked and when.',
      },
      {
        kind: 'steps',
        items: [
          'You (the owner) can reveal a client’s codes any time from their profile. Each reveal is logged.',
          'A walker can only reveal codes during a visit that has actually started, and only for their own visit. Before the walk begins, the codes are simply not available to them.',
          'Clients can view and update their own codes in the portal — also logged.',
        ],
      },
      {
        kind: 'p',
        text:
          'To give a client the portal, their profile needs an email address on file. Then tap Invite to portal — they get an email with their way in. You can re-send the invite any time.',
      },
    ],
  },
  {
    id: 'walking',
    title: 'Doing a walk',
    audience: 'walker',
    blocks: [
      {
        kind: 'p',
        text:
          'Your Today screen lists your visits, with any new offers at the top — accept or decline (declining asks for a reason the owner sees). Open a visit for the pet’s instructions, and once the visit has started, the access codes.',
      },
      {
        kind: 'steps',
        items: [
          'Tap Start on the visit when you arrive. Start only works on visits assigned to you that you’ve accepted.',
          'The walk screen records your route in the background and shows four quick buttons: Pee, Poop, Photo, Note. Each tap is stamped with the time. Feeding, water, or meds go in a note. Fat-fingered a button? The Recent list at the bottom has a Remove link next to everything you logged — take it back any time before you finish the visit, and it never appears in the report. Under More you’ll also find Mark — drop a labeled pin at your current spot ("saw a coyote here", "gate left open"); it shows on the walk map and in the client’s report — and Video, a short clip (10 seconds max) that plays right on the client’s report page. Remove takes any of them back like anything else.',
          'Reveal door or lockbox codes from the walk screen if you need them — this only works while the visit is in progress.',
          'Tap Finish when you’re done. That closes the walk and sends the client their report.',
        ],
      },
      {
        kind: 'p',
        text:
          'Bad signal is fine. Everything you do — starting, events, photos, finishing — is saved on your phone first and syncs in order when you’re back online. The GPS route keeps recording even if the phone kills the app mid-walk; it picks back up when you reopen it.',
      },
      {
        kind: 'tip',
        text:
          'The walk screen comes in a warm look by default and a dark look for early mornings and evenings — switch it under Settings, "Walk screen".',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Walk reports',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text:
          'When a walk finishes, the client gets one email — just one per walk — with a link to their report page. The report shows the route on a map with pins for pee, poop, and photo stops, the photos themselves, and a timeline of everything that happened with times. If billing created an invoice for the visit, an "Invoice & payment" section sits right on the same page.',
      },
      {
        kind: 'steps',
        items: [
          'Open the visit to see the report card and its link.',
          'Resend queues the report email again — for a client who lost it.',
          'Revoke turns the link off; anyone opening it afterwards sees that it’s gone.',
          '"Text the client" opens your phone’s Messages app with the report link pre-filled, from your own number — the way you already text clients today.',
        ],
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing, payments & payouts',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text: `${APP_NAME} does the bookkeeping; the money itself moves the way you already work — Venmo, Zelle, cash. No card processing, no card fees.`,
      },
      {
        kind: 'p',
        text:
          'The auto-invoice setting (Billing settings) decides what happens when a visit finishes. "Invoice each visit" (the default) creates and sends an invoice for exactly that visit — and its payment section rides the report page the client already got, so there is no second email. "Add to open draft" collects finished visits onto one draft you review and send. "Manual" leaves it all to you.',
      },
      {
        kind: 'steps',
        items: [
          'Manual invoices: pick the client and a date range — every completed, un-invoiced visit in the range becomes a line item. Add manual lines for extras or discounts.',
          'Deposits you’ve received get recorded as held, and apply themselves to invoices oldest-first.',
          'When a client pays, open the invoice and Mark paid: method, amount, date, optional memo. If they paid extra as a tip, record the full amount — overpayment is welcome and noted.',
          'On the client’s side, the public invoice page shows a Venmo button (when your handle is set) with an optional tip that adjusts the amount. If you set a Zelle or Apple Pay destination, a "More ways to pay" section lists them with the amount to send.',
        ],
      },
      {
        kind: 'p',
        text:
          'Payouts: build a per-walker statement of their finished visits, finalize it, and Mark paid when you’ve paid them. Walkers see their own finalized statements under Settings → Earnings.',
      },
      {
        kind: 'tip',
        text:
          'Set your Venmo handle, Zelle (email or phone), Apple Pay destination, and payment instructions in Billing settings — everything you fill in appears on the invoice page your clients see; anything you leave blank stays hidden.',
      },
    ],
  },
  {
    id: 'booking-requests',
    title: 'Booking requests',
    audience: 'owner',
    blocks: [
      {
        kind: 'p',
        text:
          'Clients with portal access can request a booking: the service they want and a date-and-time window that works for them, plus a note. New requests show up in Needs attention on Today, on the desktop dashboard, and on the Requests screen.',
      },
      {
        kind: 'steps',
        items: [
          'Open the request — it shows the client, service, and their requested window.',
          'To approve: optionally pick a walker (leave it empty to schedule the visit unassigned; picking one sends them the offer), pick the exact start time inside the client’s window, and approve. The visit is created at that time.',
          'To decline: write a reason. The client reads it word for word, in their portal and in the email.',
        ],
      },
      {
        kind: 'p',
        text:
          'The walker chips warn you before you assign: a chip notes when that walker is off, already busy at the chosen time (with the conflicting visit’s start), or outside their working hours — and the warnings update as you change the start time. Chips also flag tight transfers when there isn’t enough drive time from the walker’s previous visit — an estimate from home locations, not live traffic. They’re advisory only: you can still pick that walker, and they can still decline the offer.',
      },
    ],
  },
  {
    id: 'client-portal',
    title: 'The client portal',
    audience: 'client',
    blocks: [
      {
        kind: 'p',
        text: `This is what your clients experience. Once invited, they sign in at ${PORTAL_LOGIN_URL}: they type their email, get a one-time code in their inbox, and enter it. No password — nothing for an occasional visitor to forget, reset, or have stolen.`,
      },
      {
        kind: 'steps',
        items: [
          'Home shows their upcoming visits and latest activity.',
          'Reports keeps every walk report in one place — no more lost links.',
          'Invoices lists what’s owed and paid, with the Venmo button and optional tip.',
          'Pets shows their pets’ profiles and notes.',
          'They can view and update their own door and lockbox codes — every view is logged, same as for you.',
          'Requests lets them ask for a new booking (see "Booking requests").',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    audience: 'all',
    blocks: [
      {
        kind: 'p',
        text:
          'The sign-in code didn’t arrive: check the spam or junk folder — and mark the message "not spam" so the next one lands in the inbox.',
      },
      {
        kind: 'p',
        text:
          'Waiting on an app update: updates install when the app is relaunched. Force-quit the app and reopen it twice — the first launch fetches the update, the second one runs it.',
      },
      {
        kind: 'p',
        text: `Anything else: email ${SUPPORT_EMAIL} and tell us what you were doing when it happened.`,
      },
    ],
  },
];
