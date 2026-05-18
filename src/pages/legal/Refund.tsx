import LegalLayout from "./LegalLayout";

export default function Refund() {
  return (
    <LegalLayout
      title="Refund and Cancellation Policy"
      version="v0.1"
      effectiveDate="2026-05-19"
    >
      <h2>1. Scope</h2>
      <p>
        This policy governs refunds and cancellations for token purchases and
        Pilot SKU subscriptions on the ENCEPHLIAN platform operated by
        Aposematium Private Limited. It is mandated by the Reserve Bank of India
        guidelines that apply to merchants integrating with payment aggregators
        such as Razorpay.
      </p>

      <h2>2. What You Buy</h2>
      <p>
        The Pilot SKU operates on a prepaid token model. One signed report
        consumes one or more tokens per the prevailing tariff disclosed at the
        time of purchase. Tokens credit your wallet immediately on successful
        payment confirmation by Razorpay.
      </p>

      <h2>3. Refund Eligibility</h2>
      <h3>3.1 Unused Tokens</h3>
      <p>
        Tokens that have not been consumed are refundable on request made within
        seven (7) days of purchase, subject to a service-charge deduction of the
        actual payment-gateway fee (typically 2% plus GST) and any GST already
        remitted on the original invoice. After seven days, unused tokens
        remain available in your wallet for use against future reports for the
        duration of your contract, but are no longer eligible for monetary
        refund.
      </p>

      <h3>3.2 Service Failure</h3>
      <p>
        Where a paid report cannot be generated due to a confirmed failure of
        the Platform — and not due to issues attributable to the input file,
        the Clinician's workflow, or the Clinic's environment — the consumed
        tokens will be re-credited to the wallet within five (5) business days.
        If you would prefer a monetary refund in lieu of service credit, please
        write to us at <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>{" "}
        with the request, the affected study identifier, and the request_id
        from the failure notification.
      </p>

      <h3>3.3 Wrong-Charge Refunds</h3>
      <p>
        If you have been charged in error (e.g., duplicate transaction), notify
        us at <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>{" "}
        within thirty (30) days. We will verify the transaction and process the
        refund within seven (7) business days of confirmation.
      </p>

      <h2>4. What Is Not Refundable</h2>
      <ul>
        <li>Tokens that have been consumed against a signed report</li>
        <li>Tokens credited as a promotional or service credit</li>
        <li>Subscription periods that have already commenced (pro-rata refunds available only where required by law)</li>
      </ul>

      <h2>5. Cancellation</h2>
      <p>
        You may cancel your Pilot SKU subscription at any time by writing to{" "}
        <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>.
        Cancellation takes effect at the end of the current billing period; you
        retain access until that date. Recurring charges, if any, will be
        stopped immediately. Unused tokens remain valid until the end of the
        billing period and follow the rules in §3.
      </p>

      <h2>6. Refund Mechanism</h2>
      <p>
        Approved refunds are processed via Razorpay back to the original payment
        instrument. Credit-card and netbanking refunds typically settle within
        5–7 business days. UPI refunds typically settle within 3 business days.
        Settlement times are governed by the issuing bank or payment-instrument
        provider and are outside our control once initiated.
      </p>

      <h2>7. Disputes</h2>
      <p>
        If you disagree with the outcome of a refund decision, you may escalate
        to <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>{" "}
        with the subject line "Refund Escalation". Disputes are addressed by
        the Grievance Officer within seven (7) days of receipt. Unresolved
        disputes are subject to the dispute-resolution and governing-law clauses
        of the <a href="/terms">Terms of Service</a>.
      </p>

      <h2>8. GST and Invoicing</h2>
      <p>
        All token purchases are subject to applicable GST. GST invoices are
        issued at the time of payment. Refunds will be adjusted against the
        original invoice; a credit note will be issued where required under
        GST law.
      </p>

      <h2>9. Contact</h2>
      <p>
        For refund and cancellation requests:{" "}
        <a href="mailto:info@encephlian.cloud">info@encephlian.cloud</a>
        <br />
        Subject line: "Refund Request — &lt;study_id or order_id&gt;"
      </p>
    </LegalLayout>
  );
}
