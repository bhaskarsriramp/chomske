import Navbar from './Navbar';
import Footer from './Footer';

function CancellationPolicy() {
  return (
    <>
      <header>
        <title>Cancellation and Refund Policy | MyHandle</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </header>

      <Navbar />

      <div className="container" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', lineHeight: '1.8', marginTop : '4rem' }}>
        <h2>Cancellation & Refund Policy</h2>

        <p><strong>Last updated on Aug 2nd, 2025</strong></p>

        <p>
          At <strong>MyHandle</strong> (operated by Linck One Enterprises), we strive to deliver a seamless content creation experience powered by AI. While we’re confident in the value we provide, we understand there may be situations where users seek cancellation or a refund.
        </p>

        <h4>Subscription Cancellation</h4>
        <p>
          You may cancel your MyHandle subscription at any time from your account dashboard. Upon cancellation, your current plan will remain active until the end of the billing cycle. No further charges will be applied, and your account will revert to a free or limited tier after expiration.
        </p>

        <h4>7-Day Refund Window</h4>
        <p>
          If you're not satisfied with MyHandle's features, you may request a full refund within <strong>7 days of your initial purchase</strong>. Refunds will only be considered for the first-time purchase of any plan and not for renewals or trial upgrades.
        </p>

        <h4>Eligibility for Refund</h4>
        <ul>
          <li>Refund requests must be submitted via email to <a href="mailto:support@myhandle.in">support@myhandle.in</a></li>
          <li>You must request the refund within 7 days of your initial payment</li>
          <li>Only first-time subscriptions are eligible; renewals or repeated cancellations are not refundable</li>
          <li>Refunds are not applicable if significant credits (e.g., AI rewrites or scheduling) have already been consumed</li>
        </ul>

        <h4>Processing Time</h4>
        <p>
          Once approved, refunds will be processed within <strong>5–7 business days</strong>. The refund will be credited to your original method of payment.
        </p>

        <h4>Trial Period</h4>
        <p>
          All users are encouraged to explore MyHandle during the free trial period before committing to a paid plan. If you continue beyond the trial, the full subscription fee will be charged as per the selected billing cycle.
        </p>

        <h4>Need Help?</h4>
        <p>
          For any concerns, reach out to our support team at <a href="mailto:support@myhandle.in">support@myhandle.in</a>. We're happy to assist and ensure your experience with MyHandle is a valuable one.
        </p>
      </div>

      <Footer />
    </>
  );
}

export default CancellationPolicy;
