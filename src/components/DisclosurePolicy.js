import {
  Container,
  Typography,
  Box
} from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';

const DisclosurePolicy = () => {
  return (
    <>
    <Navbar />
    <Container maxWidth="md" sx={{ py: 6, mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Disclosure Policy
      </Typography>

      <Typography variant="body1">
        At Chomske, we're committed to maintaining the highest standards of security for our users. We welcome security researchers to report any potential vulnerabilities they discover, provided it’s done in a respectful, ethical, and responsible manner.
      </Typography>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          What You Can Expect from Us
        </Typography>
        <Typography variant="body2">
          When you report a vulnerability in good faith, Chomske commits to:
        </Typography>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li><Typography variant="body2">Keeping your identity and report confidential</Typography></li>
          <li><Typography variant="body2">Acknowledging your report promptly</Typography></li>
          <li><Typography variant="body2">Investigating and assessing the issue thoroughly</Typography></li>
          <li><Typography variant="body2">Notifying you once it's resolved</Typography></li>
          <li><Typography variant="body2">Crediting your contribution publicly, if you wish</Typography></li>
        </ul>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Scope and Testing Rules
        </Typography>
        <Typography variant="body2">
          Please ensure that your testing adheres to the following guidelines:
        </Typography>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li><Typography variant="body2">Test only with accounts you own or are authorized to use</Typography></li>
          <li><Typography variant="body2">Avoid accessing data that isn't yours</Typography></li>
          <li><Typography variant="body2">Do not run DoS/DDoS attacks or performance stress tests</Typography></li>
          <li><Typography variant="body2">No phishing, vishing, social engineering, or deceptive methods</Typography></li>
          <li><Typography variant="body2">Do not test third-party systems integrated with Chomske</Typography></li>
          <li><Typography variant="body2">Never upload or spread malware or other harmful software</Typography></li>
          <li><Typography variant="body2">Do not test physical infrastructure like offices or servers</Typography></li>
          <li><Typography variant="body2">Ensure testing is not done from sanctioned regions or individuals on watchlists</Typography></li>
        </ul>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Safe Harbor Statement
        </Typography>
        <Typography variant="body2">
          Chomske will not pursue legal action against those who identify and report security issues in good faith and within the boundaries of this policy. We reserve all legal rights if these boundaries are not respected.
        </Typography>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          How to Report a Vulnerability
        </Typography>
        <Typography variant="body2">
          To report a vulnerability, please submit a detailed report via our official disclosure channel. Include all relevant information that would help us replicate and understand the issue.
        </Typography>
        <Typography variant="body2">
          Please do not disclose any findings publicly without our prior written approval. Once reported, ensure that any sensitive data obtained during your testing is deleted.
        </Typography>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Rewards and Recognition
        </Typography>
        <Typography variant="body2">
          You may be eligible for a reward if:
        </Typography>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li><Typography variant="body2">You are the first to report the issue</Typography></li>
          <li><Typography variant="body2">The vulnerability is valid and verified by our security team</Typography></li>
          <li><Typography variant="body2">You’ve followed all terms and guidelines outlined here</Typography></li>
        </ul>
        <Typography variant="body2">
          Please note that any reward is at our sole discretion and not guaranteed. Rewards will be issued through the channels defined by Chomske.
        </Typography>
      </Box>
    </Container>
    <Footer />
    </>

  );
};

export default DisclosurePolicy;
