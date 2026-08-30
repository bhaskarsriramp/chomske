import React, { useState, useEffect, useCallback, Suspense } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  AppBar,
  Toolbar,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  useMediaQuery,
  Divider,
  Collapse,
  IconButton,
  Typography,
  LinearProgress,
  Button,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import { deepOrange, green } from "@mui/material/colors";
import MenuIcon from "@mui/icons-material/Menu";
import logo from "../../images/myhandle_logo.svg";
import axios from "axios";
import { toast } from "react-toastify";
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AccountBoxOutlinedIcon from '@mui/icons-material/AccountBoxOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import LinkIcon from '@mui/icons-material/Link';
import InstagramIcon from '@mui/icons-material/Instagram';
import "react-toastify/dist/ReactToastify.css";
import PolylineOutlinedIcon from "@mui/icons-material/PolylineOutlined";
import MarkChatReadOutlinedIcon from '@mui/icons-material/MarkChatReadOutlined';
import FeedOutlinedIcon from '@mui/icons-material/FeedOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';
import FileOpenOutlinedIcon from '@mui/icons-material/FileOpenOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import InboxIcon from '@mui/icons-material/Inbox';
import RadarIcon from '@mui/icons-material/Radar';


const theme = createTheme({
  palette: {
    primary: { main: deepOrange[500] },
    secondary: { main: green[500] },
  },
});

