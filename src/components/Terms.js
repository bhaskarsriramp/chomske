import Navbar from './Navbar';
import Footer from './Footer';
import { Box, Typography, useMediaQuery, Link as MuiLink } from '@mui/material';
import { Helmet } from "react-helmet";

const TermsConditions = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>Terms & Conditions | myHandle</title>
        <meta
          name="description"
          content="Terms & Conditions for myHandle, including WhatsApp Business API usage, messaging rules, opt-in/opt-out requirements, data handling, and compliance."
        />
        <link rel="canonical" href="https://chomske.com/terms" />
      </Helmet>

      <Navbar />

      <Box sx={{ padding: isMobile ? 2 : 6, mt: 10, px: isMobile ? 2 : 12 }}>
        <Typography variant="h3" sx={{ fontSize: isMobile ? '32px' : '48px', fontWeight: 600, mb: 4 }}>
          Terms & Conditions
        </Typography>

        <Typography variant="body1" sx={{ fontSize: isMobile ? '16px' : '18px', lineHeight: 1.8 }}>
          <strong>Last updated:</strong> October 13, 2025
          <br /><br />
          Welcome to <strong>myHandle</strong> — a platform operated by Linck One Enterprises (“we,” “us,” “our”).
          By accessing or using <strong>myHandle.in</strong> and related services (“Services”), you agree to these Terms & Conditions (“Terms”).
          If you do not agree, please do not use the Services.
        </Typography>

        {/* 1. Platform Use */}
        <Box mt={6}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            1. Platform Use
          </Typography>
          <ul>
            <li>myHandle provides a link-in-bio and mini-website builder, analytics, and creator tools under a <b>chomske.com</b> subdomain.</li>
            <li>You are responsible for the accuracy of the content you publish (links, images, text, payments, etc.).</li>
            <li>You agree not to use the Services for unlawful, misleading, harmful, or abusive purposes.</li>
            <li>We may suspend/terminate accounts for violations of these Terms or applicable law.</li>
          </ul>
        </Box>

        {/* 2. Accounts & Subdomains */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            2. Accounts & Subdomains
          </Typography>
          <ul>
            <li>Custom subdomains (e.g., <b>yourname.chomske.com</b>) are subject to availability and naming rules.</li>
            <li>Offensive, infringing, or misleading subdomains may be rejected or reclaimed.</li>
            <li>You must keep credentials secure and notify us of unauthorised access.</li>
          </ul>
        </Box>

        {/* 3. Payments & Subscriptions */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            3. Payments & Subscriptions
          </Typography>
          <ul>
            <li>Paid plans are billed via payment partners (e.g., Razorpay/UPI). Prices are in INR and may include taxes.</li>
            <li>By subscribing, you authorise charges to your selected payment method.</li>
            <li>Refunds are handled per our Refund Policy; monthly plans are typically non-refundable once active.</li>
          </ul>
        </Box>

        {/* 4. Intellectual Property */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            4. Intellectual Property
          </Typography>
          <ul>
            <li>Platform code, design, and trademarks belong to Linck One Enterprises or licensors.</li>
            <li>You retain ownership of your content; you grant us a limited licence to host and display it to provide the Services.</li>
            <li>Unauthorised reproduction or redistribution is prohibited.</li>
          </ul>
        </Box>

        {/* 5. Third-Party Integrations */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            5. Third-Party Integrations
          </Typography>
          <ul>
            <li>We integrate services such as Razorpay, Google Analytics, and the WhatsApp Business API (Meta) to deliver features.</li>
            <li>Your use of third-party services is subject to their terms and privacy policies.</li>
            <li>External links you add are your responsibility; we do not endorse third-party content.</li>
          </ul>
        </Box>

        {/* 5A. WhatsApp Business Integration */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            5A. WhatsApp Business Integration
          </Typography>
          <Typography variant="body1" sx={{ mb: 1.5 }}>
            myHandle enables businesses to send <strong>WhatsApp alerts and notifications</strong> to opted-in customers
            via the <strong>WhatsApp Business API</strong>. By using this feature, you agree to send messages only to
            recipients who have given explicit prior consent, and to comply with all applicable messaging laws and
            Meta’s WhatsApp Business Platform Terms.
          </Typography>
          <Typography variant="body1" sx={{ mb: 1 }}>
            To send WhatsApp alerts through myHandle, you must:
          </Typography>
          <ul>
            <li>Obtain explicit <strong>opt-in consent</strong> from each recipient before sending any messages.</li>
            <li>Provide a clear and easy <strong>opt-out mechanism</strong> (e.g., replying STOP) in every message or at the point of opt-in.</li>
            <li>Use only <strong>pre-approved message templates</strong> for outbound notifications, as required by the WhatsApp Business Platform.</li>
            <li>Accurately identify your business name in all messages so recipients know who is contacting them.</li>
            <li>Not use the service to send spam, unsolicited promotions, or misleading content.</li>
          </ul>
          <Typography variant="body1" sx={{ mt: 1 }}>
            Our integration complies with Meta’s{" "}
            <MuiLink href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" underline="hover">
              WhatsApp Business Platform Terms
            </MuiLink>{" "}
            and India’s TRAI guidelines on commercial communications.
          </Typography>
        </Box>

        {/* 5B. WhatsApp Messaging Rules */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            5B. WhatsApp Messaging Rules
          </Typography>
          <ul>
            <li><strong>Consent required:</strong> You may only send messages to recipients who have explicitly opted in. Bulk messaging without consent is prohibited.</li>
            <li><strong>Template compliance:</strong> Outbound alerts must use Meta-approved message templates. Free-form messaging is only permitted within a 24-hour customer-initiated conversation window.</li>
            <li><strong>No spam or harassment:</strong> Mass unsolicited outreach, phishing, or abusive messaging via myHandle is strictly prohibited and will result in immediate account suspension.</li>
            <li><strong>Content responsibility:</strong> You are responsible for ensuring all message content is accurate, lawful, and does not violate any third-party rights.</li>
          </ul>
        </Box>

        {/* 6. Data, Tokens & Privacy */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            6. Data & Privacy
          </Typography>
          <ul>
            <li>Phone numbers and opt-in records are stored securely with encryption and strict access controls, used only to send the alerts you configure.</li>
            <li>We do not sell or rent your data or your recipients’ data to any third party.</li>
            <li>Message delivery data (sent, delivered, read) is processed solely to provide analytics within your dashboard.</li>
            <li>Your use of the Services is also governed by our <b>Privacy Policy</b>.</li>
          </ul>
        </Box>

        {/* 7. User Responsibilities (WhatsApp Compliance) */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            7. User Responsibilities (WhatsApp Compliance)
          </Typography>
          <ul>
            <li>Ensure all recipients have provided explicit, verifiable opt-in consent before sending WhatsApp alerts.</li>
            <li>Use the Services in accordance with Meta’s{" "}
              <MuiLink href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" underline="hover">
                WhatsApp Business Platform Terms
              </MuiLink>{" "}
              and TRAI’s Commercial Communications regulations.
            </li>
            <li>Do not use myHandle to send spam, harvest personal data without consent, or circumvent applicable messaging policies.</li>
          </ul>
        </Box>

        {/* 8. Revocation & Disconnection */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            8. Revocation & Disconnection
          </Typography>
          <ul>
            <li>You may disable WhatsApp alerts or disconnect your WhatsApp Business number at any time from your myHandle dashboard or by contacting <b>support@chomske.com</b>.</li>
            <li>Upon disconnection, we will cease sending messages on your behalf and delete stored API credentials as applicable.</li>
          </ul>
        </Box>

        {/* 9. Data Deletion */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            9. Data Deletion
          </Typography>
          <ul>
            <li>Request deletion by emailing <b>support@chomske.com</b> from your registered email.</li>
            <li>We will delete your account, tokens, and hosted content within 7 days, retaining only minimal records required by law (e.g., invoices).</li>
          </ul>
        </Box>

        {/* 10. Termination */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            10. Suspension & Termination
          </Typography>
          <ul>
            <li>We may suspend/terminate for policy violations, unlawful use, security risks, or if required by Meta policies or law.</li>
            <li>We may remove content that violates IP rights, community standards, or these Terms.</li>
          </ul>
        </Box>

        {/* 11. Limitation of Liability */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            11. Disclaimers & Limitation of Liability
          </Typography>
          <ul>
            <li>The Services are provided “as is” without warranties of any kind.</li>
            <li>We are not liable for indirect, incidental, or consequential damages, or for outages beyond our control (third-party APIs, hosting, networks).</li>
          </ul>
        </Box>

        {/* 12. Changes to Features/Scopes */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            12. Changes to Features & Scopes
          </Typography>
          <ul>
            <li>We may modify available features or requested Meta scopes to comply with policy or improve the Services.</li>
            <li>Material changes will be reflected in these Terms and/or our Privacy Policy with an updated “Last updated” date.</li>
          </ul>
        </Box>

        {/* 13. Governing Law */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            13. Governing Law & Jurisdiction
          </Typography>
          <ul>
            <li>These Terms are governed by the laws of India.</li>
            <li>Courts in Hyderabad, Telangana, India, shall have exclusive jurisdiction.</li>
          </ul>
        </Box>

        {/* 14. Contact */}
        <Box mt={4} mb={8}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            14. Contact
          </Typography>
          <Typography variant="body1">
            For questions or clarifications regarding these Terms, contact:<br />
            <strong>Email:</strong> support@chomske.com
          </Typography>
        </Box>
      </Box>

      <Footer />
    </>
  );
};

export default TermsConditions;
