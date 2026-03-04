// WaitlistSuccessCard.js
import React, { useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/CheckCircleOutline";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { toast } from "react-toastify";


export default function WaitlistSuccessCard({ onClose = () => {} }) {
  // plan stores a numeric value (19 / 29 / 49) or "" initially
  const [plan, setPlan] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false); // <- new: track if feedback was sent
  const baseUrl = "/api/usersOn";


  const handleChange = (e) => setPlan(e.target.value);

  const handleSubmit = async () => {
    if (!plan) {
      alert("Please pick a pricing plan before submitting.");
      return;
    }

    // Send only the number to backend as `price`
    const payload = { price: Number(plan) };

    try {
      setIsLoading(true);
      // Adjust base URL if needed, or use relative path if same origin
       const response = await axios.post(baseUrl + "/ask-price", {
              price: Number(plan)
            });

      setIsLoading(false);

      if(response.data.success){

            toast.success('Thank you for your time!')
      setSubmitted(true);

      }

      else{

        toast.error('Something is wrong. Please try again.')
      setSubmitted(false);


      }
      // Thank user and remove the pricing block from view
  
    } catch (err) {
      setIsLoading(false);
      console.error("Submit price error:", err);
      const serverMessage = err?.response?.data?.message || "Something went wrong. Please try again.";
        toast.error('Something is wrong. Please try again.')

    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        background: "linear-gradient(90deg, #FFFFFF 0%, #38ef7d 40%, #38ef7d 70%, #FFFFFF 100%)",
      }}
    >
      <Card
        sx={{
          width: { xs: "92%", sm: 780 },
          borderRadius: 10,
          boxShadow: "0 20px 40px rgba(10, 20, 30, 0.12), 0 6px 18px rgba(10, 20, 30, 0.06)",
          position: "relative",
          overflow: "visible",
        }}
      >
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            zIndex: 5,
            bgcolor: "rgba(0,0,0,0.03)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.06)" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <CardContent
          sx={{
            position: "relative",
            zIndex: 10,
            textAlign: "center",
            pt: 2,
            pb: 6,
            px: { xs: 4, sm: 8 },
            background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 100%)",
            borderRadius: 10,
          }}
        >
          <Box
            sx={{
              width: 66,
              height: 66,
              margin: "0 auto",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
              bgcolor: "rgba(229,255,238,1)",
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: "#00b23b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              <CheckIcon sx={{ fontSize: 28 }} />
            </Box>
          </Box>

          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, letterSpacing: "-0.02em", mb: 1 }}>
            You have been added to our{" "}
            <Box component="span" sx={{ color: "#18a64b" }}>
              waitlist!
            </Box>
          </Typography>

          <Typography sx={{ color: "grey", maxWidth: 560, mx: "auto", mb: 3, fontFamily: "Inter", fontSize: 14 }}>
            Thank you for joining, you'll be the first to know when we are ready!
          </Typography>

          {/* Conditionally render the pricing feedback block only if not submitted */}
          {!submitted && (
            <>
              <Typography sx={{ maxWidth: 560, mx: "auto", mt: 3, fontFamily: "Inter", fontWeight: 400, fontSize: 15 }}>
                Before you go, help us shape our pricing 🙌
                <br />
                Which plan feels right to you?
              </Typography>

              <Box
                sx={{
                  maxWidth: 520,
                  mx: "auto",
                  mt: 2,
                  display: "flex",
                  gap: 2,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                <FormControl fullWidth sx={{ maxWidth: 220 }}>
                  <Select
                    id="pricing-plan-select"
                    value={plan}
                    onChange={handleChange}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem disabled value="">
                      <em>Select a pricing plan</em>
                    </MenuItem>
                    <MenuItem value={19}>$19/month ( unlimited campaigns )</MenuItem>
                    <MenuItem value={29}>$29/month ( unlimited campaigns )</MenuItem>
                    <MenuItem value={49}>$49/month ( unlimited campaigns )</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  sx={{
                    px: 4,
                    py: 1.8,
                    borderRadius: 2,
                    textTransform: "none",
                    boxShadow: "0 8px 18px rgba(12,80,34,0.12)",
                    background: "#AE75DA",
                    color: "#000000",
                    "&:disabled": { opacity: 0.6 },
                  }}
                >
                  {isLoading ? "Submitting..." : "Submit"}
                </Button>
              </Box>
            </>
          )}

          {/* Optionally you can show a small confirmation text when submitted (keeps UI friendly) */}
          {submitted && (
            <Typography sx={{ mt: 3, color: "text.secondary", fontSize: 14 }}>
              Thanks for your feedback — it helps a lot! 🎉
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
