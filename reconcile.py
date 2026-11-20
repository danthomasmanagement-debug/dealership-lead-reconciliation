"""Reconcile two lead exports and write a CSV of exceptions."""

import argparse
import csv
import re
import tempfile
from collections import Counter, defaultdict
from pathlib import Path


FIELDS = {
    "lead_id": "Lead ID",
    "customer": "Customer",
    "dealership": "Dealership",
    "vehicle": "Vehicle / stock ID",
    "submitted_at": "Submitted at",
}
STATUSES = ("Missing from CRM", "Duplicate", "Field mismatch", "CRM only", "Matched")
REPORT_FIELDS = (
    "lead_id", "status", "customer", "dealership", "vehicle", "website_records",
    "crm_records", "fields_to_review", "notes",
)


def read_source(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source, strict=True)
        column_names = next(
            ([value.strip().lower() for value in row] for row in reader if any(row)),
            None,
        )
        if column_names is None:
            raise ValueError(f"{path}: The CSV needs a header row.")
        if len(set(column_names)) != len(column_names):
            raise ValueError(f"{path}: Column names must be unique.")
        if missing := set(FIELDS).difference(column_names):
            raise ValueError(f"{path}: Missing columns: {', '.join(sorted(missing))}.")

        positions = {name: column_names.index(name) for name in FIELDS}
        records = defaultdict(list)
        for row in reader:
            if not row or (len(row) == 1 and not row[0].strip()):
                continue
            if len(row) != len(column_names):
                raise ValueError(f"{path}: Line {reader.line_num} has the wrong number of columns.")
            record = {name: row[position].strip() for name, position in positions.items()}
            if not record["lead_id"]:
                raise ValueError(f"{path}: Line {reader.line_num} needs a lead ID.")
            records[record["lead_id"].upper()].append(record)
        return records


def normalize(value):
    return " ".join(value.lower().split())


def reconcile(website, crm):
    counts = Counter({status: 0 for status in STATUSES})
    exceptions = []
    for lead_id in sorted(website.keys() | crm.keys()):
        website_rows = website.get(lead_id, [])
        crm_rows = crm.get(lead_id, [])
        notes = []
        diffs = []
        if len(website_rows) > 1:
            notes.append(f"{len(website_rows)} website records share this lead ID.")
        if len(crm_rows) > 1:
            notes.append(f"{len(crm_rows)} CRM records share this lead ID.")
        if not website_rows:
            notes.append("This lead ID only appears in the CRM export.")
        if not crm_rows:
            notes.append("This website lead has no matching CRM record.")
        if len(website_rows) == len(crm_rows) == 1:
            for field in tuple(FIELDS)[1:]:
                web_value = normalize(website_rows[0][field])
                crm_value = normalize(crm_rows[0][field])
                if not web_value or not crm_value or web_value != crm_value:
                    diffs.append(field)
        if diffs:
            notes.append("Missing or different values: " + ", ".join(FIELDS[key] for key in diffs) + ".")

        if len(website_rows) > 1 or len(crm_rows) > 1:
            status = "Duplicate"
        elif not crm_rows:
            status = "Missing from CRM"
        elif not website_rows:
            status = "CRM only"
        elif diffs:
            status = "Field mismatch"
        else:
            status = "Matched"
        counts[status] += 1
        if status == "Matched":
            continue
        lead = (website_rows or crm_rows)[0]
        exceptions.append({
            "lead_id": lead_id,
            "status": status,
            "customer": lead["customer"],
            "dealership": lead["dealership"],
            "vehicle": lead["vehicle"],
            "website_records": len(website_rows),
            "crm_records": len(crm_rows),
            "fields_to_review": ", ".join(diffs),
            "notes": " ".join(notes),
        })
    exceptions.sort(key=lambda row: STATUSES.index(row["status"]))
    return counts, exceptions


def spreadsheet_safe(value):
    if isinstance(value, str) and re.match(r"^[\t\r\n ]*[=+\-@]|^[\t\r\n]", value):
        return "'" + value
    return value


def write_report(path, exceptions):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", dir=path.parent, delete=False, encoding="utf-8", newline=""
        ) as output:
            temporary = Path(output.name)
            writer = csv.DictWriter(output, REPORT_FIELDS, quoting=csv.QUOTE_ALL)
            writer.writeheader()
            writer.writerows(
                {key: spreadsheet_safe(value) for key, value in row.items()}
                for row in exceptions
            )
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("website", type=Path, help="Website leads CSV")
    parser.add_argument("crm", type=Path, help="CRM leads CSV")
    parser.add_argument("--output", type=Path, default=Path("lead-exceptions.csv"), help="Exceptions CSV path")
    args = parser.parse_args()
    if args.output.resolve() in (args.website.resolve(), args.crm.resolve()):
        parser.error("Choose an output path different from both input CSVs.")
    try:
        website = read_source(args.website)
        crm = read_source(args.crm)
        counts, exceptions = reconcile(website, crm)
        write_report(args.output, exceptions)
    except (OSError, UnicodeError, ValueError, csv.Error) as error:
        parser.error(str(error))
    for status, count in counts.items():
        print(f"{status}: {count}")
    print(f"Wrote {len(exceptions)} exceptions to {args.output}")


if __name__ == "__main__":
    main()
