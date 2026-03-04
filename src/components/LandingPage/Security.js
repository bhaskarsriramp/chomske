import { Box, Typography, Grid, Card, CardContent, useMediaQuery } from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";

const securitySections = [
  {
    title: 'Infrastructure & Hosting',
    points: [
      'myHandle runs on Google Cloud Platform (GCP) with hardened, access-controlled environments.',
      'All databases and object storage are isolated in private networks with multi-region encrypted backups.',
      '24/7 monitoring, alerting, and tested disaster recovery plans help ensure business continuity.',
    ],
  },
  {
    title: 'Data Protection',
    points: [
      'Encryption in transit via TLS 1.2+ and encryption at rest (AES-256).',
      'Sensitive secrets (API keys, webhooks, tokens) are stored using a secure secrets manager with strict access controls.',
      'Passwords (if applicable) are hashed using industry-standard algorithms with salt (e.g., bcrypt/Argon2). We never store plain-text passwords.',
    ],
  },
  {
    title: 'Reliability & Availability',
    points: [
      'High availability architecture with auto-scaling and failover at critical layers.',
      'Our service uptime goal is 99.9%+, supported by continuous monitoring and health checks.',
      'Status and incidents are communicated proactively whenever applicable.',
    ],
  },
  {
    title: 'Payment Security',
    points: [
      'Payments are processed via trusted providers such as Razorpay/UPI. myHandle does not store full card/UPI credentials.',
      'Payment partners are PCI DSS compliant; transactions are routed through their secure checkout flows.',
      'Billing events and webhooks are validated and logged to prevent misuse and reconciliation errors.',
    ],
  },
  {
    title: 'User Security',
    points: [
      'Role-based access controls (RBAC) and least-privilege permissions within internal tooling and production systems.',
      'Session management with secure cookies; suspicious sign-ins may be invalidated automatically.',
      'We encourage strong passwords and unique credentials per service. Never share your login or API tokens.',
    ],
  },
  {
    title: 'Analytics & Privacy',
    points: [
      'We collect aggregated metrics (e.g., visitors, views, referrers, device types) to power your dashboard.',
      'Personal data is handled per our Privacy Policy and applicable Indian regulations including the DPDP Act, 2023.',
      'You can request deletion of your account and associated data via support@myhandle.in.',
    ],
  },
  {
    title: 'Access Controls & Auditing',
    points: [
      'Engineer access to production is limited, time-bound, and logged for auditability.',
      'Changes are peer-reviewed and deployed via CI/CD with automated checks.',
      'Administrative actions are logged to support security investigations and compliance.',
    ],
  },
  {
    title: 'Secure Development Lifecycle',
    points: [
      'Dependencies are pinned and scanned regularly; critical patches are prioritized.',
      'Code undergoes review, linting, and automated testing before release.',
      'Environment configuration is immutable and version-controlled.',
    ],
  },
  {
    title: 'Data Retention & Backups',
    points: [
      'Operational logs and analytics are retained for limited durations to support reliability and abuse prevention.',
      'Encrypted backups are taken regularly and tested periodically for restorability.',
      'Upon account deletion, user content and analytics are scheduled for permanent removal, subject to lawful retention (e.g., invoices).',
    ],
  },
  {
    title: 'Responsible Disclosure',
    points: [
      'We welcome responsible vulnerability reports from the security community.',
      'Report potential issues to security@myhandle.in with clear reproduction steps.',
      'We investigate all reports with priority and will work with you on coordinated disclosure.',
    ],
  },
];

const Security = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>Security | myHandle</title>
        <meta
          name="description"
          content="How myHandle protects your data: GCP hosting, encryption at rest and in transit, PCI-compliant payment partners, RBAC, monitoring, backups, and responsible disclosure."
        />
        <link rel="canonical" href="https://myhandle.in/security" />

        {/* Open Graph */}
        <meta property="og:title" content="Security | myHandle" />
        <meta
          property="og:description"
          content="Enterprise-grade security for India’s link-in-bio: encryption, secure hosting, 99.9% uptime goal, PCI-compliant payments, and strict access controls."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://myhandle.in/security" />
        <meta
          property="og:image"
          content="https://storage.googleapis.com/founderpage-assets/logo_512.png"
        />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Security | myHandle" />
        <meta
          name="twitter:description"
          content="myHandle safeguards your data with encryption, secure GCP hosting, rigorous access controls, and responsible disclosure."
        />
        <meta
          name="twitter:image"
          content="https://storage.googleapis.com/founderpage-assets/logo_512.png"
        />
      </Helmet>

      <Navbar />

      <Box sx={{ px: isMobile ? 3 : 10, py: 10, mt: 3 }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 3 }}>
          Security at myHandle
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 400, mb: 5, color: 'gray' }}>
          Your trust is our top priority. myHandle protects your data with modern encryption, secure cloud infrastructure,
          strict access controls, and continuous monitoring—designed for reliability and privacy.
        </Typography>

        <Grid container spacing={4}>
          {securitySections.map((section, idx) => (
            <Grid item xs={12} md={6} key={idx}>
              <Card elevation={3} sx={{ height: '100%', borderRadius: '16px' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {section.title}
                  </Typography>
                  <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                    {section.points.map((point, index) => (
                      <li key={index} style={{ marginBottom: '0.5rem', color: '#333' }}>
                        <Typography variant="body1">{point}</Typography>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Footer />
    </>
  );
};

export default Security;
