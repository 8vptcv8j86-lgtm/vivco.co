# VIVCO website
Partner manufacturing website for Vivco Caribbean Manufacturing, Inc.

## Checks and release
Node 24, no third-party runtime dependencies. Run `npm test` and `npm run build`. Deploy the exact committed files to Vercel project `vivco-landing`, with commit SHA in deployment Git metadata. Static output is `public`; source, tests and SQL must never be served. GitHub Actions runs the same checks. Automatic GitHub deployments are not assumed; production is explicitly deployed and verified.

## Inquiry security
Browser calls same-origin `/api/inquiry`. The server validates fields, bounds request bytes, checks origin and honeypot, and derives a keyed hash of Vercel's overwritten client IP header. A server-only encrypted `VIVCO_INTAKE_TOKEN` authenticates a submission-only RPC. There is no public table access. The private operation checks the credential before processing, validates fields again, atomically deduplicates request UUIDs, limits five accepted requests per IP per rolling hour and 100 site-wide, then writes the lead and delivery queue together. It does not export lead data. Keep the credential outside source and logs; provision its SHA-256 digest in `vivco_private.intake_credentials`.

Same UUID and same payload returns success; changed payload returns conflict. Form retains inquiry and request ID after an uncertain response. Changed content receives a new request ID. Database and network outages fail closed and offer email fallback. Rate limits protect application intake; they are not a guarantee against distributed abuse or DDoS.

## Lead handling and privacy
Owner: Reginald Coleman. Pending inquiries are in `vivco_private.lead_delivery`, joined to `public.leads`. Mark delivered only after recording the inquiry in the internal VIVCO inbox; preserve queued records when delivery fails. Do not email or publish personal data without appropriate authorization. HubSpot integration requires an available connected HubSpot capability and remains separately tracked until proven.

Authorized admin procedures:
- Daily review: pending delivery queue; respond via the verified company mailbox; record follow-up in CRM.
- Monthly retention review: inquiries at least 12 months old; retain active projects or required records and document the reason. Delete unused inquiries by exact UUID after reviewing context. Do not delete merely because an email is repeated.
- Export/correction/deletion: verify the requester using the original correspondence channel, find exact relevant UUIDs, export only their records, correct requested fields, or delete by exact UUID. Cascading deletion removes receipts and queue entries. Remove internal Notion/CRM copies too and record request fulfillment without retaining deleted content.
- Backups: provider retention and restore capabilities require verification. Deletion may persist in provider backups until expiration; restored data must have fulfilled deletion requests reapplied. No restore guarantee is asserted.

Before rollback, retain the secured intake architecture. An old frontend posting directly to the leads table will no longer submit; use the current release or email fallback. Do not reopen anonymous table access to roll back cosmetic changes.
