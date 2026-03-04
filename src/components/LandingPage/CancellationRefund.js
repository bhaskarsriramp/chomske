import Navbar from './Navbar';
import Footer from './Footer';
import { Box, Typography, useMediaQuery } from '@mui/material';
import { Helmet } from 'react-helmet';

const RefundPolicy = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>Refund Policy | myHandle</title>
        <meta
          name="description"
          content="myHandle offers a 7-day no-questions-asked refund policy on all new subscriptions. Learn about eligibility, timelines, and refund process."
        />
        <link rel="canonical" href="https://myhandle.in/refund-policy" />
      </Helmet>

      <Navbar />

      <Box sx={{ padding: isMobile ? 2 : 6, mt: 10, px: isMobile ? 2 : 12 }}>
        <Typography
          variant="h3"
          sx={{ fontSize: isMobile ? '32px' : '48px', fontWeight: 600, mb: 4 }}
        >
          Refund Policy
        </Typography>

        <Typography
          variant="body1"
          sx={{ fontSize: isMobile ? '16px' : '18px', lineHeight: 1.8 }}
        >
          <strong>Last updated:</strong> October 6, 2025
          <br />
          <br />
          At <strong>myHandle</strong>, we want our users to feel confident when
          subscribing to our services. If you are not satisfied with your
          purchase for any reason, you are eligible for a refund under the
          following conditions.
        </Typography>

        {/* Section 1 */}
        <Box mt={6}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            1. 7-Day No-Questions-Asked Refund
          </Typography>
          <ul>
            <li>
              All new subscriptions (monthly or yearly) are eligible for a{' '}
              <strong>100% refund within 7 days</strong> of the payment date.
            </li>
            <li>
              You do not need to provide a reason. Simply contact us via email
              at <strong>support@myhandle.in</strong> within 7 days of
              activation, and we’ll process your refund promptly.
            </li>
            <li>
              Refunds will be made to the original payment method (UPI, Razorpay
              wallet, or card) within 5–7 working days, depending on your
              payment provider.
            </li>
          </ul>
        </Box>

        {/* Section 2 */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            2. After 14 Days – No Refunds
          </Typography>
          <ul>
            <li>
              If more than <strong>14 days</strong> have passed since your
              payment, the transaction is considered final and non-refundable.
            </li>
            <li>
              This applies even if you did not actively use your handle or
              features after subscribing.
            </li>
          </ul>
        </Box>

        {/* Section 3 */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            3. Renewal & Recurring Payments
          </Typography>
          <ul>
            <li>
              Subscriptions automatically renew at the end of each billing cycle
              (monthly or yearly) unless canceled before renewal.
            </li>
            <li>
              Refunds are <strong>not available</strong> once a renewal payment
              is successfully processed.
            </li>
            <li>
              You can cancel anytime from your account dashboard to avoid future
              charges.
            </li>
          </ul>
        </Box>

        {/* Section 4 */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            4. Duplicate or Failed Transactions
          </Typography>
          <ul>
            <li>
              In case of duplicate or failed transactions, where your account
              was not activated or charged twice, we will initiate a full refund
              after verification.
            </li>
            <li>
              Refunds for such cases are typically processed within 3–5 working
              days.
            </li>
          </ul>
        </Box>

        {/* Section 5 */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            5. How to Request a Refund
          </Typography>
          <Typography sx={{ color: '#374151' }}>
            To initiate a refund, please email us at{' '}
            <strong>support@myhandle.in</strong> with the following details:
          </Typography>
          <ul>
            <li>Registered email address</li>
            <li>Payment date and amount</li>
            <li>Transaction ID (if available)</li>
            <li>Reason (optional for record-keeping)</li>
          </ul>
          <Typography sx={{ color: '#374151' }}>
            Our team will confirm eligibility and process the refund within the
            stipulated timelines.
          </Typography>
        </Box>

        {/* Section 6 */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            6. Exceptions
          </Typography>
          <ul>
            <li>
              No refunds are provided for free trials, promotional credits, or
              one-time special pricing plans unless otherwise stated.
            </li>
            <li>
              Refunds are not applicable for partial months, unused features, or
              downgrades between plans.
            </li>
            <li>
              Refund requests made through social media or third-party platforms
              (instead of our official email) may not be processed.
            </li>
          </ul>
        </Box>

        {/* Section 7 */}
        <Box mt={4} mb={8}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            7. Contact & Support
          </Typography>
          <Typography sx={{ color: '#374151' }}>
            For any refund-related queries or billing clarifications, please
            contact:
            <br />
            <strong>Email:</strong> support@myhandle.in
            <br />
            <strong>Response Time:</strong> Within 24–48 business hours
          </Typography>
        </Box>
      </Box>

      <Footer />
    </>
  );
};

export default RefundPolicy;
