# Lead Check

A buyer sends a message through the dealership website. The inquiry can still be absent from the sales team’s system. Lead Check makes that gap visible and lets a visitor walk through a simulated recovery and follow-up.

## Try the browser demo

[Try the interactive demo](https://danthomasmanagement-debug.github.io/dealership-lead-reconciliation/) or open **index.html** locally. The dashboard starts with fictional dealership records and runs entirely in the browser. It needs no account, API key, installation, or network connection when opened locally.

1. Select **Start demo** and **Recover Maya’s inquiry**. **Case details** contains the before-and-after evidence and the repeat-safe recovery test.
2. Select **See suggested reply** and **Why this car?** to see the recommendation rationale. **Customize reply** includes one-tap edits for length, price, and visit time, along with budget and inventory controls.
3. Select **Queue sample reply**, or **Create sales task** when consent is missing. **See Maya’s response** lets you play out a sample test drive or a request for a cheaper option. The actions appear in the downloadable report.

Open **Try the routing challenge** to compare another buyer’s original dealership with the sales record. Choose the destination from the evidence and run the correction. A wrong destination changes zero records. The right destination updates one field, and repeating the correction leaves the records unchanged. The case report includes the original value, current value, and the run’s timestamped actions.

For the full comparison, choose **View all inquiries**. Search by lead ID, buyer, dealership, or stock ID, and open a buyer’s **Profile** to see their inquiry details and compare source records. Selected fictional examples include buyer notes. Under **Try your own files**, use the sample CSVs as templates and compare two exports locally.

The built-in sample contains **31 distinct lead IDs**, **23 exact matches**, and **8 to review**. The match rate uses unique website leads as its denominator.

Run `node --test tests/demo-journey.test.js` to verify repeat-safe recovery and routing decisions.

## Python command line

Run from the project directory with Python 3.9 or newer. No additional packages are required.

    python reconcile.py website-leads.csv crm-leads.csv --output lead-exceptions.csv

Both inputs use these headers, in any order.

    lead_id,customer,dealership,vehicle,submitted_at

Lead IDs are matched case-insensitively. The comparison trims whitespace and ignores case in the other fields. Use a common timestamp format in both exports. Duplicate IDs, records present in only one source, and missing or conflicting values appear in the report. A record with more than one issue appears once, with details preserved in its notes.

The browser simulation uses a shared inquiry ID, checks the destination before inserting, and keeps the recovery and follow-up states in the page. The consent toggle gates the demo queue. The intent label uses visible signals from the fictional inquiry, and vehicle matches are filtered by budget, SUV body type, and all-wheel drive. Inventory, messaging, and the marked-won outcome are simulated.

For production, an integration needs authenticated access to the actual website and sales system, a reliable cross-system identifier, persisted workflow state, real consent records, monitored retries, and an audit trail.

All built-in people, dealerships, and records are fictional.

## Visual design

Claude reviewed screenshots of the previous design and the complete executable source of the revised demo. The recovery receipt follows the delivery-status and retry patterns in [Stripe Workbench](https://docs.stripe.com/webhooks#debug-webhook-integrations). The in-page journey uses a [progress tracker](https://atlassian.design/components/progress-tracker/) and an [activity timeline](https://knowledge.hubspot.com/records/work-with-records) to show what has changed. The locally hosted typefaces are DM Sans and Instrument Serif. Their SIL Open Font Licenses are included.

The walkthrough was informed by public Foureyes material on [checking for and recovering missing inquiries](https://support.foureyes.io/en/articles/9397753-why-does-foureyes-recover-a-lead), [routing recovered inquiries](https://support.foureyes.io/en/articles/6571485-how-can-i-make-sure-recovered-prospects-are-routed-correctly-in-my-crm), and [inventory-based follow-up](https://www.foureyes.io/case-studies/why-audi-bellevue-stuck-with-foureyes). This project is a standalone demonstration.

<details>
<summary>Image generation prompt for the earlier showroom artwork</summary>

> Use case: photorealistic-natural. Asset type: wide web banner for an independent automotive dealership data demo. Wide cinematic photograph of a minimalist glass car dealership at blue hour, with a single unbranded silver graphite modern vehicle seen from the side through the windows on the right half. Contemporary flat-roof glass architecture, charcoal structural frames, wet asphalt with restrained cool teal and silver-white reflections, a few soft linear showroom lights, premium architectural editorial photography, photographic realism. Composition: 3:2 wide image, the primary vehicle and architectural interest on the right two-thirds, very dark quiet negative space on the left third that blends into near-black blue-green. Camera at street level, clean architectural lines, subtle depth. No people, absolutely no text, signs, logos, license-plate lettering, watermarks, graphical overlays, data graphics, or prominent recognizable manufacturer details. Deep green slate and cool white tones, high contrast, refined natural grading. This is a backdrop for legible web-interface text.

</details>
