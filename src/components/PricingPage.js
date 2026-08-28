// PricingPage.js
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  useMediaQuery,
  Chip,
  Divider,
  Stack,
} from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';

// Feature Icons
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import ContactsRoundedIcon from '@mui/icons-material/ContactsRounded';
import QuickreplyRoundedIcon from '@mui/icons-material/QuickreplyRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import GroupAddRoundedIcon from '@mui/icons-material/GroupAddRounded';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import HttpsRoundedIcon from '@mui/icons-material/HttpsRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import InstagramIcon from '@mui/icons-material/Instagram';
import WebStoriesOutlinedIcon from '@mui/icons-material/WebStoriesOutlined';
import PolylineOutlinedIcon from '@mui/icons-material/PolylineOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import LoyaltyOutlinedIcon from '@mui/icons-material/LoyaltyOutlined';
import MoveDownOutlinedIcon from '@mui/icons-material/MoveDownOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import AdUnitsOutlinedIcon from '@mui/icons-material/AdUnitsOutlined';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import OutdoorGrillOutlinedIcon from '@mui/icons-material/OutdoorGrillOutlined';
import DownloadingOutlinedIcon from '@mui/icons-material/DownloadingOutlined';
const PLAN = {
  price: 399,
  label: 'Monthly',
  subLabel: 'Billed monthly',
  cta: 'Start for ₹399',
  note: '7 days free trial'
};

// Organized features by category
const featureCategories = [
    {
    title: 'Instagram Automation',
    icon: InstagramIcon,
    color: '#e4405f',
    features: [
      { text: '25 Lakh Automated Replies per Month', icon: QuickreplyRoundedIcon },
      { text: '25 Lakh Automated DMs per Month', icon: SendRoundedIcon },
      { text: 'Unlimited Contacts', icon: ContactsRoundedIcon },
      { text: 'Unlimited Automations', icon: PolylineOutlinedIcon },
      { text: 'Unlimited File Upload/Downloads', icon: DownloadingOutlinedIcon },
    ]
  },
  {
    title: 'Link-in-Bio Features',
    icon: WebStoriesOutlinedIcon,
    color: '#7c3aed',
    features: [
      { text: 'Unlimited Links', icon: LinkRoundedIcon },
      { 
        text: 'Username.myhandle.in NOT myhandle.in/username', 
        icon: LanguageRoundedIcon,
        strikethrough: 'myhandle.in/username' // Mark text to strikethrough
      },
      { text: 'Digital Store', icon: StorefrontOutlinedIcon },
      { text: 'Collect & Manage Subscribers', icon: GroupAddRoundedIcon },
      { text: 'Advanced Analytics: Visitors, Views, CTR, Top links, Referrers, City & State', icon: InsightsRoundedIcon },
      { text: 'Simple Editor • drag & reorder links', icon: DragIndicatorRoundedIcon },
      { text: 'Social Profiles, Videos & Embeds', icon: ShareRoundedIcon },
      { text: 'English + Hindi support', icon: TranslateRoundedIcon },
    ]
  },

  {
    title: 'Support & Security',
    icon: ShieldRoundedIcon,
    color: '#10b981',
    features: [
      { text: 'Data stays in India', icon: StorageOutlinedIcon },
      { text: 'Fast, secure hosting with SSL', icon: HttpsRoundedIcon },
      { text: 'Priority support (24–48 business hours)', icon: SupportAgentRoundedIcon },
    ]
  },

  //  {
  //   title: 'Payments & Transactions',
  //   icon: PaymentsRoundedIcon,
  //   color: '#F87B1B',
  //   features: [
  //     { text: 'Razorpay Payment Gateway', icon: AccountBalanceOutlinedIcon },
  //      { 
  //       text: '4% on Digital Sale NOT ', 
  //       icon: LoyaltyOutlinedIcon,
  //       strikethrough: '10%'
  //     },
  //      { 
  //       text: 'Weekly Settlements NOT ', 
  //       icon: MoveDownOutlinedIcon,
  //       strikethrough: 'Monthly'
  //     },
  //     { text: 'Supports All Payment Methods', icon: CurrencyRupeeOutlinedIcon },
  //   ]
  // },

   {
    title: 'Coming Very Soon',
    icon: OutdoorGrillOutlinedIcon,
    color: '#44444E',
    features: [
      { text: 'Brand Outreach & Collaboration', icon: Inventory2OutlinedIcon },
      { text: 'Give-away Feature in Bio', icon: CardGiftcardOutlinedIcon },
      { text: 'AI-powered Reply & DM suggestions', icon: AutoAwesomeOutlinedIcon },
      { text: 'Competitor Benchmarks', icon: FactCheckOutlinedIcon },
      { text: 'Pop-up Banner for Faster Sale', icon: AdUnitsOutlinedIcon },
      { text: 'Link shortner', icon: ShortcutOutlinedIcon },
      
    ]
  }
];

