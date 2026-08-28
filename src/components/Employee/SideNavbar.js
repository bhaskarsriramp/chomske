import React, { useState, useEffect } from "react";
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
  CircularProgress,
  Divider,
  Collapse,
  IconButton,
  Typography,
  Button
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import { deepOrange, green } from "@mui/material/colors";
import MenuIcon from "@mui/icons-material/Menu";
import logo from "../../images/myhandle_logo.svg";
import axios from "axios";
import { toast } from "react-toastify";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import AccountBoxOutlinedIcon from "@mui/icons-material/AccountBoxOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import ContactPageOutlinedIcon from "@mui/icons-material/ContactPageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import InstagramIcon from "@mui/icons-material/Instagram";
import PolylineOutlinedIcon from "@mui/icons-material/PolylineOutlined";
import "react-toastify/dist/ReactToastify.css";
import UpiMandateModern from "./UpiMandate";
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { logout } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import FeedOutlinedIcon from '@mui/icons-material/FeedOutlined';
import PermContactCalendarOutlinedIcon from '@mui/icons-material/PermContactCalendarOutlined';




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
  const [hasAccess, setHasAccess] = useState(false);
  const baseUrl = "/api/usersOn";
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialDays, setTrialDays] = useState(0);


  // Main menu states
  const [linkInBioOpen, setLinkInBioOpen] = useState(true);
  const [instagramOpen, setInstagramOpen] = useState(true);
  const [accountsOpen, setAccountsOpen] = useState(true);

  // Sub-menu states
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Routes for Analytics (nested under Link In Bio)
  const analyticsRoutes = [
    "/professional/my/page/analytics",
    "/professional/my/store/analytics",
    "/professional/my/block/analytics",
  ];

  // Routes for Link In Bio section (Profile / Support removed)
  const linkInBioRoutes = [
    "/professional/dashboard/analytics",
    "/professional/user/bio",
    "/professional/my/inbox",
    "/professional/store/products",
    ...analyticsRoutes,
    "/professional/newsletter/emails",
    "/professional/my_orders",
  ];

  // Routes for Instagram section
  const instagramRoutes = [
    "/professional/automations",
    "/professional/contacts/replied",
    "/professional/instagram/mentions",
    "/professional/instagram/mentions/comments",
    "/professional/instagram/mentions/messages",
    "/professional/instagram/create-post",
  ];

  // Routes for Accounts section (NEW)
  const accountsRoutes = ["/professional/profile", "/professional/support"];

  const isAnalyticsRoute = analyticsRoutes.includes(location.pathname);
  const isLinkInBioSection = linkInBioRoutes.includes(location.pathname);
  const isInstagramSection = instagramRoutes.includes(location.pathname);
  const isAccountsSection = accountsRoutes.includes(location.pathname);

  const goTo = (path) => {
    navigate(path);
    if (isSmallScreen) handleDrawerToggle();
  };

  const handleSessionExpired = () => {
    toast.error("Session expired. Please log in again.");
    setTimeout(() => {
      axios.post(baseUrl + "/logout", {}, { withCredentials: true });
        dispatch(logout()); // Clear Redux state
        window.location.href = "/professional/login"; // Ensures full logout
    }, 1500);
  };





  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

   useEffect(() => {
      const verifyToken = async () => {
        setLoading(true);
  
        try {
          const res = await axios.get(`${baseUrl}/verify-login-token`, { withCredentials: true });
  
          if (res.data.valid) {
            fetchPaymentDetails(); // also load IG info once token is valid
          } else {
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


      const fetchPaymentDetails = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${baseUrl}/fetch-payment-details`, {
          withCredentials: true,
        });
       setHasAccess(response.data.hasAccess);
    
    // Set new states
    setIsTrialActive(response.data.free_trial_active);
    setTrialDays(response.data.free_trial_ends_in);
      } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          handleSessionExpired();
        } else {
          console.log('error : ', error);
          handleSessionExpired();
        }
      } finally {
        setLoading(false);
      }
    };


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
        pt: 0,
      }}
    >
      {/* Top section (logo + nav links) */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: "6px" },
          "&::-webkit-scrollbar-track": { backgroundColor: "#F3F4F6", borderRadius: "10px" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#CBD5E1",
            borderRadius: "10px",
            "&:hover": { backgroundColor: "#94A3B8" },
          },
          scrollbarWidth: "none",
          scrollbarColor: "#CBD5E1 #F3F4F6",
        }}
      >
    
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
            <img src={logo} alt="Chomske Logo" width="140" height="60" style={{ display: "block" }} />
         
          </Link>

        )}
        </Toolbar>
       

        <List sx={{ px: 2, pt: 1 }}>
          {/* ===== LINK IN BIO MAIN MENU ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
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
                    fontFamily: "Inter",
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

          {/* Link In Bio Submenu (Profile & Support REMOVED) */}
          <Collapse in={linkInBioOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>
              {/* Dashboard */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/dashboard/analytics")}
                  selected={location.pathname === "/professional/dashboard/analytics"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor:
                      location.pathname === "/professional/dashboard/analytics" ? "#6E8CFB" : "transparent",
                    "&:hover": {
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
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

              {/* Bio Page */}
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
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <ContactPageOutlinedIcon
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

                {/* 1:1 Sessions */}
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
                    <GroupsOutlinedIcon
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

                {/* Form Submissions */}
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


              {/* Store */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/store/products")}
                  selected={location.pathname === "/professional/store/products"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor:
                      location.pathname === "/professional/store/products" ? "#6E8CFB" : "transparent",
                    "&:hover": {
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
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

              {/* My Orders */}
              {/* <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/my_orders")}
                  selected={location.pathname === "/professional/my_orders"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/my_orders" ? "#6E8CFB" : "transparent",
                    "&:hover": {
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CurrencyRupeeOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/my_orders" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="My Orders"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/my_orders" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/my_orders" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem> */}

              {/* Analytics (nested) */}
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
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
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

              {/* Analytics submenu */}
              <Collapse in={analyticsOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                    <ListItemButton
                      onClick={() => goTo("/professional/my/page/analytics")}
                      selected={location.pathname === "/professional/my/page/analytics"}
                      sx={{
                        borderRadius: "8px",
                        py: 0.6,
                        backgroundColor:
                          location.pathname === "/professional/my/page/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": {
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" },
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Page Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color:
                              location.pathname === "/professional/my/page/analytics" ? "#FFFFFF" : "#9CA3AF",
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
                        backgroundColor:
                          location.pathname === "/professional/my/store/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": {
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" },
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Store Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color:
                              location.pathname === "/professional/my/store/analytics" ? "#FFFFFF" : "#9CA3AF",
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
                        backgroundColor:
                          location.pathname === "/professional/my/block/analytics" ? "#6E8CFB" : "transparent",
                        "&:hover": {
                          backgroundColor: "#6E8CFB",
                          "& .MuiListItemText-primary": { color: "#FFFFFF" },
                        },
                        "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ListItemText
                        primary="Block Analytics"
                        primaryTypographyProps={{
                          sx: {
                            color:
                              location.pathname === "/professional/my/block/analytics" ? "#FFFFFF" : "#9CA3AF",
                            fontWeight: 400,
                            fontSize: "0.82rem",
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Collapse>

              {/* Newsletter List */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/newsletter/emails")}
                  selected={location.pathname === "/professional/newsletter/emails"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor:
                      location.pathname === "/professional/newsletter/emails" ? "#6E8CFB" : "transparent",
                    "&:hover": {
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" },
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <MailOutlineOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/newsletter/emails" ? "#FFFFFF" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Newsletter List"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/newsletter/emails" ? "#FFFFFF" : "#6B7280",
                        fontWeight: location.pathname === "/professional/newsletter/emails" ? 500 : 400,
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

          {/* ===== INSTAGRAM MAIN MENU ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => setInstagramOpen((p) => !p)}
              sx={{
                borderRadius: "10px",
                py: 1,
                px: 1.5,
                backgroundColor: isInstagramSection ? "rgba(225, 48, 108, 0.08)" : "transparent",
                "&:hover": {
                  backgroundColor: isInstagramSection ? "rgba(225, 48, 108, 0.12)" : "rgba(0,0,0,0.03)",
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <InstagramIcon
                  sx={{
                    color: isInstagramSection ? "#E1306C" : "#6B7280",
                    fontSize: "1.3rem",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Instagram"
                primaryTypographyProps={{
                  sx: {
                    color: isInstagramSection ? "#E1306C" : "#374151",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  },
                }}
              />
              {instagramOpen ? (
                <ExpandLessIcon sx={{ color: isInstagramSection ? "#E1306C" : "#9CA3AF", fontSize: "1.2rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: isInstagramSection ? "#E1306C" : "#9CA3AF", fontSize: "1.2rem" }} />
              )}
            </ListItemButton>
          </ListItem>

          {/* Instagram Submenu */}
          <Collapse in={instagramOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 0.5, pr: 0 }}>
              {/* Automation */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/automations")}
                  selected={location.pathname === "/professional/automations"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/automations" ? "#F3F4F6" : "transparent",
                    "&:hover": { backgroundColor: "#F3F4F6" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PolylineOutlinedIcon
                      sx={{
                        color: location.pathname === "/professional/automations" ? "#E1306C" : "#9CA3AF",
                        fontSize: "1.2rem",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary="Automation"
                    primaryTypographyProps={{
                      sx: {
                        color: location.pathname === "/professional/automations" ? "#1F2937" : "#6B7280",
                        fontWeight: location.pathname === "/professional/automations" ? 500 : 400,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>

               {/* Contacts */}

                <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => goTo("/professional/contacts/replied")}
                  selected={location.pathname === "/professional/contacts/replied"}
                  sx={{
                    pl: 2,
                    borderRadius: "8px",
                    py: 0.75,
                    backgroundColor: location.pathname === "/professional/contacts/replied" ? "#6E8CFB" : "transparent",
                    "&:hover": { 
                      backgroundColor: "#6E8CFB",
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#FFFFFF" }
                    },
                    "&.Mui-selected": { backgroundColor: "#6E8CFB" },
                    transition: "all 0.2s ease",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PermContactCalendarOutlinedIcon
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
              </ListItem>
            </List>
          </Collapse>

          {/* ===== DIVIDER ===== */}
          <Divider sx={{ my: 2, mx: 1, borderColor: "#E5E7EB", borderWidth: 1 }} />

          {/* ===== ACCOUNTS MAIN MENU (NEW) ===== */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => setAccountsOpen((p) => !p)}
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
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#1F2937" },
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
                      "& .MuiListItemIcon-root, & .MuiListItemText-primary": { color: "#1F2937" },
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

      {isTrialActive && (
         <Box sx={{ p: 2, borderTop: "1px solid #E5E7EB" }}>
        <Box
          sx={{
            borderRadius: "16px",
            // Subtle gradient to make it stand out
            background: "linear-gradient(135deg, #FFF0F0 0%, #FFFAFA 100%)", 
            border: "1px solid #FECACA",
            p: 2,
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: "#6B7280", 
              fontWeight: 600, 
              display: "block",
              mb: 0.5,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
          >
            Free Trial Ends in
          </Typography>
          
          <Typography 
            variant="h5" 
            sx={{ 
              color: "#DC2626", // Red shade
              fontWeight: 800, 
              mb: 1.5,
              fontSize: isSmallScreen ? "1rem" : "1.25rem",
              fontFamily : 'Inter'

            }}
          >
          {String(trialDays).padStart(2, '0')} days
          </Typography>
          
          <Button
            variant="contained"
            fullWidth
            onClick={() => goTo("/professional/upgrade/plan")} // Add your upgrade route here
            sx={{
              fontFamily : 'Inter',
              bgcolor: "#DC2626",
              textTransform: "none",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: isSmallScreen ? "0.75rem" : "0.9rem",
              boxShadow: "0 4px 6px rgba(220, 38, 38, 0.2)",
              '&:hover': { 
                bgcolor: "#B91C1C",
                boxShadow: "0 6px 10px rgba(220, 38, 38, 0.3)",
              }
            }}
          >
            Upgrade Now
          </Button>
        </Box>
      </Box>
)}
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
            <img src={logo} alt="Chomske Logo" width="140" height="60" style={{ display: "block" }} />
           
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: "flex",
          minHeight: "100dvh",
          pt: { xs: 7, sm: 0 },
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
                boxShadow: "0 0 40px rgba(0,0,0,0.02)",
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
            overflow: "auto",
            backgroundColor: "#FAFBFC",
            py: 1,
          }}
        >
          {loading ? (
            <Box sx={{ py: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CircularProgress sx={{ color: "#667eea" }} />
            </Box>
          ) : (
            <Box sx={{ px: 2, py: 0 }}>{hasAccess ? <Outlet /> : <UpiMandateModern />}</Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

SideNavbar.propTypes = {
  window: PropTypes.func,
};
