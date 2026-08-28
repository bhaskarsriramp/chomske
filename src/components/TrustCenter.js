import { useMediaQuery, Box, Typography, Card, CardContent, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import Navbar from './Navbar';
import Footer from './Footer';
    import { Helmet } from "react-helmet";


const TrustCenter = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  const sections = [
    {
      title: 'Security',
      bulletPoints: [
        'End-to-end encryption with TLS 1.3 and AES-256 to protect data in transit and at rest.',
        'OAuth 2.0 for secure third-party integrations with minimal required access.',
        'Strict role-based access controls ensure only authorized internal access.',
        'Isolated dev, staging, and production environments to prevent data leaks.',
        '24/7 monitoring with real-time alerts and threat detection.',
        'Frequent security audits and third-party penetration testing.',
        'Built-in compliance readiness with best practices like OWASP Top 10.'
      ]
    },
    {
      title: 'Privacy',
      bulletPoints: [
        'We collect only the data necessary to operate and improve MyHandle.',
        'You have full control to access, update, or delete your data at any time.',
        'No data is shared with third parties without your explicit consent.',
        'Our systems and practices are aligned with global data privacy laws, including GDPR.',
        'We are transparent about how your data is stored, processed, and secured.'
      ]
    },
    {
      title: 'Accessibility',
      bulletPoints: [
        'Built with accessibility-first principles for users of all abilities.',
        'Compliant with WCAG 2.1 standards for accessible design and interaction.',
        'Ongoing testing and updates to improve accessibility across devices.',
        'Support documentation and accessible customer service for every user.',
        'Optimized layouts and text readability for mobile and screen readers.'
      ]
    }
  ];

  return (
    <>


<Helmet>
  <title>Trust Center | Security, Privacy & Accessibility | MyHandle</title>
  <meta
    name="description"
    content="The MyHandle Trust Center explains how we keep your data safe with encryption, role-based access, GDPR compliance, and accessibility-first design."
  />

  {/* Canonical URL */}
  <link rel="canonical" href="https://myhandle.in/trust-center" />

  {/* Open Graph */}
  <meta property="og:title" content="Trust Center | Security, Privacy & Accessibility | MyHandle" />
  <meta
    property="og:description"
    content="Learn how MyHandle builds trust: AES-256 encryption, GDPR compliance, OAuth 2.0 authentication, WCAG 2.1 accessibility, and transparency by design."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://myhandle.in/trust-center" />
  <meta
    property="og:image"
    content="https://storage.googleapis.com/postlnbucketcom/logo_512x512-removebg-preview.png"
  />

  {/* Twitter */}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Trust Center | Security, Privacy & Accessibility | MyHandle" />
  <meta
    name="twitter:description"
    content="Explore MyHandle's Trust Center — enterprise-grade security, data privacy, GDPR compliance, and accessibility for every user."
  />
  <meta
    name="twitter:image"
    content="https://storage.googleapis.com/postlnbucketcom/logo_512x512-removebg-preview.png"
  />
</Helmet>

      <Navbar />
      <Box sx={{ padding: isMobile ? 2 : 4, mt: 10, px: isMobile ? 2 : 10 }}>
        <Typography sx={{ fontSize: isMobile ? '32px' : '52px', fontWeight: 500 }} gutterBottom>
          Trust Center
        </Typography>

        <Typography sx={{ fontSize: isMobile ? '18px' : '30px', fontWeight: 400 }} gutterBottom>
          Building trust with our users starts with transparency. The MyHandle Trust Center offers clear, in-depth insights into our approach to security, privacy, accessibility, and compliance.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2, flexWrap: 'wrap', mt: 6 }}>
          {sections.map((section, index) => (
            <Card key={index} sx={{ flex: 1, minWidth: isMobile ? '100%' : '30%', marginBottom: 2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {section.title}
                </Typography>
                <List>
                  {section.bulletPoints.map((point, idx) => (
                    <ListItem key={idx} sx={{ alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 24, mt: 0.5 }}>
                        <FiberManualRecordIcon sx={{ fontSize: 8 }} />
                      </ListItemIcon>
                      <ListItemText primary={point} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
      <Footer />
    </>
  );
};

export default TrustCenter;