export default function PricingPage() {
  const isMobile = useMediaQuery('(max-width:600px)');

  // Helper function to render text with strikethrough
  const renderFeatureText = (feature) => {
    if (feature.strikethrough) {
      const parts = feature.text.split(feature.strikethrough);
      return (
        <>
          {parts[0]}
          <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>
            {feature.strikethrough}
          </span>
          {parts[1]}
        </>
      );
    }
    return feature.text;
  };

  return (
    <>
      <header>
        <title>Pricing and Packages | MyHandle</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Checkout the prices and rates for MyHandle." />
      </header>

      <Navbar />

      {/* Background */}
      <Box
        sx={{
          minHeight: '100vh',
          mt: 4,
          background:
            'radial-gradient(1200px 600px at 20% -10%, #ede9fe 0%, rgba(237,233,254,0) 50%), radial-gradient(900px 500px at 120% 10%, #f0f9ff 0%, rgba(240,249,255,0) 55%), linear-gradient(180deg, #ffffff 0%, #fafafa 100%)'
        }}
      >
        <Box sx={{ py: 8, px: isMobile ? 2 : 6 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Chip
              icon={<VerifiedRoundedIcon />}
              label="Made in India • Priced for India"
              color="default"
              sx={{
                mb: 2,
                bgcolor: '#eef2ff',
                borderRadius: 2,
                fontWeight: 700,
                fontFamily: 'Inter'
              }}
            />

            <Typography
              sx={{
                fontFamily: 'Inter',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                fontSize: isMobile ? 22 : 42,
                lineHeight: 1.1
              }}
            >
              One simple plan. Everything you need.
            </Typography>

            {/* Trust row */}
            <Stack
              direction="row"
              spacing={1.5}
              justifyContent="center"
              alignItems="center"
              sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}
            >
              <Chip
                icon={<ShieldRoundedIcon />}
                label="Secure SSL"
                variant="outlined"
                sx={{ borderRadius: 2 }}
              />
              <Chip
                icon={<BoltRoundedIcon />}
                label="UPI/Razorpay"
                variant="outlined"
                sx={{ borderRadius: 2 }}
              />
            </Stack>
          </Box>

          {/* Pricing Card */}
          <Grid container justifyContent="center">
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <Card
                elevation={0}
                sx={{
                  overflow: 'hidden',
                  borderRadius: 4,
                  border: '1px solid rgba(0,0,0,0.06)',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(6px)',
                  boxShadow:
                    '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(17,24,39,0.06)'
                }}
              >
                <CardContent sx={{ p: isMobile ? 3 : 5 }}>
                  {/* Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      mb: 3,
                      pb: 3,
                      borderBottom: '2px solid rgba(0,0,0,0.06)',
                      flexWrap: 'wrap'
                    }}
                  >
                    <Box>
                      <Typography
                        sx={{
                          letterSpacing: '-0.01em',
                          fontFamily: 'Inter',
                          fontSize: isMobile ? 18 : 24,
                          fontWeight: 700
                        }}
                      >
                        {PLAN.label} Plan
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 15 }}>
                        {PLAN.subLabel}
                      </Typography>
                    </Box>

                    <Box sx={{ textAlign: isMobile ? 'left' : 'right' }}>
                      <Typography
                        sx={{
                          letterSpacing: '-0.01em',
                          fontFamily: 'Inter',
                          fontSize: isMobile ? 22 : 28,
                          fontWeight: 800
                        }}
                      >
                        ₹{PLAN.price}
                        <Typography
                          component="span"
                          color="text.secondary"
                          sx={{ ml: 0.5, fontSize: isMobile ? 14 : 16, fontWeight: 500 }}
                        >
                          /month
                        </Typography>
                      </Typography>
                      <Typography color="success.dark" sx={{ fontWeight: 600, fontSize: 14 }}>
                        {PLAN.note}
                      </Typography>
                    </Box>
                  </Box>

                  {/* CTA */}
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    endIcon={<StarRoundedIcon />}
                    sx={{
                      mb: 4,
                      py: 1.6,
                      borderRadius: 2.5,
                      textTransform: 'none',
                      fontFamily: 'Inter',
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      background:
                        'linear-gradient(90deg, #111827 0%, #4f46e5 50%, #7c3aed 100%)',
                      boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
                      '&:hover': { 
                        opacity: 0.95,
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 24px rgba(79,70,229,0.4)'
                      }
                    }}
                    onClick={() => (window.location.href = '/professional/login')}
                  >
                    {PLAN.cta}
                  </Button>

                  {/* Feature Categories */}
                  {featureCategories.map((category, idx) => {
                    const CategoryIcon = category.icon;
                    return (
                      <Box key={idx} sx={{ mb: idx < featureCategories.length - 1 ? 0 : 0 }}>
                        {/* Category Header */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 2.5
                          }}
                        >
                          <CategoryIcon
                            sx={{
                              fontSize: 24,
                              color: category.color
                            }}
                          />
                          <Typography
                            sx={{
                              fontFamily: 'Inter',
                              fontSize: 18,
                              fontWeight: 700,
                              color: category.color
                            }}
                          >
                            {category.title}
                          </Typography>
                        </Box>

                        {/* Features List */}
                        <Stack>
                          {category.features.map((feature, i) => {
                            const FeatureIcon = feature.icon;
                            return (
                              <Box
                                key={i}
                                sx={{
                                  display: 'flex',
                                  gap: 1.5,
                                  p: 1.5,
                                  bgcolor: 'rgba(255,255,255,0.5)',
                                  borderRadius: 1.5,
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    bgcolor: 'rgba(124,58,237,0.05)',
                                    transform: 'translateX(4px)'
                                  }
                                }}
                              >
                                <FeatureIcon
                                  fontSize="small"
                                  sx={{
                                    color: category.color,
                                    mt: '2px',
                                    flexShrink: 0
                                  }}
                                />
                                <Typography
                                  sx={{
                                    color: '#111827',
                                    fontFamily: 'Inter',
                                    fontSize: isMobile ? 16 : 16,
                                    lineHeight: 1.5,
                                    fontWeight: 500
                                  }}
                                >
                                  {renderFeatureText(feature)}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Stack>

                        {/* Divider between categories */}
                        {idx < featureCategories.length - 1 && (
                          <Divider sx={{ my: 3 }} />
                        )}
                      </Box>
                    );
                  })}

                  {/* Guarantee strip */}
                  <Box
                    sx={{
                      mt: 3,
                      p: 2,
                      bgcolor: '#f0fdf4',
                      border: '1px solid #dcfce7',
                      borderRadius: 2
                    }}
                  >
                    <Typography variant="body2" sx={{ color: '#065f46', lineHeight: 1.6 }}>
                      <strong>7-day no-questions-asked refund.</strong> Cancel anytime from your dashboard.{' '}
                      Read our{' '}
                      <a
                        href="/refund-cancellation-policy"
                        style={{ color: '#065f46', fontWeight: 600, textDecoration: 'underline' }}
                      >
                        Refund Policy
                      </a>
                      .
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Box>

      <Footer />
    </>
  );
}
