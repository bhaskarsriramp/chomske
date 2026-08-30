// import logo from './logo.svg';
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { useEffect, lazy, Suspense } from "react";
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ToastContainer } from 'react-toastify';
import "react-toastify/dist/ReactToastify.css";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { getSocket } from "../src/realtime/socket.js";

// Eager imports — needed immediately on landing page or globally
import LandingPage from './components/LandingPage.js';
import GoogleAnalytics from './components/GoogleAnalytics.js';
import ScrollToTop from './components/ScrollToTop.js';
import SideNavbar from './components/Employee/SideNavbar.js';


// Lazy-loaded route components
const LeadFinderDashboard = lazy(() => import('./components/Employee/LeadFinderDashboard.js'));
const Support = lazy(() => import('./components/Employee/Support.js'));
const PricingPage = lazy(() => import('./components/PricingPage.js'));
const Terms = lazy(() => import('./components/Terms.js'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy.js'));
const CancellationRefund = lazy(() => import('./components/CancellationRefund.js'));
const ShippingPolicy = lazy(() => import('./components/ShippingPolicy.js'));
const ContactUs = lazy(() => import('./components/ContactUs.js'));
const ProfileSettings = lazy(() => import('./components/Employee/Profile.js'));
const AccountDetails = lazy(() => import('./components/Employee/AccountDetailsPage1.js'));
const GoogleApiDisclosure = lazy(() => import('./components/GoogleApiDisclosure.js'));
const DisclosurePolicy = lazy(() => import('./components/DisclosurePolicy.js'));
const TrustCenter = lazy(() => import('./components/TrustCenter.js'));
const AboutUs = lazy(() => import('./components/AboutUs.js'));
const Security = lazy(() => import('./components/Security.js'));
const CreatorInUserLogin = lazy(() => import('./components/Employee/CreatorUserLogin.js'));
const CreatorOnboarding = lazy(() => import('./components/CreatorOnboarding.js'));
const UserBioDashboard = lazy(() => import('./components/UserBioDashboard.js'));
const PublicProfile = lazy(() => import('./components/Employee/PublicProfile.js'));
const ProductCatalogue = lazy(() => import('./components/Employee/ProductCatalogue.js'));
const ProductGallery = lazy(() => import('./components/Employee/ProductGallery.js'));
const PageAnalytics = lazy(() => import('./components/Employee/PageAnalytics.js'));
const BlocksAnalytics = lazy(() => import('./components/Employee/BlockAnalytics.js'));
const StoreAnalytics = lazy(() => import('./components/Employee/StoreAnalytics.js'));
const NewsletterEmailsTable = lazy(() => import('./components/Employee/NewsletterEmailTable.js'));
// SideNavbar is eagerly loaded because it's the dashboard layout shell.
// Lazy-loading it causes the sidebar to unmount/remount on every route change.
const DashboardAnalytics = lazy(() => import('./components/Employee/DashboardAnalytics.js'));
const UpiMandateModern = lazy(() => import('./components/Employee/UpiMandate.js'));
const DemoLogin = lazy(() => import('./components/Employee/DemoLogin.js'));
const DigitalTransactions = lazy(() => import('./components/Employee/DigitalTransactions.js'));
const FetchInstagramMedia = lazy(() => import('./components/Employee/FetchInstagramMedia.js'));
const SetupAutomation = lazy(() => import('./components/Employee/SetupAutomation.js'));
const AutomationList = lazy(() => import('./components/Employee/AutomationList.js'));
const AutomationDetails = lazy(() => import('./components/Employee/AutomationDetails.js'));
const CreatorBookings = lazy(() => import('./components/Employee/BookingSessions.js'));
const FormSubmissions = lazy(() => import('./components/Employee/FormSubmissions.js'));
const RepliedContacts = lazy(() => import('./components/Employee/RepliedContacts.js'));
const UpgradePlan = lazy(() => import('./components/Employee/UpgradePlan.js'));
const SetupAutoDmAutomation = lazy(() => import('./components/Employee/SetupAutoDmAutomation.js'));
const InboxManagement = lazy(() => import('./components/Employee/InboxManagement.js'));
const MagicLinkHandler = lazy(() => import('./components/Employee/MagicLinkHandler.js'));
const AutomationAnalytics = lazy(() => import('./components/Employee/AutomationAnalytics.js'));
const FuturePostsAutomation = lazy(() => import('./components/Employee/FuturePostsAutomation.js'));
const LeadFinderFeature = lazy(() => import('./components/LeadFinderFeature.js'));
const AllFeaturesMenu = lazy(() => import('./components/AllFeaturesMenu.js'));


// Lazy-loaded admin pages
const AdminLogin = lazy(() => import('./components/Admin/AdminLogin.js'));
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard.js'));


// very critial yes





function App({ initialSubdomain = null, initialProfile = null }) {

   const GOOGLE_CLIENT_ID = "341385315335-6p5l9nqi7hrm953k4ucr48gr2fvpq6eu.apps.googleusercontent.com";

   useEffect(() => {
  const socket = getSocket();

  if (!socket.connected) {
    socket.connect();
  }

  socket.on("connect", () => {
    // console.log("🟢 Global socket connected:", socket.id);
  });

  socket.on("disconnect", () => {
    // console.log("🔴 Global socket disconnected");
  });

  return () => {
    socket.disconnect();
  };
}, []);


 // inside App component, replace the early-return branch with this:

if (initialSubdomain) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="App">
          {/* Wrap in a Router so any components using useLocation/useNavigate work */}
          <Router>
            <ScrollToTop />
            <GoogleAnalytics />
            <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
              <PublicProfile handle={initialSubdomain} initialProfile={initialProfile} />
            </Suspense>
          </Router>

          <ToastContainer
            position="top-left"
            autoClose={2000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
            style={{ zIndex: 15000 }}
          />
        </div>
      </GoogleOAuthProvider>
    </LocalizationProvider>
  );
}



  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="App">
        <Router>
           <ScrollToTop />
           <GoogleAnalytics />
           <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/professional/login" element={<CreatorInUserLogin />} />
              <Route path="/professional/login/d" element={<DemoLogin />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/subscribe/plan" element={<UpiMandateModern />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/refund-cancellation-policy" element={<CancellationRefund />} />
              <Route path="/shipping-policy" element={<ShippingPolicy />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/profile" element={<ProfileSettings />} />
              <Route path="/google-api-disclosure" element={<GoogleApiDisclosure />} />
              <Route path="/disclosure-policy" element={<DisclosurePolicy />} />
              <Route path="/trust-center" element={<TrustCenter />} />
              <Route path="/about-us" element={<AboutUs />} />
              <Route path="/security" element={<Security />} />
              <Route path="/products-affiliate" element={<ProductGallery />} />
              <Route path="/all-features" element = {<AllFeaturesMenu />} />
              <Route path="/lead-finder" element = {<LeadFinderFeature />} />

 {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />

           
              <Route path="/professional/*" element={<SideNavbar />}>

                <Route path="user/bio" element={<UserBioDashboard />} />
                <Route path="creator/onboarding" element={<CreatorOnboarding />} />
                <Route path="support" element={<Support />} />
                <Route path="profile" element={<AccountDetails />} />
                <Route path="store/products" element={<ProductCatalogue />} />
                <Route path="my/page/analytics" element={<PageAnalytics />} />
                <Route path="my/store/analytics" element={<StoreAnalytics />} />
                <Route path="my/block/analytics" element={<BlocksAnalytics />} />
                <Route path="newsletter/emails" element={<NewsletterEmailsTable />} />
                <Route path="dashboard/analytics" element={<DashboardAnalytics />} />
                <Route path="my_orders" element={<DigitalTransactions />} />
                <Route path="fetch_media" element={<FetchInstagramMedia />} />
                <Route path="automations" element={<AutomationList />} />
                <Route path="automation/setup/:post_id" element={<SetupAutomation />} />
                <Route path="setup-automation/:post_id" element={<SetupAutomation />} />
                <Route path="automation/details/:postId" element={<AutomationDetails />} />
                <Route path="autodm/automation" element={<SetupAutoDmAutomation />} />
                <Route path="booking/sessions" element={<CreatorBookings />} />
                <Route path="my/formsubmissions" element={<FormSubmissions />} />
                <Route path="contacts/replied" element={<RepliedContacts />} />
                <Route path="upgrade/plan" element={<UpgradePlan />} />
                <Route path="business/inbox" element={<MagicLinkHandler><InboxManagement /></MagicLinkHandler>} />
                <Route path="dashboard/instagram" element={<AutomationAnalytics />} />
                <Route path="automation/future/posts" element={<FuturePostsAutomation />} />
                <Route path="leads/dashboard" element={<LeadFinderDashboard />} />






              </Route>


              <Route path="/" element={<Outlet />}>
                {/* Other global routes */}
              </Route>
            </Routes>
           </Suspense>
        </Router>

        <ToastContainer
          position="top-left"
          autoClose={2000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
          style={{ zIndex: 15000 }}
        />
      </div>
    </GoogleOAuthProvider>
    </LocalizationProvider>
  );
}

export default App;
