// DigitalDeliveryPolicy.js
import { Box, Container, Typography, Divider, Link as MUILink, Alert } from "@mui/material";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function ShippingPolicy({
  brandName = "MyHandle",
  supportEmail = "support@chomske.com",
  termsLink = "/terms",
  refundLink = "/refund-policy",
  privacyLink = "/privacy-policy",
  lastUpdated = "October 6, 2025",
}) {
  return (

    <>
       <header>
        <title>Shipping Policy | MyHandle</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </header>

    <Navbar />
      <Box sx={{ bgcolor: "background.default", mt: 6 }}>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              letterSpacing: -0.5,
              fontSize: { xs: 28, md: 36 },
            }}
          >
            Digital Delivery & Activation Policy
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: 0.5 }}
          >
            Last updated: {lastUpdated}
          </Typography>
        </Box>

        {/* Info */}
        <Alert
          severity="info"
          icon={false}
          sx={{
            mb: 3,
            borderRadius: 2,
            boxShadow: "0 8px 24px rgba(2,6,23,0.08)",
          }}
        >
          {brandName} is a digital platform. No physical products are shipped.
          Once your payment is confirmed, your account and features are
          activated instantly.
        </Alert>

        {/* Sections */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            1. Instant Activation
          </Typography>
          <Typography sx={{ mt: 1 }}>
            Upon successful subscription or payment, your {brandName} account
            and all included features become available immediately. You’ll
            receive a confirmation email containing your plan details and
            renewal date (if applicable).
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            2. Access Duration
          </Typography>
          <Typography sx={{ mt: 1 }}>
            Access remains active for the entire billing cycle (monthly or
            yearly, based on your selected plan). You can view renewal or
            expiry details anytime in your account dashboard.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            3. Failed or Cancelled Payments
          </Typography>
          <Typography sx={{ mt: 1 }}>
            If a payment fails or is cancelled, premium features are
            automatically paused until payment is completed. Your links,
            analytics, and other content remain safe and accessible on free
            mode.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            4. No Physical Shipping
          </Typography>
          <Typography sx={{ mt: 1 }}>
            {brandName} provides only digital access to tools and services.
            There are no deliveries, shipments, or tracking details involved.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            5. Refunds & Cancellations
          </Typography>
          <Typography sx={{ mt: 1 }}>
            You can cancel your subscription anytime from your dashboard. For
            refund-related details, please see our{" "}
            <MUILink href={refundLink} underline="hover">
              Refund Policy
            </MUILink>
            .
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            6. Support
          </Typography>
          <Typography sx={{ mt: 1 }}>
            For any issues with activation, billing, or access, please contact
            our support team at{" "}
            <MUILink href={`mailto:${supportEmail}`} underline="hover">
              {supportEmail}
            </MUILink>
            . We typically respond within 24–48 hours.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            7. Policy Acknowledgment
          </Typography>
          <Typography sx={{ mt: 1 }}>
            By completing a payment or activating your subscription, you
            acknowledge that you have read and agreed to our{" "}
            <MUILink href={termsLink} underline="hover">
              Terms of Service
            </MUILink>{" "}
            and{" "}
            <MUILink href={privacyLink} underline="hover">
              Privacy Policy
            </MUILink>
            .
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Footer */}
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block" }}
        >
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </Typography>
      </Container>
    </Box>
    <Footer />
    </>
  
  );
}
