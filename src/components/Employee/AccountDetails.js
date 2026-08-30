import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AccountDetailsPage1 from "./AccountDetailsPage1.js";

// Main Component
const AccountDetails = () => {
  const [activeTab, setActiveTab] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const handleTabChange = (_event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ px: isMobile ? "1rem" : "5rem", mt: '4rem' }}>
      {/* Sticky Header */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 1000, bgcolor: "background.paper" }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant={isMobile ? "scrollable" : "standard"}
          allowScrollButtonsMobile
          sx={{ alignItems: "flex-start" }}
        >
          <Tab
            label="Account"
            sx={{
              fontSize: "16px",
              fontWeight: 400,
              textTransform: "none",
              color: activeTab === 0 ? "primary.main" : "text.secondary",
            }}
          />
          {/* <Tab
            label="Bank Details"
            sx={{
              fontSize: "16px",
              fontWeight: 400,
              textTransform: "none",
              color: activeTab === 1 ? "primary.main" : "text.secondary",
            }}
          /> */}
        </Tabs>
      </Box>

      {/* Content Area */}
      <Box mt={2}>
        {activeTab === 0 && <AccountDetailsPage1 />}
      </Box>
    </Box>
  );
};

export default AccountDetails;