export default function SideNavbar({ window }) {
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const baseUrl = "/api/usersOn";
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Usage card state
  const [usageData, setUsageData] = useState(null);

  // Main menu states
  const [linkInBioOpen, setLinkInBioOpen] = useState(false);
  const [instagramOpen, setInstagramOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(true);

  const [accountsOpen, setAccountsOpen] = useState(true);

  // Sub-menu states
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Routes for Analytics (nested under Link In Bio)
  const analyticsRoutes = [
    "/professional/my/page/analytics",
    "/professional/my/store/analytics",
    "/professional/my/block/analytics",
  ];

    // Routes for Analytics (nested under Link In Bio)
  const automationRoutes = [
    "/professional/automations",
    "/professional/autodm/automation",
    "/professional/automation/future/posts",
    "/professional/dashboard/instagram",
  ];

  // Routes for Mentions (nested under Instagram)
  const mentionsRoutes = [
    "/professional/instagram/mentions/comments",
    "/professional/instagram/mentions/messages",
  ];

  // Routes for Link In Bio section (Profile/Support REMOVED)
  const linkInBioRoutes = [
    "/professional/dashboard/analytics",
    "/professional/user/bio",
    "/professional/booking/sessions",
    "/professional/store/products",
    ...analyticsRoutes,
    "/professional/newsletter/emails",
    "/professional/my_orders",
  ];

  // Routes for Instagram section
  const instagramRoutes = [
    "/professional/fb_insta_redirect",
    // "/professional/automations",
    "/professional/instagram/mentions",
    ...automationRoutes,
    "/professional/instagram/create-post",
  ];

  // Routes for Accounts section (NEW)
  const accountsRoutes = ["/professional/profile", "/professional/support"];

  const insightsRoutes = ["/professional/leads/dashboard", "/professional/business/inbox"];


  const isAnalyticsRoute = analyticsRoutes.includes(location.pathname);
  const isLinkInBioSection = linkInBioRoutes.includes(location.pathname);
  const isInstagramSection = instagramRoutes.includes(location.pathname);
  const isAccountsSection = accountsRoutes.includes(location.pathname);
  const isInsightsSection = insightsRoutes.includes(location.pathname);

  // Auto-open Link in Bio when navigating to its routes, close otherwise
  useEffect(() => {
    if (isLinkInBioSection) {
      setLinkInBioOpen(true);
    } else {
      setLinkInBioOpen(false);
    }
  }, [isLinkInBioSection]);

  const goTo = (path) => {
    navigate(path);
    if (isSmallScreen) handleDrawerToggle();
  };


   const handleSessionExpired = () => {
      toast.error("Session expired. Please log in again.");
      setTimeout(() => {
        navigate("/professional/login");
      }, 2000);
    };

    useEffect(() => {
      // Skip auth check if magic link token is present — MagicLinkHandler will handle it
      const params = new URLSearchParams(location.search);
      if (params.get("token")) {
        setLoading(false);
        return;
      }

      const verifyToken = async () => {
        setLoading(true);

        try {
          const res = await axios.get(`${baseUrl}/verify-login-token`, { withCredentials: true });

          if (!res.data.valid) {
            handleSessionExpired();
          }
        } catch (error) {
          if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            handleSessionExpired();
          } else {
            toast.error("Network error, please try again later.");
            handleSessionExpired();
          }
        } finally {
          setLoading(false);
        }
      };

      verifyToken();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);


  // Fetch leads & DMs usage for the bottom card
  const fetchUsageData = useCallback(async () => {
    try {
      const [leadsRes, dmsRes] = await Promise.all([
        axios.get(`${baseUrl}/inbox/leads-limit-status`, { withCredentials: true }),
        axios.get(`${baseUrl}/dms-usage/current`, { withCredentials: true }),
      ]);

      if (leadsRes.data?.success && dmsRes.data?.success) {
        const plan = leadsRes.data.plan || "free";
        if (plan !== "creator") {
          setUsageData({
            plan,
            leadsFound: leadsRes.data.leadsFound || 0,
            leadsLimit: leadsRes.data.leadsLimit || 5,
            dmsSent: dmsRes.data.data?.total_dms_sent || 0,
            dmsLimit: dmsRes.data.data?.dms_plan_limit || 1000,
          });
        } else {
          setUsageData(null);
        }
      }
    } catch {
      // silently fail — card just won't show
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchUsageData();
  }, [fetchUsageData]);

  const handleDrawerToggle = () => {
    setMobileOpen((prev) => !prev);
  };

  const drawerWidth = 260;

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#FAFBFC",
        pt: 0, // AppBar now handled by outer container padding on mobile
      }}
    >
      {/* Top section (logo + nav links) */}
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: "auto", 
        overflowX: "hidden",
        '&::-webkit-scrollbar': { width: '6px' },
        '&::-webkit-scrollbar-track': { backgroundColor: '#F3F4F6', borderRadius: '10px' },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: '#CBD5E1',
          borderRadius: '10px',
          '&:hover': { backgroundColor: '#94A3B8' },
        },
        scrollbarWidth: 'none',
        scrollbarColor: '#CBD5E1 #F3F4F6',
      }}>

           <Toolbar sx={{ justifyContent: "space-between", px: 2.5, py: 0 }}>

      {!isSmallScreen && (

          <Link
            to="/professional/dashboard/analytics"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <img src={logo} alt="MyHandle Logo" width="140" height="60" style={{ display: "block" }} />
         
          </Link>

        )}
        </Toolbar>

        <List sx={{ px: 2, pt: 1 }}>


    {/* ===== INSTAGRAM MAIN MENU ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => { setInstagramOpen((p) => !p); setLinkInBioOpen(false); }}
              sx={{
                borderRadius: "10px",
                py: 1,
                px: 1.5,
                backgroundColor: isInstagramSection ? "#FF3F7F" : "transparent",
                "&:hover": {
                  backgroundColor: isInstagramSection ? "rgba(225, 48, 108, 0.12)" : "rgba(0,0,0,0.03)",
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <InstagramIcon
                  sx={{
                    color: isInstagramSection ? "#FFFFFF" : "#6B7280",
                    fontSize: "1.3rem",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Automation"
                primaryTypographyProps={{
                  sx: {
                    color: isInstagramSection ? "#FFFFFF" : "#374151",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  },
                }}
              />
              {instagramOpen ? (
                <ExpandLessIcon sx={{ color: isInstagramSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: isInstagramSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              )}
            </ListItemButton>
          </ListItem>

          {/* Instagram Submenu */}
          <Collapse in={instagramOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>

                 <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/dashboard/instagram")}
                  selected={location.pathname === "/professional/dashboard/instagram"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/dashboard/instagram" ? "#F37199" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#F37199",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#F37199" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <InsertChartOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/dashboard/instagram" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Analytics"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/dashboard/instagram" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/dashboard/instagram" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

                  <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/autodm/automation")}
                  selected={location.pathname === "/professional/autodm/automation"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/autodm/automation" ? "#F37199" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#F37199",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#F37199" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <MarkChatReadOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/autodm/automation" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Auto DM"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/autodm/automation" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/autodm/automation" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
             
               <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/automations")}
                  selected={location.pathname === "/professional/automations"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/automations" ? "#F37199" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#F37199",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#F37199" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PolylineOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/automations" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Reels Automation"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/automations" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/automations" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>


                 <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/automation/future/posts")}
                  selected={location.pathname === "/professional/automation/future/posts"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/automation/future/posts" ? "#F37199" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#F37199",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#F37199" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <UpdateOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/automation/future/posts" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Future Automation"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/automation/future/posts" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/automation/future/posts" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

 
                {/* Contacts */}

                {/* <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/contacts/replied")}
                  selected={location.pathname === "/professional/contacts/replied"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/contacts/replied" ? "#F37199" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#F37199",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#F37199" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <ContactPageOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/contacts/replied" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Contacts"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/contacts/replied" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/contacts/replied" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem> */}

                  {/* <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/inbox/creator")}
                  selected={location.pathname === "/professional/inbox/creator"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/inbox/creator" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <InboxOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/inbox/creator" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Business Inbox"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/inbox/creator" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/inbox/creator" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem> */}

      
            </List>
          </Collapse>

            {/* ===== DIVIDER ===== */}
          <Divider sx={{ my: 2, mx: 1, borderColor: "#E5E7EB", borderWidth: 1 }} />


          {/* ===== LINK IN BIO MAIN MENU ===== */}
          {/* <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => setLinkInBioOpen((p) => !p)}
              sx={{
                borderRadius: "10px",
                py: 1,
                px: 1.5,
                backgroundColor: isLinkInBioSection ? "#0046FF" : "transparent",
                "&:hover": {
                  backgroundColor: isLinkInBioSection ? "rgba(102, 126, 234, 0.12)" : "rgba(0,0,0,0.03)",
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <LinkIcon
                  sx={{
                    color: isLinkInBioSection ? "#FFFFFF" : "#6B7280",
                    fontSize: "1.3rem",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Link In Bio"
                primaryTypographyProps={{
                  sx: {
                    color: isLinkInBioSection ? "#FFFFFF" : "#374151",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    fontFamily: "Inter"
                  },
                }}
              />
              {linkInBioOpen ? (
                <ExpandLessIcon sx={{ color: isLinkInBioSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: isLinkInBioSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              )}
            </ListItemButton>
          </ListItem>

          <Collapse in={linkInBioOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/dashboard/analytics")}
                  selected={location.pathname === "/professional/dashboard/analytics"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/dashboard/analytics" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <SpaceDashboardOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/dashboard/analytics" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Dashboard"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/dashboard/analytics" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/dashboard/analytics" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/user/bio")}
                  selected={location.pathname === "/professional/user/bio"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/user/bio" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FileOpenOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/user/bio" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Bio Page"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/user/bio" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/user/bio" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>


              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/booking/sessions")}
                  selected={location.pathname === "/professional/booking/sessions"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/booking/sessions" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PeopleAltOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/booking/sessions" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="1:1 Bookings"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/booking/sessions" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/booking/sessions" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/my/formsubmissions")}
                  selected={location.pathname === "/professional/my/formsubmissions"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/my/formsubmissions" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FeedOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/my/formsubmissions" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Form Submissions"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/my/formsubmissions" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/my/formsubmissions" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/store/products")}
                  selected={location.pathname === "/professional/store/products"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/store/products" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <StorefrontOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/store/products" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Store"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/store/products" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/store/products" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>


              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => setAnalyticsOpen((p) => !p)}
                  selected={isAnalyticsRoute}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: isAnalyticsRoute ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <BarChartOutlinedIcon
                      sx={{
                        color: isAnalyticsRoute ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Analytics"
                    primaryTypographyProps={{
                      sx: {
                        color: isAnalyticsRoute ? "#FFFFFF" : "#6B7280",
                        fontWeight: isAnalyticsRoute ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                  {analyticsOpen ? (
                    <ExpandLessIcon sx={{ color: isAnalyticsRoute ? "#FFFFFF" : "#9CA3AF", fontSize: "1rem" }} />
                  ) : (
                    <ExpandMoreIcon sx={{ color: isAnalyticsRoute ? "#FFFFFF" : "#9CA3AF", fontSize: "1rem" }} />
                  )}
                </ListItemButton>
              </ListItem>

              <Collapse in={analyticsOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                    <ListItemButton
                      onClick={() => goTo("/professional/my/page/analytics")}
                      selected={location.pathname === "/professional/my/page/analytics"}
                      sx={{
                        borderRadius: "8px",
                        py: 0.6,
                        backgroundColor: location.pathname === "/professional/my/page/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": { 
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" }
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Page Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color: location.pathname === "/professional/my/page/analytics" ? "#FFFFFF" : "#9CA3AF",
                            fontWeight: 400,
                            fontSize: "0.82rem",
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>

                  <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                    <ListItemButton
                      onClick={() => goTo("/professional/my/store/analytics")}
                      selected={location.pathname === "/professional/my/store/analytics"}
                      sx={{
                        borderRadius: "8px",
                        py: 0.6,
                        backgroundColor: location.pathname === "/professional/my/store/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": { 
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" }
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Store Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color: location.pathname === "/professional/my/store/analytics" ? "#FFFFFF" : "#9CA3AF",
                            fontWeight: 400,
                            fontSize: "0.82rem",
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>

                  <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                    <ListItemButton
                      onClick={() => goTo("/professional/my/block/analytics")}
                      selected={location.pathname === "/professional/my/block/analytics"}
                      sx={{
                        borderRadius: "8px",
                        py: 0.6,
                        backgroundColor: location.pathname === "/professional/my/block/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": { 
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" }
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Block Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color: location.pathname === "/professional/my/block/analytics" ? "#FFFFFF" : "#9CA3AF",
                            fontWeight: 400,
                            fontSize: "0.82rem",
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Collapse>

             
            </List>
          </Collapse> */}

         {/* ===== LEADS MAIN MENU ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => setInsightsOpen((p) => !p)}
              sx={{
                borderRadius: "10px",
                py: 1,
                px: 1.5,
                backgroundColor: isInsightsSection ? "#0891B2" : "transparent",
                "&:hover": {
                  backgroundColor: isInsightsSection ? "rgba(8, 145, 178, 0.12)" : "rgba(0,0,0,0.03)",
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <RadarIcon
                  sx={{
                    color: isInsightsSection ? "#FFFFFF" : "#6B7280",
                    fontSize: "1.3rem",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Lead Finder"
                primaryTypographyProps={{
                  sx: {
                    color: isInsightsSection ? "#FFFFFF" : "#374151",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  },
                }}
              />
              {insightsOpen ? (
                <ExpandLessIcon sx={{ color: isInsightsSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: isInsightsSection ? "#FFFFFF" : "#9CA3AF", fontSize: "1.2rem" }} />
              )}
            </ListItemButton>
          </ListItem>

          <Collapse in={insightsOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/leads/dashboard")}
                  selected={location.pathname === "/professional/leads/dashboard"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/leads/dashboard" ? "#CFFAFE" : "transparent",
                    "&:hover": {
                      backgroundColor: "#CFFAFE",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#0E7490" },
                    },
                    "&.Mui-selected": { backgroundColor: "#CFFAFE" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <SpaceDashboardOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/leads/dashboard" ? "#0891B2" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Dashboard"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/leads/dashboard" ? "#0E7490" : "#6B7280",
                        fontWeight: location.pathname === "/professional/leads/dashboard" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/business/inbox")}
                  selected={location.pathname === "/professional/business/inbox"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/business/inbox" ? "#CFFAFE" : "transparent",
                    "&:hover": {
                      backgroundColor: "#CFFAFE",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#0E7490" },
                    },
                    "&.Mui-selected": { backgroundColor: "#CFFAFE" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <InboxIcon
                      sx={{
                        color: location.pathname === "/professional/business/inbox" ? "#0891B2" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Business Inbox"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/business/inbox" ? "#0E7490" : "#6B7280",
                        fontWeight: location.pathname === "/professional/business/inbox" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>
      

          {/* ===== DIVIDER ===== */}
          <Divider sx={{ my: 2, mx: 1, borderColor: "#E5E7EB", borderWidth: 1 }} />

          {/* ===== ACCOUNTS MAIN MENU (NEW) ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => { setAccountsOpen((p) => !p); setLinkInBioOpen(false); }}
              sx={{
                borderRadius: "10px",
                py: 1,
                px: 1.5,
                backgroundColor: isAccountsSection ? "rgba(0, 70, 255, 0.08)" : "transparent",
                "&:hover": {
                  backgroundColor: isAccountsSection ? "rgba(0, 70, 255, 0.12)" : "rgba(0,0,0,0.03)",
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <AccountCircleOutlinedIcon
                  sx={{
                    color: isAccountsSection ? "#0046FF" : "#6B7280",
                    fontSize: "1.3rem",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Accounts"
                primaryTypographyProps={{
                  sx: {
                    color: isAccountsSection ? "#0046FF" : "#374151",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  },
                }}
              />
              {accountsOpen ? (
                <ExpandLessIcon sx={{ color: isAccountsSection ? "#0046FF" : "#9CA3AF", fontSize: "1.2rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: isAccountsSection ? "#0046FF" : "#9CA3AF", fontSize: "1.2rem" }} />
              )}
            </ListItemButton>
          </ListItem>

          {/* Accounts Submenu (Profile + Support moved here) */}
          <Collapse in={accountsOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>
              {/* Profile */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/profile")}
                  selected={location.pathname === "/professional/profile"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/profile" ? "#EDF2FF" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#EDF2FF",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#1F2937" }
                    },
                    "&.Mui-selected": { backgroundColor: "#EDF2FF" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <AccountBoxOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/profile" ? "#0046FF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Profile"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/profile" ? "#1F2937" : "#6B7280",
                        fontWeight: location.pathname === "/professional/profile" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

              {/* Support */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/support")}
                  selected={location.pathname === "/professional/support"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/support" ? "#EDF2FF" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#EDF2FF",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#1F2937" }
                    },
                    "&.Mui-selected": { backgroundColor: "#EDF2FF" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <SupportAgentOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/support" ? "#0046FF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Support"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/support" ? "#1F2937" : "#6B7280",
                        fontWeight: location.pathname === "/professional/support" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>

       
        </List>

      </Box>

      {/* ===== BOTTOM STICKY USAGE CARD (free plan only) ===== */}
      {usageData && (() => {
        const leadsPercent = Math.min((usageData.leadsFound / usageData.leadsLimit) * 100, 100);
        const dmsPercent = Math.min((usageData.dmsSent / usageData.dmsLimit) * 100, 100);
        const getUsageColor = (pct) => pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#6366f1";
        const formatNumber = (n) => n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);

        return (
          <Box
            sx={{
              flexShrink: 0,
              mx: 1.5,
              mb: 1.5,
              p: { xs: 1.5, sm: 1.75 },
              borderRadius: "12px",
              background: "linear-gradient(135deg, #f0f4ff 0%, #e8ecff 100%)",
              border: "1px solid #d4dbf5",
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.08)",
            }}
          >
            {/* Plan Badge */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.25 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "6px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                }}
              >
                <span role="img" aria-label="lightning" style={{ filter: "brightness(2)" }}>&#9889;</span>
              </Box>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: { xs: "0.75rem", sm: "0.8rem" },
                  color: "#4338ca",
                  letterSpacing: "-0.01em",
                }}
              >
                Free Plan
              </Typography>
            </Box>

            {/* Leads Usage */}
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.4 }}>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: { xs: "0.65rem", sm: "0.7rem" },
                    color: "#4b5563",
                  }}
                >
                  Leads
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: { xs: "0.6rem", sm: "0.65rem" },
                    color: getUsageColor(leadsPercent),
                  }}
                >
                  {usageData.leadsFound} / {formatNumber(usageData.leadsLimit)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={leadsPercent}
                sx={{
                  height: 5,
                  borderRadius: 5,
                  backgroundColor: "#e2e8f0",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 5,
                    backgroundColor: getUsageColor(leadsPercent),
                    transition: "width 0.6s ease",
                  },
                }}
              />
            </Box>

            {/* DMs Usage */}
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.4 }}>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: { xs: "0.65rem", sm: "0.7rem" },
                    color: "#4b5563",
                  }}
                >
                  DMs Sent
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: { xs: "0.6rem", sm: "0.65rem" },
                    color: getUsageColor(dmsPercent),
                  }}
                >
                  {formatNumber(usageData.dmsSent)} / {formatNumber(usageData.dmsLimit)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={dmsPercent}
                sx={{
                  height: 5,
                  borderRadius: 5,
                  backgroundColor: "#e2e8f0",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 5,
                    backgroundColor: getUsageColor(dmsPercent),
                    transition: "width 0.6s ease",
                  },
                }}
              />
            </Box>

            {/* Upgrade Button */}
            <Button
              fullWidth
              onClick={() => goTo("/professional/upgrade/plan")}
              sx={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: { xs: "0.7rem", sm: "0.75rem" },
                textTransform: "none",
                color: "#fff",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                borderRadius: "8px",
                py: 0.75,
                mb: 0.5,
                boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  boxShadow: "0 4px 12px rgba(99, 102, 241, 0.4)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Upgrade Now
            </Button>
            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 400,
                fontSize: { xs: "0.55rem", sm: "0.6rem" },
                color: "#6b7280",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              Get 500 leads & Unlimited DMs/month
            </Typography>
          </Box>
        );
      })()}
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      {/* Mobile AppBar with hamburger */}
    
  <AppBar
    position="fixed"
    color="inherit"
    elevation={0}
    sx={{
      display: { xs: "flex", sm: "none" },
      borderBottom: "1px solid #E5E7EB",
      bgcolor: "#FAFBFC",
      zIndex: (t) => t.zIndex.drawer + 1,
    }}
  >
    <Toolbar sx={{ px: 2 }}>
      <IconButton
        edge="start"
        aria-label="open drawer"
        onClick={handleDrawerToggle}
        sx={{ mr: 1, display: { xs: "inline-flex", sm: "none" } }}
      >
        <MenuIcon />
      </IconButton>

      {/* Brand (optional) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <img src={logo} alt="MyHandle Logo" width="110" height="50" style={{ display: "block" }} />
      </Box>
    </Toolbar>
  </AppBar>
    

      {/* NOTE: removed the extra spacer <Toolbar /> to avoid double stacking height */}

      <Box
        sx={{
          display: "flex",
          height: "100dvh",       // better on mobile than 100vh
          pt: { xs: 7, sm: 0 },      // 56px = default toolbar height on xs
          bgcolor: "#FAFBFC",
        }}
      >
        {/* Sidebar */}
        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            anchor="left"
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: "block", sm: "none" },
              "& .MuiDrawer-paper": { width: drawerWidth, boxShadow: "0 0 40px rgba(0,0,0,0.05)" },
            }}
          >
            {drawerContent}
          </Drawer>

          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", sm: "block" },
              "& .MuiDrawer-paper": { 
                width: drawerWidth, 
                borderRight: "1px solid #E5E7EB",
                boxShadow: "0 0 40px rgba(0,0,0,0.02)"
              },
            }}
            open
          >
            {drawerContent}
          </Drawer>
        </Box>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: "100%",
            maxWidth: { sm: `calc(100% - ${drawerWidth}px)` },
            overflow: 'auto',
            backgroundColor: "#FAFBFC",
          }}
        >
         <Suspense fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
              <LinearProgress sx={{ width: '40%' }} />
            </Box>
          }>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

SideNavbar.propTypes = {
  window: PropTypes.func,
};
