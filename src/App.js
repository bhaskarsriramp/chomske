// import logo from './logo.svg';
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ToastContainer } from 'react-toastify';
import "react-toastify/dist/ReactToastify.css";
import LandingPage from './components/LandingPage.js';
import Support from './components/Employee/Support.js';
import Profile from './components/Employee/Profile.js';
import PricingPage from './components/PricingPage.js';
import Terms from './components/Terms.js';
import PrivacyPolicy from './components/PrivacyPolicy.js';
import CancellationRefund from './components/CancellationRefund.js';
import ShippingPolicy from './components/ShippingPolicy.js';
import ContactUs from './components/ContactUs.js';
import ProfileSettings from './components/Employee/Profile.js';
import AccountDetails from './components/Employee/AccountDetails.js';
import GoogleApiDisclosure from './components/GoogleApiDisclosure.js';
import DisclosurePolicy from './components/DisclosurePolicy.js';
import TrustCenter from './components/TrustCenter.js';
import AboutUs from './components/AboutUs.js';
import YouTubeDisclosure from './components/YoutubeApiDisclosure.js';
import Security from './components/Security.js';
import CreatorInUserLogin from './components/Employee/CreatorUserLogin.js';
import ProfileBasedDiscovery from './components/ProfileDiscovery.js';
import EndToEndScheduling from './components/EndToEndScheduling.js';
import SaveTimePage from './components/SaveTimePage.js';
import GoogleAnalytics from './components/GoogleAnalytics.js';
import { GoogleOAuthProvider } from "@react-oauth/google";
import CreatorOnboarding from './components/CreatorOnboarding.js';
import UserBioDashboard from './components/UserBioDashboard.js';
import PublicProfile from './components/Employee/PublicProfile.js';
import ProductCatalogue from './components/Employee/ProductCatalogue.js'
import ProductGallery from './components/Employee/ProductGallery.js';
import UserParticipant from './components/Employee/UserParticipant.js';
import ChatWindow from './components/Employee/ChatWindow.js';
import MyInbox from './components/Employee/MyInbox.js';
import MyChatWindow from './components/Employee/MyChatWindow.js';
import PageAnalytics from './components/Employee/PageAnalytics.js';
import BlocksAnalytics from './components/Employee/BlockAnalytics.js';
import StoreAnalytics from './components/Employee/StoreAnalytics.js';
import NewsletterEmailsTable from './components/Employee/NewsletterEmailTable.js';
import SideNavbar from './components/Employee/SideNavbar.js';
import DashboardAnalytics from './components/Employee/DashboardAnalytics.js';
import UpiMandateModern from './components/Employee/UpiMandate.js';
import DemoLogin from './components/Employee/DemoLogin.js';
import DigitalTransactions from './components/Employee/DigitalTransactions.js';
import FetchInstagramMedia from './components/Employee/FetchInstagramMedia.js';
import SetupAutomation from './components/Employee/SetupAutomation.js';
import AutomationList from './components/Employee/AutomationList.js';
import AutomationDetails from './components/Employee/AutomationDetails.js';
import CreatorBookings from './components/Employee/BookingSessions.js';
import FormSubmissions from './components/Employee/FormSubmissions.js';
import RepliedContacts from './components/Employee/RepliedContacts.js';
import UpgradePlan from './components/Employee/UpgradePlan.js';


// very critial yes





function App({ initialSubdomain = null, initialProfile = null }) {

   const GOOGLE_CLIENT_ID = "191478155465-ldeodgltp87ehgudqg648no94cuitbqs.apps.googleusercontent.com";

 // inside App component, replace the early-return branch with this:

if (initialSubdomain) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="App">
          {/* Wrap in a Router so any components using useLocation/useNavigate work */}
          <Router>
            <GoogleAnalytics />
            <PublicProfile handle={initialSubdomain} initialProfile={initialProfile} />
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
           <GoogleAnalytics />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/creator/onboarding" element={<CreatorOnboarding />} />
              <Route path="/professional/login" element={<CreatorInUserLogin />} />
              <Route path="/professional/login/d" element={<DemoLogin />} />
              <Route path="/influencer/participant/login" element={<UserParticipant />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/subscribe/plan" element={<UpiMandateModern />} />
              <Route path="/chat-window" element={<ChatWindow />} />
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
              <Route path="/youtube_api_disclosure" element={<YouTubeDisclosure />} />
              <Route path="/security" element={<Security />} />
              <Route path="/personalised-user-tone" element={<ProfileBasedDiscovery />} />
              <Route path="/schedule-publish" element={<EndToEndScheduling />} />
              <Route path="/save-time" element={<SaveTimePage />} />
              <Route path="/products-affiliate" element={<ProductGallery />} />

           
              <Route path="/professional/*" element={<SideNavbar />}>

                <Route path="user/bio" element={<UserBioDashboard />} />
                <Route path="support" element={<Support />} />
                <Route path="profile" element={<AccountDetails />} />
                <Route path="store/products" element={<ProductCatalogue />} />
                <Route path="my/inbox" element={<MyInbox />} />
                <Route path="my/chatwindow/:conversationId" element={<MyChatWindow />} />
                <Route path="my/page/analytics" element={<PageAnalytics />} />
                <Route path="my/store/analytics" element={<StoreAnalytics />} />
                <Route path="my/block/analytics" element={<BlocksAnalytics />} />
                <Route path="newsletter/emails" element={<NewsletterEmailsTable />} />
                <Route path="dashboard/analytics" element={<DashboardAnalytics />} />
                <Route path="my_orders" element={<DigitalTransactions />} />
                <Route path="fetch_media" element={<FetchInstagramMedia />} />
                <Route path="automations" element={<AutomationList />} />
                <Route path="automation/setup/:post_id" element={<SetupAutomation />} />
                <Route path="automation/details/:postId" element={<AutomationDetails />} />
                <Route path="booking/sessions" element={<CreatorBookings />} />
                <Route path="my/formsubmissions" element={<FormSubmissions />} />
                <Route path="contacts/replied" element={<RepliedContacts />} />
                <Route path="upgrade/plan" element={<UpgradePlan />} />





              </Route>


              <Route path="/" element={<Outlet />}>
                {/* Other global routes */}
              </Route>
            </Routes>
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
