import { formatCents, formatIsoDate } from './money';

import type { Statement } from './statements';

/**
 * Print pipeline for the Transactions page (2026-09-05 — sponsor: "the PDF is
 * not great and needs to be named more appropriately"). Instead of printing
 * the app's own DOM (RN-web layout, theme cream, rail hiding), the page
 * renders a DEDICATED plain-HTML statement into a hidden iframe and prints
 * that: black on white, real table, page margins — and the document title
 * becomes the browser's suggested PDF filename.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type StatementPrintMeta = {
  businessName: string;
  personName: string;
  mode: 'clients' | 'walkers';
  rangeLabel: string;
  generatedYmd: string; // 'YYYY-MM-DD'
};

/** The browser offers this as the PDF filename — name it like a document. */
export function statementTitle(meta: StatementPrintMeta): string {
  return `${meta.personName} — ${meta.businessName} statement — ${meta.generatedYmd}`;
}

export function buildStatementHtml(statement: Statement, meta: StatementPrintMeta): string {
  const client = meta.mode === 'clients';
  const money = (c: number) => formatCents(c);
  const rows = statement.rows
    .map((r) => {
      const note = r.note
        ? `<div class="note">${escapeHtml(r.note)}</div>`
        : '';
      return `<tr class="${r.info ? 'info' : ''}">
        <td class="date">${escapeHtml(formatIsoDate(r.date))}</td>
        <td>${escapeHtml(r.description)}${note}</td>
        <td class="num">${r.chargeCents !== 0 ? money(r.chargeCents) : '—'}</td>
        <td class="num">${r.creditCents !== 0 ? money(r.creditCents) : '—'}</td>
        <td class="num strong">${r.info ? '' : money(r.balanceCents)}</td>
      </tr>`;
    })
    .join('\n');
  const s = statement.summary;
  const tipsLine =
    s.tipsCents > 0
      ? `<p class="aside">Tips ${client ? 'given' : 'earned'} in this period: ${money(s.tipsCents)}${client ? ' — never counted toward the balance' : ''}.</p>`
      : '';
  const heldLine =
    client && (s.heldCents ?? 0) > 0
      ? `<p class="aside">Held for future care: ${money(s.heldCents!)} — separate from the balance above.</p>`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(statementTitle(meta))}</title>
<style>
  @page { margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #1a1a1a; margin: 0; }
  h1 { font-size: 21px; margin: 0 0 2px; }
  .meta { color: #555; margin: 0 0 18px; }
  .summary { width: 100%; max-width: 420px; border-collapse: collapse; margin: 0 0 6px; }
  .summary td { padding: 3px 0; }
  .summary td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .summary tr.total td { border-top: 1.5px solid #1a1a1a; font-weight: 700; padding-top: 6px; }
  .aside { color: #444; margin: 2px 0; font-size: 12px; }
  table.ledger { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .ledger th { text-align: left; font-size: 11px; letter-spacing: 0.04em;
               text-transform: uppercase; color: #555; padding: 6px 8px 6px 0;
               border-bottom: 2px solid #1a1a1a; }
  .ledger th.num { text-align: right; }
  .ledger td { padding: 5px 8px 5px 0; border-bottom: 1px solid #ddd;
               vertical-align: top; }
  .ledger td.date { white-space: nowrap; color: #555; }
  .ledger td.num { text-align: right; font-variant-numeric: tabular-nums;
                   white-space: nowrap; }
  .ledger td.strong { font-weight: 600; }
  .ledger tr.info td { color: #777; }
  .note { color: #777; font-size: 11px; }
  .footer { margin-top: 18px; color: #777; font-size: 11px; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${escapeHtml(meta.personName)}</h1>
<p class="meta">${escapeHtml(meta.businessName)} · Account statement · ${escapeHtml(meta.rangeLabel)} · generated ${escapeHtml(formatIsoDate(meta.generatedYmd))}</p>
<table class="summary">
  <tr><td>Balance forward</td><td class="num">${money(s.forwardCents)}</td></tr>
  <tr><td>${client ? 'Invoiced' : 'Earned'}</td><td class="num">${money(s.chargedCents)}</td></tr>
  <tr><td>${client ? 'Payments &amp; deposits applied' : 'Paid out'}</td><td class="num">−${money(s.creditedCents)}</td></tr>
  <tr class="total"><td>${escapeHtml(meta.personName)} ${client ? 'owes' : 'is owed'}</td><td class="num">${money(s.balanceCents)}</td></tr>
</table>
${tipsLine}
${heldLine}
<table class="ledger">
  <thead><tr>
    <th>Date</th><th>Description</th>
    <th class="num">${client ? 'Charge' : 'Earned'}</th>
    <th class="num">${client ? 'Paid' : 'Paid out'}</th>
    <th class="num">Balance</th>
  </tr></thead>
  <tbody>
${rows.length ? rows : '<tr><td colspan="5">No activity in this period.</td></tr>'}
  </tbody>
</table>
<p class="footer">Generated by ${escapeHtml(meta.businessName)} via Stridetail.</p>
</body></html>`;
}

/**
 * Web only: render the HTML into a hidden iframe and print it. The iframe's
 * document title drives the suggested PDF filename; the frame is removed
 * shortly after so repeat prints stay clean.
 */
export function printStatement(statement: Statement, meta: StatementPrintMeta): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return;
  const frame = doc.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  doc.body.appendChild(frame);
  const fdoc = frame.contentDocument;
  if (!fdoc) {
    frame.remove();
    return;
  }
  fdoc.open();
  fdoc.write(buildStatementHtml(statement, meta));
  fdoc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  // Chrome keeps the dialog alive after removal; a long delay covers slower
  // browsers that print asynchronously.
  setTimeout(() => frame.remove(), 60_000);
}
