# Dealership lead reconciliation

A website lead can look successful to the customer and still fail to reach the dealership CRM. This demo compares exports from both systems and shows the specific records that need a closer look.

## Try the browser demo

[Try the interactive demo](https://danthomasmanagement-debug.github.io/dealership-lead-reconciliation/) or open **index.html** locally. The dashboard starts with fictional dealership records and runs entirely in the browser. It needs no account, API key, installation, or network connection when opened locally.

1. Select **Inspect a sample lead** to open **LD-1005** and compare the stock IDs in the two sources.
2. Open **Details** on **LD-1002** to see a website lead that is missing from the CRM.
3. Choose **All leads** or search by lead ID, customer, dealership, or stock ID.
4. Export the exception queue as a CSV. To try different data, download the two samples, edit a few rows, and import both files under **Data sources**.

The built-in sample contains **31 distinct lead IDs**, **23 exact matches**, and **8 to review**. The match rate uses unique website leads as its denominator.

## Python command line

Run from the project directory with Python 3.9 or newer. No additional packages are required.

    python reconcile.py website-leads.csv crm-leads.csv --output lead-exceptions.csv

Both inputs use these headers, in any order.

    lead_id,customer,dealership,vehicle,submitted_at

Lead IDs are matched case-insensitively. The comparison trims whitespace and ignores case in the other fields. Use a common timestamp format in both exports. Duplicate IDs, records present in only one source, and missing or conflicting values appear in the report. A record with more than one issue appears once, with details preserved in its notes.

The demo does not infer matches across different IDs or write changes back to either source. In a production integration, an agreed cross-system ID, persistence, scheduling, and monitored retries would belong in the integration design.

All built-in people, dealerships, and records are fictional.

## Visual design

The typography, spacing, and clear action hierarchy were informed by a review of the [Apple homepage](https://www.apple.com/). The original showroom image is stored as **showroom.webp** and was created with built-in ImageGen.

<details>
<summary>Image generation prompt</summary>

> Use case: photorealistic-natural. Asset type: wide web banner for an independent automotive dealership data demo. Wide cinematic photograph of a minimalist glass car dealership at blue hour, with a single unbranded silver graphite modern vehicle seen from the side through the windows on the right half. Contemporary flat-roof glass architecture, charcoal structural frames, wet asphalt with restrained cool teal and silver-white reflections, a few soft linear showroom lights, premium architectural editorial photography, photographic realism. Composition: 3:2 wide image, the primary vehicle and architectural interest on the right two-thirds, very dark quiet negative space on the left third that blends into near-black blue-green. Camera at street level, clean architectural lines, subtle depth. No people, absolutely no text, signs, logos, license-plate lettering, watermarks, graphical overlays, data graphics, or prominent recognizable manufacturer details. Deep green slate and cool white tones, high contrast, refined natural grading. This is a backdrop for legible web-interface text.

</details>
