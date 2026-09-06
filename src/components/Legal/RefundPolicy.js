import LegalPage, {
  Section, P, List, LI, B, Callout, Facts,
  BRAND, SUPPORT_EMAIL,
} from "./LegalPage";

/**
 * The automatic-refund rule below is not a promise invented for this page: the
 * script route charges before the work starts and refunds in full on the failure
 * path (routes/script.js). Writing it down here only tells people what the code
 * already does for them.
 */
export default function RefundPolicy() {
  return (
    <LegalPage
      title="Cancellation & Refunds"
      subtitle="There is no subscription to cancel. What is left is credits, and this is exactly when you get them back."
    >
      <Section n="1" title="There is nothing recurring">
        <Callout>
          <B>{BRAND} has no subscription.</B> Credits are bought once, never expire,
          and nothing renews. There is no plan to cancel and no billing to stop.
        </Callout>
        <P>
          If you simply want to stop using {BRAND}, stop. Nothing further will be
          charged.
        </P>
      </Section>

      <Section n="2" title="When credits come back automatically">
        <P>
          You are charged when a script starts, not when it finishes. If it does not
          finish, you do not pay for it.
        </P>
        <Facts
          rows={[
            ["Generation fails", "Every credit charged for that script is returned automatically. You do not need to ask."],
            ["An add-on fails", "If the English version or the title pack fails but the main script succeeds, only that add-on's credits are returned."],
            ["Payment taken, credits missing", "Refresh once. If they are still not there, email us with your payment id and we will fix it the same day."],
          ]}
        />
        <P>
          Every movement in and out of your wallet is recorded, so if a number looks
          wrong we can tell you exactly what happened to it.
        </P>
      </Section>

      <Section n="3" title="Refunds on unused credits">
        <P>
          Credits are a digital product delivered instantly, so they are generally
          non-refundable once purchased. We will make an exception, and we mean it:
        </P>
        <List>
          <LI>
            <B>Within 7 days of purchase, on credits you have not spent</B>, we will
            refund the unused portion to the original payment method, no reason
            required.
          </LI>
          <LI>
            <B>If the service was broken</B> in a way that stopped you using what you
            paid for, we refund regardless of how long ago you bought.
          </LI>
          <LI>
            <B>If we close your account</B> for any reason other than a breach of the
            Terms, unused credits are refunded in full.
          </LI>
        </List>
        <Callout tone="warn">
          Credits already spent on scripts that were delivered are not refundable.
          The work was done, the model was paid for, and the script is yours to keep
          and publish. If the output was genuinely unusable, write to us anyway and
          we will look at it.
        </Callout>
      </Section>

      <Section n="4" title="How to ask">
        <P>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on your account, with:
        </P>
        <List>
          <LI>The Razorpay payment id, which is on your receipt email.</LI>
          <LI>What you would like refunded, and briefly why.</LI>
        </List>
        <P>
          We reply within two working days. Approved refunds are sent back through
          Razorpay to the original payment method and typically appear within five to
          seven working days, depending on your bank. We do not charge a processing
          fee.
        </P>
      </Section>

      <Section n="5" title="Chargebacks">
        <P>
          If something is wrong, please write to us first. We would far rather fix it
          than have you dispute it with your bank, and a chargeback raised before you
          have contacted us takes weeks to resolve for both of us.
        </P>
      </Section>
    </LegalPage>
  );
}
