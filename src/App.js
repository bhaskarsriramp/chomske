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
import SideNavbar from './components/Employee/SideNavbar.js';
import UpiMandateModern from './components/Employee/UpiMandate.js';
import DemoLogin from './components/Employee/DemoLogin.js';
import FetchInstagramMedia from './components/Employee/FetchInstagramMedia.js';
import SetupAutomation from './components/Employee/SetupAutomation.js';
import AutomationList from './components/Employee/AutomationList.js';
import AutomationDetails from './components/Employee/AutomationDetails.js';
import RepliedContacts from './components/Employee/RepliedContacts.js';
import UpgradePlan from './components/Employee/UpgradePlan.js';


// very critial yes





function App() {

   const GOOGLE_CLIENT_ID = "341385315335-6p5l9nqi7hrm953k4ucr48gr2fvpq6eu.apps.googleusercontent.com";

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="App">
        <Router>
           <GoogleAnalytics />
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
              <Route path="/youtube_api_disclosure" element={<YouTubeDisclosure />} />
              <Route path="/security" element={<Security />} />
              <Route path="/personalised-user-tone" element={<ProfileBasedDiscovery />} />
              <Route path="/schedule-publish" element={<EndToEndScheduling />} />
              <Route path="/save-time" element={<SaveTimePage />} />


              <Route path="/professional/*" element={<SideNavbar />}>

                <Route path="support" element={<Support />} />
                <Route path="profile" element={<AccountDetails />} />
                <Route path="fetch_media" element={<FetchInstagramMedia />} />
                <Route path="automations" element={<AutomationList />} />
                <Route path="automation/setup/:post_id" element={<SetupAutomation />} />
                <Route path="automation/details/:postId" element={<AutomationDetails />} />
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
