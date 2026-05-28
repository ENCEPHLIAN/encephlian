import LegalLayout from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" version="v0.1" effectiveDate="2026-05-19">
      <h2>1. Who We Are</h2>
      <p>
        This Privacy Policy describes how <strong>Aposematium Private Limited</strong>{" "}
        (CIN: <span className="font-mono">[TBD]</span>), doing business as{" "}
        <strong>ENCEPHLIAN</strong> ("Company", "we", "us"), processes personal data
        and sensitive personal data in connection with the ENCEPHLIAN platform
        (the "Platform"). This Policy is framed in accordance with the{" "}
        <strong>Digital Personal Data Protection Act, 2023</strong> ("DPDP Act"), the{" "}
        <strong>Information Technology (Reasonable Security Practices and Procedures
        and Sensitive Personal Data or Information) Rules, 2011</strong>{" "}
        ("SPDI Rules"), the <strong>Information Technology Act, 2000</strong>, and
        the <strong>NMC Telemedicine Practice Guidelines, 2020</strong>.
      </p>

      <h2>2. Roles</h2>
      <p>
        For Patient Data uploaded by Clinicians via a contracted Clinic, the{" "}
        <strong>Clinic is the Data Fiduciary</strong> (under DPDP Act) and the{" "}
        <strong>Company is a Data Processor</strong> acting on the Clinic's
        documented instructions. For account and billing data of Clinic
        administrators and Clinicians, the Company is the Data Fiduciary.
      </p>

      <h2>3. Categories of Data We Process</h2>
      <h3>3.1 Account &amp; Identity Data</h3>
      <ul>
        <li>Name, email, phone number</li>
        <li>Medical registration number, specialisation, hospital affiliation (Clinicians only)</li>
        <li>Authentication artefacts: password hash, time-based one-time password (TOTP) secrets</li>
      </ul>

      <h3>3.2 Patient Data (sensitive personal data under SPDI Rules)</h3>
      <ul>
        <li>Pseudonymised patient identifiers, age, sex</li>
        <li>EEG recordings (raw vendor file, prenorm μV, normalised ESF)</li>
        <li>Clinical metadata: SLA, referring physician, recording date, indication</li>
        <li>Reports: model-generated drafts, clinician edits, signed PDFs</li>
      </ul>

      <h3>3.3 Technical &amp; Operational Data</h3>
      <ul>
        <li>IP address, browser, user-agent, device class</li>
        <li>Audit logs (every mutation; immutable per IEC 62304 §5.8)</li>
        <li>Service health logs, pipeline events, correlation IDs</li>
      </ul>

      <h3>3.4 Billing Data</h3>
      <ul>
        <li>Order amount, GST identification number (where applicable)</li>
        <li>Razorpay payment reference and method (we do not store full card numbers; PCI scope rests with Razorpay)</li>
      </ul>

      <h2>4. Purposes of Processing</h2>
      <ul>
        <li>Provide the Services and Clinical Decision Support outputs requested by the Clinic</li>
        <li>Authenticate users; prevent fraud, abuse, and security incidents</li>
        <li>Bill for usage and remit taxes</li>
        <li>Comply with legal obligations including medical-records retention, audit-trail retention, and lawful requests from regulators or courts</li>
        <li>Improve service quality, including post-market surveillance, model performance monitoring, and incident root-cause analysis — using anonymised or aggregated derivatives only</li>
        <li>Communicate service notices, security advisories, and material policy changes</li>
      </ul>

      <h2>5. Lawful Basis</h2>
      <ul>
        <li><strong>Patient Data:</strong> Processed under the documented instructions of the Clinic, which is required to obtain informed consent from the patient or legally authorised representative before uploading data, as per the NMC Telemedicine Practice Guidelines and clause 7 of the DPDP Act.</li>
        <li><strong>Account &amp; Billing Data:</strong> Performance of contract (clause 7 of DPDP Act).</li>
        <li><strong>Technical &amp; Operational Data:</strong> Legitimate uses under clause 7(g) (network and information security) and clause 7(i) (compliance with law).</li>
      </ul>

      <h2>6. Sub-Processors</h2>
      <p>The Company engages the following sub-processors. Each is contractually bound to confidentiality and to security measures consistent with this Policy:</p>
      <table>
        <thead>
          <tr><th>Sub-processor</th><th>Purpose</th><th>Region</th></tr>
        </thead>
        <tbody>
          <tr><td>Microsoft Azure (Blob Storage, Container Apps)</td><td>Raw and derived data storage, inference compute</td><td>Central India (Pune)</td></tr>
          <tr><td>Supabase, Inc.</td><td>Authentication, Postgres database for metadata, edge functions</td><td>ap-south-1 (Mumbai)</td></tr>
          <tr><td>Razorpay Software Pvt. Ltd.</td><td>Payment processing (Pilot SKU)</td><td>India</td></tr>
          <tr><td>Vercel, Inc.</td><td>Frontend hosting (E-plane)</td><td>Global edge; primary in-region routing</td></tr>
        </tbody>
      </table>
      <p>EEG signal data, derived ESF artefacts, and reports are stored in <strong>Azure Central India</strong> and do not leave India under normal operating conditions. The Company will not introduce new sub-processors that process Patient Data without thirty (30) days' notice to the Clinic.</p>

      <h2>7. Cross-Border Transfers</h2>
      <p>Patient Data is hosted and processed within India. Account and billing data may be processed by sub-processors in jurisdictions outside India where they maintain redundancy or fraud-detection infrastructure; such transfers are restricted by contractual safeguards equivalent to those imposed under the DPDP Act and any rules issued thereunder.</p>

      <h2>8. Retention</h2>
      <ul>
        <li><strong>Patient Data:</strong> Retained for the duration of the Clinic's contract plus the medical-records retention period applicable to the Clinic under local law (typically a minimum of 3 years from the date of the last consultation per NMC and state-level medical-records regulations; longer where mandated).</li>
        <li><strong>Audit Logs:</strong> Retained for a minimum of 7 years, in line with IEC 62304 §5.8 and CDSCO post-market surveillance expectations.</li>
        <li><strong>Account Data:</strong> Retained for the duration of the account plus 90 days after termination, except where extended retention is required by law.</li>
        <li><strong>Billing Data:</strong> Retained for a minimum of 8 years from the date of the relevant financial year, as required under the Income-tax Act, 1961.</li>
        <li><strong>Backups:</strong> Standard backup cycles are 35 days. Deletion requests result in deletion from primary stores immediately and from backups within 35 days.</li>
      </ul>

      <h2>9. Security</h2>
      <p>The Company implements technical and organisational measures appropriate to the sensitivity of the data, including:</p>
      <ul>
        <li>Encryption in transit (TLS 1.2+ on all public endpoints) and at rest (Azure Storage Service Encryption, AES-256)</li>
        <li>Row-Level Security on every public Postgres table</li>
        <li>Per-tenant isolation via clinic-scoped policies and storage paths</li>
        <li>Two-factor authentication available to all users; required for super_admin and management roles</li>
        <li>Immutable audit trail enforced by database triggers</li>
        <li>Access controls aligned with the principle of least privilege</li>
        <li>Periodic security advisor scans and vulnerability remediation</li>
        <li>Incident-response procedures with notification to the Data Fiduciary and, where required, the Data Protection Board of India within seventy-two (72) hours of becoming aware of a personal-data breach</li>
      </ul>

      <h2>10. Rights of Data Principals</h2>
      <p>Data principals have the right to (a) access their personal data, (b) request correction or erasure, (c) withdraw consent, (d) nominate a representative, and (e) seek grievance redressal — all as set out in the DPDP Act. Requests may be made via <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a> and will be acknowledged within seven (7) days and resolved within thirty (30) days, save for cases requiring extended verification. Where the data principal is a patient, requests may be routed via the treating Clinic.</p>

      <h2>11. Grievance Officer</h2>
      <p>
        Grievance Officer / Data Protection contact:
        <br />
        Aposematium Private Limited, c/o the Grievance Officer
        <br />
        Email: <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>
        <br />
        Response time: within seven (7) days of receipt of complaint
      </p>

      <h2>12. Cookies</h2>
      <p>The Platform uses strictly necessary cookies for authentication and session management, and a minimal set of preference cookies (theme, layout density). No advertising or cross-site tracking cookies are used.</p>

      <h2>13. Children's Data</h2>
      <p>The Platform is offered only to Clinicians and Clinic administrators. Patient EEG data may include paediatric subjects; in such cases the Clinic must obtain consent from a parent or lawful guardian as required under the DPDP Act and applicable medical-ethics rules.</p>

      <h2>14. Changes to this Policy</h2>
      <p>Material changes will be notified at least thirty (30) days before they take effect. The version and effective date are recorded at the top of this page.</p>

      <h2>15. Contact</h2>
      <p>For privacy-related questions: <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>.</p>
    </LegalLayout>
  );
}
