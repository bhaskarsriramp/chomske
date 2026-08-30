import Navbar from './Navbar';
import Footer from './Footer';
import { Box, Typography, useMediaQuery, Link as MuiLink } from '@mui/material';
import { Helmet } from 'react-helmet';

function PrivacyPolicy() {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>Privacy Policy | myHandle</title>
        <meta
          name="description"
          content="Learn how myHandle collects and uses your information, including data accessed through WhatsApp Business API integrations for sending alerts and notifications."
        />
        <link rel="canonical" href="https://chomske.com/privacy-policy" />
      </Helmet>

      <Navbar />

      <Box sx={{ px: isMobile ? 3 : 10, py: isMobile ? 5 : 10, mt: 8 }}>
        <Typography variant={isMobile ? 'h4' : 'h3'} gutterBottom fontWeight={600}>
          Privacy Policy
        </Typography>

        <Typography variant="body1" gutterBottom>
          <strong>Last updated:</strong> October 13, 2025
        </Typography>

        <Typography variant="body1" paragraph>
          At <strong>myHandle</strong>, your privacy matters to us. We believe your data belongs to you, not us.
          We collect only the information required to operate your handle page, process payments securely, and improve your experience.
          This Privacy Policy explains how we collect, use, and safeguard your information when you use
          <strong> myHandle.in</strong> and its related services.
        </Typography>

        <Typography variant="body1" paragraph>
          myHandle is owned and operated by <strong>Linck One Enterprises</strong>. By using our platform, you agree
          to the terms of this Privacy Policy. We may update this policy periodically and encourage you to revisit it from time to time.
        </Typography>

        {/* SECTION 1 */}
        <Typography variant="h5" gutterBottom fontWeight={600}>
          1. Information We Collect
        </Typography>
        <ul>
          <li>Full name, email address, and account credentials</li>
          <li>Profile information (display name, links, profile photo, social handles)</li>
          <li>Subdomain data (e.g., yourhandle.chomske.com) and associated content blocks</li>
          <li>Payment details processed securely through Razorpay or UPI — we do <strong>not</strong> store full payment information</li>
          <li>Website and app usage data (link clicks, visitor count, device type, region)</li>
          <li>Technical metadata (browser, IP address, timestamps) for analytics and security</li>
        </ul>

        {/* SECTION 2 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          2. How We Use Your Information
        </Typography>
        <ul>
          <li>To set up and manage your custom handle page and subdomain</li>
          <li>To provide analytics dashboards showing link clicks, visitors, and engagement</li>
          <li>To process payments for premium subscriptions via secure gateways</li>
          <li>To send essential account updates, billing confirmations, and service alerts</li>
          <li>To improve product performance, usability, and regional language support</li>
          <li>To ensure compliance with applicable Indian regulations and fraud prevention standards</li>
        </ul>

        {/* SECTION 3 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          3. Data Security
        </Typography>
        <Typography variant="body1" paragraph>
          We take your data protection seriously. All communication between your browser and our servers is encrypted via HTTPS.
          Sensitive data (like passwords and tokens) is stored using industry-standard encryption and access control.
          Our payment partners (e.g., Razorpay) comply with PCI DSS standards for financial transactions.
        </Typography>

        {/* SECTION 4 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          4. Cookies & Analytics
        </Typography>
        <Typography variant="body1" paragraph>
          myHandle uses cookies and analytics tools to enhance user experience and measure performance.
          Cookies store small pieces of data on your device to help with:
        </Typography>
        <ul>
          <li>Remembering login sessions securely</li>
          <li>Storing your dashboard preferences (like selected theme or language)</li>
          <li>Tracking anonymous visitor counts and engagement metrics</li>
        </ul>
        <Typography variant="body1" paragraph>
          We never use cookies to collect personal data or share it with advertisers.
          You can disable cookies through your browser settings, but some features may not function properly.
        </Typography>

        {/* SECTION 5 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          5. Third-Party Services
        </Typography>
        <Typography variant="body1" paragraph>
          We integrate trusted third-party services to deliver our features:
        </Typography>
        <ul>
          <li><strong>Razorpay / UPI</strong> — for secure payment processing</li>
          <li><strong>Google Analytics</strong> — to understand general platform usage trends</li>
          <li><strong>Email delivery providers</strong> — for account and support communication</li>
        </ul>
        <Typography variant="body1" paragraph>
          These providers process data on our behalf under strict confidentiality and compliance requirements.
          We do not sell or rent your personal data to any third party.
        </Typography>

        {/* SECTION 5A - WHATSAPP INTEGRATION */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          5A. WhatsApp Business Integration
        </Typography>
        <Typography variant="body1" paragraph>
          myHandle allows businesses to send <strong>WhatsApp alerts and notifications</strong> to their customers and subscribers
          using the <strong>WhatsApp Business API</strong> (provided by Meta). This enables you to deliver order updates,
          reminders, promotional messages, and other alerts directly to opted-in recipients on WhatsApp.
        </Typography>

        <Typography variant="body1" paragraph>
          When you or your customers interact with WhatsApp-powered features on myHandle, we collect and process the following:
        </Typography>

        <ul>
          <li><strong>Phone numbers</strong> – collected only from individuals who have explicitly opted in to receive WhatsApp alerts from your business.</li>
          <li><strong>Message content</strong> – the text and media of alerts sent through our platform, processed solely to deliver the message to the intended recipient.</li>
          <li><strong>Delivery status</strong> – delivery receipts (sent, delivered, read) returned by WhatsApp to help you track alert performance.</li>
          <li><strong>Opt-in/opt-out records</strong> – maintained to honour recipient preferences and comply with messaging regulations.</li>
        </ul>

        <Typography variant="body1" paragraph>
          We use this data <strong>only</strong> to send the alerts you configure and to display delivery analytics in your dashboard.
          We do not store message content beyond what is necessary for delivery confirmation. Phone numbers and opt-in records are
          encrypted at rest with strict access controls.
        </Typography>

        <Typography variant="body1" paragraph>
          All WhatsApp messaging through myHandle complies with Meta’s{" "}
          <MuiLink
            href="https://developers.facebook.com/terms/"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            WhatsApp Business Platform Terms
          </MuiLink>{" "}
          and India’s TRAI regulations. We only send messages to recipients who have given explicit prior consent.
          Recipients can opt out at any time by replying <strong>STOP</strong> or by contacting <strong>support@chomske.com</strong>.
        </Typography>

        {/* SECTION 6 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          6. Managing Your Data
        </Typography>
        <ul>
          <li>You can view and update your account information at any time through your dashboard.</li>
          <li>You may request data deletion or account removal by emailing <strong>support@chomske.com</strong>.</li>
          <li>Upon deletion, all your handle data, analytics, and media will be permanently removed within 7 days.</li>
          <li>We retain minimal records (e.g., invoices) for lawful accounting and tax purposes.</li>
        </ul>

        {/* SECTION 7 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          7. Children's Privacy
        </Typography>
        <Typography variant="body1" paragraph>
          myHandle is intended for individuals aged 16 and above. We do not knowingly collect data from minors.
          If you believe a minor has provided personal information, please contact us for removal.
        </Typography>

        {/* SECTION 8 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          8. Data Transfers
        </Typography>
        <Typography variant="body1" paragraph>
          Your data is stored securely on servers located within India or in cloud regions that meet equivalent data protection standards.
          We follow applicable data protection regulations, including the Digital Personal Data Protection Act (DPDP Act), 2023.
        </Typography>

        {/* SECTION 9 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          9. Updates to This Policy
        </Typography>
        <Typography variant="body1" paragraph>
          We may update this Privacy Policy periodically to reflect product or legal changes.
          Updated versions will be posted on this page with a revised “Last updated” date.
          Your continued use of the platform constitutes acceptance of any changes.
        </Typography>

        {/* SECTION 10 */}
        <Typography variant="h5" gutterBottom fontWeight={600} sx={{ mt: 4 }}>
          10. Contact Us
        </Typography>
        <Typography variant="body1" paragraph>
          For privacy-related queries, data requests, or clarifications, please contact us at:
          <br />
          <strong>Email:</strong> support@chomske.com <br />
          <strong>Response Time:</strong> Within 2–3 business days
        </Typography>
        <Typography variant="body1" paragraph>
          For WhatsApp-related data access or deletion requests, please include your registered phone number
          or business name in your email so we can locate and remove your records promptly.
        </Typography>
      </Box>

      <Footer />
    </>
  );
}

export default PrivacyPolicy;
