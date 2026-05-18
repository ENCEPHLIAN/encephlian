import LegalLayout from "./LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" version="v0.1" effectiveDate="2026-05-19">
      <h2>1. Definitions</h2>
      <p>In these Terms of Service ("<strong>Terms</strong>"):</p>
      <ul>
        <li><strong>"Company", "we", "us", "our"</strong> means Aposematium Private Limited, a company incorporated under the Companies Act, 2013, doing business as <strong>ENCEPHLIAN</strong>.</li>
        <li><strong>"Platform"</strong> means the ENCEPHLIAN web application, application programming interfaces, inference services, viewer, and admin console.</li>
        <li><strong>"Services"</strong> means clinical decision support for electroencephalography (EEG) interpretation, including signal ingestion, normalisation, AI-assisted triage, biomarker detection, structured reporting, and audit trails.</li>
        <li><strong>"Clinic"</strong> means the legal entity that contracts with the Company for use of the Services on behalf of its clinicians and patients.</li>
        <li><strong>"Clinician"</strong> means a registered medical practitioner authorised by a Clinic to use the Platform. Clinicians must hold a valid registration with the National Medical Commission (NMC) or a State Medical Council in India and be the physician of record for the studies they sign.</li>
        <li><strong>"Patient Data"</strong> means EEG recordings, demographics, and any other personal or sensitive personal data processed via the Platform in relation to an identifiable patient.</li>
        <li><strong>"SaMD"</strong> means Software as a Medical Device, as defined by the Central Drugs Standard Control Organisation (CDSCO) under the Medical Devices Rules, 2017, as amended.</li>
      </ul>

      <h2>2. Eligibility and Accounts</h2>
      <p>The Platform is offered only to (a) Clinics with a valid commercial agreement with the Company, and (b) Clinicians provisioned by such Clinics. The Company may verify medical registration, KYC, and corporate identity before activating an account. You are responsible for the accuracy of information provided and for maintaining the confidentiality of credentials. Sharing of credentials, multi-user accounts, and credential sharing across Clinics are prohibited.</p>

      <h2>3. Nature of the Services — Clinical Decision Support, Not Diagnosis</h2>
      <p>The Platform is a <strong>Clinical Decision Support System (CDSS)</strong>. Outputs of the Platform — including triage scores, biomarker flags, normalised waveforms, AI-generated draft reports, and structured findings — are <em>decision-support information</em> intended to assist a qualified Clinician. They are <strong>not</strong> a diagnosis and do not replace clinical judgement.</p>
      <p>The Clinician who signs a report is the physician of record and remains solely responsible for diagnosis, interpretation, and patient care. The Company makes no representation that any output is sufficient to establish a diagnosis or to direct treatment without independent clinician review.</p>

      <h2>4. Regulatory Status</h2>
      <p>The Platform is operated as a Class B Software as a Medical Device (SaMD) under the CDSCO MDR 2017 framework. Regulatory clearance is in progress; until clearance is granted, the Platform is available only for pilot and internal evaluation by contracted Clinics under written agreement, and outputs must not be relied upon as the sole basis for clinical decisions. The Company maintains a quality management system aligned with IEC 62304 and ISO 14971, an audit trail aligned with IEC 62304 §5.8, and post-market surveillance procedures.</p>

      <h2>5. Clinician Obligations</h2>
      <ul>
        <li>Use the Platform only in connection with patients for whom you are the treating Clinician or where you have a lawful basis to do so.</li>
        <li>Obtain informed consent from patients (or their lawfully authorised representatives) for the processing of their EEG data, including its analysis by AI-assisted decision support.</li>
        <li>Comply with the <strong>NMC Telemedicine Practice Guidelines, 2020</strong>, the <strong>Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations, 2002</strong>, and all applicable medical-records retention rules.</li>
        <li>Review every AI-generated draft before signing. Edit the draft to reflect your clinical judgement. The signed report carries your signature and is your professional opinion.</li>
        <li>Do not upload data unrelated to clinical EEG interpretation. Do not attempt to reverse-engineer the models or scrape outputs.</li>
      </ul>

      <h2>6. Fees, Billing and Taxes</h2>
      <p>The Platform operates on a prepaid token-based system for the Pilot SKU. Tokens are purchased via Razorpay (a TPAP licensed by the Reserve Bank of India). One signed report consumes one or more tokens per the prevailing tariff. All fees are exclusive of applicable Goods and Services Tax (GST), which will be added at the prevailing rate. Token purchases are governed by the <a href="/admin/legal/refund">Refund and Cancellation Policy</a>.</p>

      <h2>7. Data Protection</h2>
      <p>Processing of personal data and sensitive personal data is governed by the <a href="/admin/legal/privacy">Privacy Policy</a>, which forms an integral part of these Terms. By accepting these Terms, you also accept the Privacy Policy. The Clinic is the Data Fiduciary in relation to Patient Data; the Company is a Data Processor acting on the Clinic's documented instructions, subject to the technical and organisational measures described in the Privacy Policy.</p>

      <h2>8. Intellectual Property</h2>
      <p>The Company owns all rights, title and interest in the Platform, including its source code, trained models, ESF specification, MIND family of models, documentation, designs, and trademarks. The Clinic retains all rights in Patient Data. The Clinic grants the Company a limited, revocable, non-exclusive licence to process Patient Data solely to provide the Services. Anonymised, aggregated derivatives generated by the Platform may be retained by the Company for service improvement, quality monitoring, and post-market surveillance, in accordance with the Privacy Policy.</p>

      <h2>9. Confidentiality</h2>
      <p>Each party shall keep confidential all non-public information disclosed by the other in connection with these Terms and shall not disclose it to third parties except as expressly permitted herein or as required by law. This obligation survives termination.</p>

      <h2>10. Warranties and Disclaimers</h2>
      <p>The Company warrants that it will provide the Services with reasonable skill and care and in accordance with applicable laws. <strong>Except as expressly stated in these Terms, the Services are provided on an "as is" and "as available" basis without any warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy of decision-support output, or non-infringement.</strong> The Company does not warrant that the Services will be uninterrupted, error-free, or that the output of any AI model will be free of false negatives or false positives. Performance metrics, where published, refer to validation on labelled datasets and are not guarantees on individual cases.</p>

      <h2>11. Indemnification</h2>
      <p>The Clinic shall indemnify and hold harmless the Company against all claims, damages, losses and expenses arising from (a) the Clinic's or any Clinician's use of the Services in violation of these Terms, (b) any patient claim alleging negligence in interpretation or diagnosis by the Clinician, and (c) any breach of the Clinic's regulatory obligations as a healthcare provider.</p>

      <h2>12. Limitation of Liability</h2>
      <p>To the maximum extent permitted by applicable law, the Company's aggregate liability arising out of or in connection with these Terms shall not exceed the fees paid by the Clinic to the Company in the twelve (12) months immediately preceding the event giving rise to the claim. The Company shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, including loss of profits, loss of goodwill, or loss of data, even if advised of the possibility of such damages.</p>

      <h2>13. Term and Termination</h2>
      <p>These Terms continue in force until terminated. Either party may terminate for material breach not cured within thirty (30) days of written notice. The Company may suspend or terminate access immediately for (a) non-payment, (b) violation of applicable law, (c) regulatory direction, or (d) reasonable suspicion of patient-safety risk. Upon termination, the Clinic remains entitled to export Patient Data for a period of ninety (90) days, after which the Company may delete or anonymise such data subject to retention periods imposed by law and clause 14 of the Privacy Policy.</p>

      <h2>14. Force Majeure</h2>
      <p>Neither party shall be liable for any delay or failure in performance caused by events beyond its reasonable control, including acts of God, government action, war, terrorism, pandemic, telecommunications or cloud-provider outage, or large-scale internet disruption.</p>

      <h2>15. Governing Law and Jurisdiction</h2>
      <p>These Terms are governed by the laws of the Republic of India. Subject to the dispute-resolution clause below, the courts at Hyderabad, Telangana shall have exclusive jurisdiction. Any dispute shall first be attempted to be resolved through good-faith negotiation for thirty (30) days, failing which the matter shall be referred to a sole arbitrator under the Arbitration and Conciliation Act, 1996; the seat and venue of arbitration shall be Hyderabad, and the language shall be English.</p>

      <h2>16. Notices</h2>
      <p>All notices to the Company shall be sent to <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>. Notices to the Clinic shall be sent to the email address on file with the account.</p>

      <h2>17. Changes</h2>
      <p>The Company may update these Terms by giving at least thirty (30) days' notice for material changes. Continued use of the Platform after the effective date of the change constitutes acceptance. Material changes that adversely affect the Clinic's rights entitle the Clinic to terminate without penalty within the notice period.</p>

      <h2>18. Entire Agreement</h2>
      <p>These Terms, together with the Privacy Policy, Refund and Cancellation Policy, and any executed Service Order or Master Service Agreement between the Company and the Clinic, constitute the entire agreement between the parties.</p>
    </LegalLayout>
  );
}
