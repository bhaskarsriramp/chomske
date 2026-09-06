import LegalPage, {
  Section, P, List, LI, B, Callout, Facts,
  BRAND, SUPPORT_EMAIL,
} from "./LegalPage";

/**
 * Payment providers ask every merchant for a shipping policy, including the ones
 * that ship nothing. Rather than leave a page that says "not applicable", this
 * one answers the question the policy is actually asking: when does the customer
 * get what they paid for, and what happens when they do not.
 */
export default function ShippingPolicy() {
  return (
    <LegalPage
      title="Delivery Policy"
      subtitle={`${BRAND} is entirely digital. Nothing is posted, nothing is couriered, and there is no tracking number. Here is what delivery means instead.`}
    >
      <Section n="1" title="Nothing is shipped">
        <Callout>
          <B>There are no physical goods.</B> {BRAND} sells credits, which are spent
          inside the product on scripts and their add-ons. No parcel exists, so
          there is no address to collect, no shipping charge, and no delivery
          partner.
        </Callout>
      </Section>

      <Section n="2" title="When credits arrive">
        <P>
          Immediately. Razorpay confirms the payment, the credits land in your
          wallet, and the balance in the sidebar updates on the same screen you paid
          from. There is no waiting period and no manual activation step.
        </P>
        <Facts
          rows={[
            ["Credits", "Instant, on payment confirmation."],
            ["A Short script", "Usually under a minute."],
            ["A long-form script", "A few minutes, since there is more to write."],
            ["The first script on a new channel", "Slightly longer, because your voice profile is being built from your videos at the same time."],
            ["Reading a video you add", "A few seconds for a Short. You can leave the page open."],
          ]}
        />
      </Section>

      <Section n="3" title="Where it is delivered">
        <P>
          To your account. Everything {BRAND} produces stays in the product, under{" "}
          <B>My scripts</B>, along with the story it was written from and every
          source behind it. You can copy a script at any time, and it remains
          available after you have spent the credits that made it.
        </P>
        <P>
          Nothing is emailed as an attachment, so there is no delivery to fail
          silently in a spam folder.
        </P>
      </Section>

      <Section n="4" title="If a payment goes through and credits do not appear">
        <List>
          <LI>Refresh the page once. The balance is read from the server, not held in the browser.</LI>
          <LI>
            If they are still missing, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
              {SUPPORT_EMAIL}
            </a>{" "}
            with the payment id from your Razorpay receipt.
          </LI>
          <LI>We reconcile against Razorpay directly and credit the account, usually the same day.</LI>
        </List>
        <P>
          A payment is only ever counted once, so there is no risk of being charged
          twice while we sort it out.
        </P>
      </Section>

      <Section n="5" title="If a script does not arrive">
        <P>
          Scripts are charged before the work starts, and refunded in full if the
          work fails. You will not be left having paid for something that never
          appeared. See <B>Cancellation & Refunds</B> for the detail.
        </P>
      </Section>

      <Section n="6" title="Where we deliver">
        <P>
          Everywhere. {BRAND} is a website, so it is available wherever you can
          reach it. Payments are processed in Indian Rupees through Razorpay.
        </P>
      </Section>
    </LegalPage>
  );
}
