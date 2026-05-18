import LegalLayout from "./LegalLayout";

export default function Support() {
  return (
    <LegalLayout title="Support" version="v0.1" effectiveDate="2026-05-19">
      <h2>How to Reach Us</h2>
      <p>
        For all support requests — bug reports, access issues, billing
        questions, security disclosures, and clinical workflow questions —
        please email{" "}
        <a href="mailto:info@encephlian.cloud">
          <strong>info@encephlian.cloud</strong>
        </a>
        . Tickets are tracked from receipt and you will receive an
        acknowledgement within one business day.
      </p>

      <h2>Severity Levels and Response Times</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Definition</th>
            <th>First response</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>P0</strong></td>
            <td>Platform down or unable to ingest / sign / view studies for the Clinic</td>
            <td>Within 1 hour</td>
            <td>24×7</td>
          </tr>
          <tr>
            <td><strong>P1</strong></td>
            <td>Degraded performance, pipeline failures on individual studies, or wallet/billing discrepancies</td>
            <td>Within 4 hours</td>
            <td>Business hours, 7 days</td>
          </tr>
          <tr>
            <td><strong>P2</strong></td>
            <td>UI defects, non-blocking workflow questions, documentation requests</td>
            <td>Within 1 business day</td>
            <td>Business hours, weekdays</td>
          </tr>
          <tr>
            <td><strong>P3</strong></td>
            <td>Feature requests, training requests</td>
            <td>Within 5 business days</td>
            <td>Business hours, weekdays</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Business hours: 09:00 – 19:00 Indian Standard Time, Monday – Friday,
        excluding public holidays in Telangana. P0 incidents receive an
        out-of-hours pager-equivalent response.
      </p>

      <h2>What to Include in a Ticket</h2>
      <p>
        A good support ticket lets us resolve issues fast and accurately:
      </p>
      <ul>
        <li><strong>Study identifier</strong> (the UUID shown in the URL) for any study-specific issue</li>
        <li><strong>request_id</strong> from the failure notification, if the issue surfaced as a toast — every action on the Platform now carries one</li>
        <li><strong>What you expected to happen</strong> and <strong>what happened instead</strong></li>
        <li><strong>Screenshot</strong> if relevant, with PHI redacted</li>
        <li><strong>Time of occurrence</strong> in IST</li>
        <li>Your Clinic name and your role (Clinician / Clinic admin / Management)</li>
      </ul>

      <h2>Security Disclosures</h2>
      <p>
        If you believe you have discovered a security vulnerability, please
        write to <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>{" "}
        with the subject line <strong>"Security Disclosure"</strong>. We will
        acknowledge within 48 hours and work with you on responsible disclosure.
        Please refrain from public disclosure until we have had a reasonable
        opportunity to remediate.
      </p>

      <h2>Clinical Concerns</h2>
      <p>
        If you have a clinical concern about an output produced by the Platform
        — for example, a triage classification that you believe is unsafe, a
        biomarker flag you cannot reconcile with the waveform, or a report
        rendering issue that may impact patient care — please write to{" "}
        <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a> with
        the subject line <strong>"Clinical Concern"</strong>. These tickets are
        routed directly to the clinical lead and are tracked as P1 by default.
        Outputs of the Platform are decision support; the signing Clinician
        remains the physician of record (see <a href="/admin/legal/terms">Terms §3</a>).
      </p>

      <h2>Escalation Path</h2>
      <ol>
        <li>Support team — first contact at <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a></li>
        <li>Engineering on-call — auto-escalated for P0 / P1</li>
        <li>Grievance Officer — for unresolved data-protection complaints (see <a href="/admin/legal/privacy">Privacy Policy §11</a>)</li>
        <li>Executive Sponsor — for unresolved P0 incidents beyond 24 hours</li>
      </ol>

      <h2>System Status</h2>
      <p>
        Real-time platform health is visible to Clinic administrators in the
        admin console under <span className="font-mono">Health</span>. Major
        incidents are also communicated by email to designated Clinic contacts.
      </p>
    </LegalLayout>
  );
}
