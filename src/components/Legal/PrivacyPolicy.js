import LegalPage, {
  Section, P, List, LI, B, Callout, Facts,
  ORG, BRAND, SITE, SUPPORT_EMAIL,
} from "./LegalPage";

/**
 * Written against what the code actually does, not from a template.
 *
 * Every processor named below is one this product genuinely calls, and every
 * field listed is one that exists in models/. A privacy policy that lists
 * categories nobody collects is worse than none: it is a promise about a system
 * that does not exist, and it goes stale the moment anybody checks.
 */
export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle={`What ${BRAND} collects, why it needs it, and who else ends up seeing it. Written to be read rather than to be survived.`}
    >
      <Section n="1" title="Who we are">
        <P>
          {BRAND} ({SITE}) is operated by <B>{ORG}</B>, Hyderabad, India. We are the
          data controller for the information described here. Reach us any time at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
            {SUPPORT_EMAIL}
          </a>.
        </P>
      </Section>

      <Section n="2" title="What we collect">
        <P>Four things, and nothing else.</P>
        <Facts
          rows={[
            ["Your account", "Name, email address, profile picture and a Google account identifier, received from Google when you sign in. We never see or store a password, because we never ask for one."],
            ["What you give us", "The YouTube links you add, the transcripts we make from them, the voice profile built from those transcripts, the topic categories you pick, and every script we write for you."],
            ["How you use it", "Sign-in times, credit purchases and spends, and which stories you have already been shown. The last of these is deleted automatically after fourteen days."],
            ["Which pages you open", "Google Analytics records the pages visited, roughly where in the world the visit came from, and what kind of device and browser it was. It is not joined to your account, and none of your videos, transcripts or scripts are ever sent to it."],
          ]}
        />
        <Callout>
          We do not run advertising, we do not use tracking pixels, and we do not
          sell or rent your data to anyone. There is no advertising business here
          to feed. We do use Google Analytics to count visits and see which pages
          people open, which sets its own cookies; it is told what page was
          viewed, never who you are, and nothing you write here is sent to it.
        </Callout>
      </Section>

      <Section n="3" title="Why we need each piece">
        <List>
          <LI><B>To sign you in.</B> The Google identifier is what tells your account apart from everybody else's.</LI>
          <LI><B>To write in your voice.</B> The whole product is a voice profile learned from videos you chose to give us. Without the transcripts there is nothing to learn from.</LI>
          <LI><B>To show the right news.</B> Your categories decide which stories reach your feed.</LI>
          <LI><B>To bill correctly.</B> A credit ledger exists so that when you ask "what was this charge for", there is an answer.</LI>
          <LI><B>To keep the service working.</B> Rate limits and abuse prevention need to know which account did what.</LI>
        </List>
      </Section>

      <Section n="4" title="Who else processes it">
        <P>
          We use a small number of vendors, each for one job. They receive only what
          that job needs.
        </P>
        <Facts
          rows={[
            ["Google", "Sign-in (OAuth), and Gemini, which reads the videos you add and writes your scripts. Video and script content is sent to Google for processing. Separately, Google Analytics measures site traffic; it receives page addresses and device information, and none of your videos, transcripts or scripts."],
            ["Razorpay", "Payments. Card and UPI details go to Razorpay directly and never reach our servers; we receive only a payment identifier and the amount."],
            ["apidirect.io", "Public news articles and YouTube video metadata. We send it search terms and public video URLs, never anything about you."],
            ["MongoDB Atlas", "Database storage."],
            ["Google Cloud", "Hosting."],
          ]}
        />
        <P>
          Some of these process data outside India. By using {BRAND} you consent to
          that transfer, which is necessary to provide the service.
        </P>
      </Section>

      <Section n="5" title="Videos you add">
        <P>
          You may only add videos you own or have the right to use. We read them
          once, keep the transcript and the style analysis derived from it, and use
          both solely to write scripts for your account.
        </P>
        <Callout>
          <B>Your voice profile is not shared, pooled or used to train anything for
          anyone else.</B> It exists to serve one account. Delete a video and its
          transcript goes with it; delete your voice analysis and it is removed from
          our database.
        </Callout>
      </Section>

      <Section n="6" title="How long we keep it">
        <List>
          <LI>Account, videos, voice profiles and scripts: until you delete them, or until you ask us to close your account.</LI>
          <LI>Which stories you have been shown: fourteen days, then deleted automatically.</LI>
          <LI>Payment and credit records: retained as long as Indian tax and accounting law requires, even after an account closes.</LI>
        </List>
      </Section>

      <Section n="7" title="Your rights">
        <P>You can, at any time:</P>
        <List>
          <LI>Delete individual videos and their transcripts from <B>My voice</B>.</LI>
          <LI>Delete a voice analysis without losing the videos behind it.</LI>
          <LI>Delete a channel, which removes its videos and its voice.</LI>
          <LI>Ask us for a copy of your data, or for your account to be deleted entirely.</LI>
        </List>
        <P>
          For the last two, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on your account. We will act within thirty days.
        </P>
      </Section>

      <Section n="8" title="Security">
        <P>
          Traffic is encrypted in transit. Your session lives in an httpOnly cookie
          that JavaScript cannot read. We do not store passwords, and we never see
          your card details. No system is perfectly secure, and we will not pretend
          otherwise, but nothing here is stored in a way we would be embarrassed to
          explain.
        </P>
      </Section>

      <Section n="9" title="Children">
        <P>
          {BRAND} is not intended for anyone under 18. We do not knowingly collect
          data from children, and will delete such an account on becoming aware of
          it.
        </P>
      </Section>

      <Section n="10" title="Changes">
        <P>
          If this policy changes materially, the date at the top changes with it and
          we will tell you by email before the change takes effect.
        </P>
      </Section>
    </LegalPage>
  );
}
