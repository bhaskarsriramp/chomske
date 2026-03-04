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
          content="Terms & Conditions for myHandle, including Facebook Login and Instagram Graph/Pages API usage, publishing & messaging rules, data/token handling, revocation, and compliance."
        />
        <link rel="canonical" href="https://myhandle.in/terms" />
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
            <li>myHandle provides a link-in-bio and mini-website builder, analytics, and creator tools under a <b>myhandle.in</b> subdomain.</li>
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
            <li>Custom subdomains (e.g., <b>yourname.myhandle.in</b>) are subject to availability and naming rules.</li>
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
            <li>We integrate services such as Razorpay, Google Analytics, and Meta (Facebook & Instagram) to deliver features.</li>
            <li>Your use of third-party services is subject to their terms and privacy policies.</li>
            <li>External links you add are your responsibility; we do not endorse third-party content.</li>
          </ul>
        </Box>

        {/* 5A. Meta Integration & Scopes */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            5A. Facebook Login & Instagram Integration
          </Typography>
          <Typography variant="body1" sx={{ mb: 1.5 }}>
            myHandle enables connection of your <strong>Instagram Business or Creator account</strong> (and linked Facebook Page) via
            <strong> Facebook Login</strong>, the <strong>Instagram Graph API</strong>, and the <strong>Pages API</strong>. By connecting,
            you authorise us to access limited data strictly to provide the features you use (e.g., show your username/followers,
            manage publishing you initiate, and optionally manage DMs you choose to enable).
          </Typography>
          <Typography variant="body1" sx={{ mb: 1 }}>
            We may request the following permissions (scopes) through Meta’s consent screen:
          </Typography>
          <ul>
            <li><strong>public_profile</strong> — basic Facebook profile to complete login and associate the connection with your myHandle account.</li>
            <li><strong>instagram_basic</strong> — Instagram username, profile picture, followers count, media count for your connected account.</li>
            <li><strong>pages_show_list</strong> — to list Pages you manage and find the Instagram account linked to each Page.</li>
            <li><strong>business_management</strong> — limited use to verify/manage the relationship between your Business assets and our app
              (e.g., linking eligible assets for advanced features). We do not use this to modify your content or advertise.</li>
            <li><strong>(Optional)</strong> <em>instagram_content_publish</em> — to publish/schedule content you upload in myHandle.</li>
            <li><strong>(Optional)</strong> <em>instagram_manage_messages</em>, <em>pages_messaging</em> — to view and respond to user-initiated DMs in your inbox,
              subject to Meta’s messaging rules (e.g., 24-hour window).</li>
          </ul>
          <Typography variant="body1" sx={{ mt: 1 }}>
            You can revoke access at any time in your{" "}
            <MuiLink href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer" underline="hover">
              Facebook Business Integrations
            </MuiLink>{" "}
            and{" "}
            <MuiLink href="https://business.facebook.com/settings/" target="_blank" rel="noopener noreferrer" underline="hover">
              Meta Business Settings
            </MuiLink>.
          </Typography>
        </Box>

        {/* 5B. Publishing & Messaging Rules */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            5B. Instagram Publishing & Messaging Rules
          </Typography>
          <ul>
            <li><strong>User-initiated actions:</strong> We publish or message only when you initiate/configure it in myHandle.</li>
            <li><strong>Messaging window:</strong> Automated replies are limited to conversations initiated by users and must follow Meta’s 24-hour standard messaging window and anti-spam rules.</li>
            <li><strong>No unsolicited outreach:</strong> Cold DMs or mass unsolicited messaging via myHandle are prohibited.</li>
            <li><strong>Content ownership:</strong> You must own or have rights to publish any content you upload/schedule through myHandle.</li>
          </ul>
        </Box>

        {/* 6. Data, Tokens & Privacy */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            6. Data, Tokens & Privacy
          </Typography>
          <ul>
            <li>We store access tokens securely with encryption and access controls. Tokens are used only to perform actions you request.</li>
            <li>We do not sell or rent your data. We do not use Meta data for advertising or profiling.</li>
            <li>Inbox data (if enabled) is processed only to display and manage your DMs; we do not expose your message content to other users.</li>
            <li>Your use of the Services is also governed by our <b>Privacy Policy</b>.</li>
          </ul>
        </Box>

        {/* 7. User Responsibilities (Meta Compliance) */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            7. User Responsibilities (Meta Compliance)
          </Typography>
          <ul>
            <li>Maintain your Instagram as Business/Creator and link it to a Facebook Page you manage.</li>
            <li>Use the Services in accordance with Meta’s{" "}
              <MuiLink href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" underline="hover">
                Platform Terms and Developer Policies
              </MuiLink>.
            </li>
            <li>Do not use myHandle to circumvent Meta policies, send spam, or harvest personal data without consent.</li>
          </ul>
        </Box>

        {/* 8. Revocation & Disconnection */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            8. Revocation & Disconnection
          </Typography>
          <ul>
            <li>You may disconnect at any time via Facebook Business Integrations or by contacting <b>support@myhandle.in</b>.</li>
            <li>Upon disconnection, we will cease API calls for your account and invalidate stored tokens as applicable.</li>
          </ul>
        </Box>

        {/* 9. Data Deletion */}
        <Box mt={4}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            9. Data Deletion
          </Typography>
          <ul>
            <li>Request deletion by emailing <b>support@myhandle.in</b> from your registered email.</li>
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
            <strong>Email:</strong> support@myhandle.in
          </Typography>
        </Box>
      </Box>

      <Footer />
    </>
  );
};

export default TermsConditions;
