import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Chip, Paper, Stack, Slider, Button, Avatar, Grid, SvgIcon } from "@mui/material";
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BoltIcon from '@mui/icons-material/Bolt';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CancelIcon from '@mui/icons-material/Cancel';
import MetaLogo from '../images/meta.png'
import Footer from './Footer';
import Navbar from './Navbar';
import { Helmet } from "react-helmet";



// --- ANIMATION KEYFRAMES ---
const styles = {
    // A laser scanner moving up and down
    scan: {
        '@keyframes scan': {
            '0%': { top: '0%', opacity: 0 },
            '10%': { opacity: 1 },
            '90%': { opacity: 1 },
            '100%': { top: '100%', opacity: 0 },
        },
        animation: 'scan 2.5s ease-in-out infinite',
    },
    // Pulsing circles for WhatsApp
    pulse: {
        '@keyframes pulse': {
            '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)' },
            '70%': { boxShadow: '0 0 0 20px rgba(34, 197, 94, 0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
        },
        animation: 'pulse 2s infinite',
    },
    // Animation for the reply appearing
    replyAppear: {
        '@keyframes appearSequence': {
            '0%, 25%': { opacity: 0, transform: 'translateY(10px) scale(0.95)' }, // Wait phase
            '35%, 85%': { opacity: 1, transform: 'translateY(0px) scale(1)' },   // Show phase
            '100%': { opacity: 0, transform: 'translateY(10px) scale(0.95)' }    // Reset phase
        },
        animation: 'appearSequence 4s ease-in-out infinite',
    },
    // Rotating shield for Safety Section
    shieldPulse: {
        '@keyframes shield': {
            '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)' },
            '70%': { boxShadow: '0 0 0 15px rgba(34, 197, 94, 0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
        },
        animation: 'shield 3s infinite',
    },
};

// --- VISUAL COMPONENT 1: The "Comment Reply" Simulation ---
const CommentReplySimulation = () => (
    <Box sx={{ position: 'relative', width: '320px', height: '200px', mx: 'auto', fontFamily: "'Inter', sans-serif" }}>
        <Paper sx={{ 
            width: '100%', height: '100%', bgcolor: '#0F172A', borderRadius: '24px', border: '1px solid #334155',
            overflow: 'hidden', position: 'relative', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)', p: 3,
            display: 'flex', flexDirection: 'column', justifyContent: 'center'
        }}>
            {/* The User's Comment */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, opacity: 0.7 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: '#475569', fontFamily: 'inherit' }}>U</Avatar>
                <Box>
                    <Box sx={{ bgcolor: '#1E293B', p: 1.5, borderRadius: '12px 12px 12px 0', mb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#FFF', fontFamily: 'inherit' }}>
                            Need the link for this program! 🔥
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#94A3B8', fontFamily: 'inherit' }}>Reply • Like</Typography>
                </Box>
                <FavoriteBorderIcon sx={{ fontSize: 16, color: '#94A3B8', mt: 2 }} />
            </Box>

            {/* The Bot's Auto-Reply (Animated) */}
            <Box sx={{ ml: 6, display: 'flex', gap: 2, ...styles.replyAppear }}>
                                <Avatar sx={{ width: 36, height: 36, bgcolor: '#475569', fontFamily: 'inherit' }}>R</Avatar>

                <Box>
                    <Box sx={{ 
                        bgcolor: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3B82F6', 
                        p: 1.5, borderRadius: '12px 12px 12px 0', mb: 0.5 
                    }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#FFF', fontWeight: 600, fontFamily: 'inherit' }}>
                            Sent! Please check your DM. 🚀
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#3B82F6', fontFamily: 'inherit' }}>Just now</Typography>
                </Box>
            </Box>

            {/* Connecting Visual Line */}
            <Box sx={{ 
                position: 'absolute', left: '48px', top: '60px', width: '2px', height: '40px',
                background: 'linear-gradient(180deg, #334155 0%, #3B82F6 100%)', zIndex: 0,
                ...styles.replyAppear // Animate the line too
            }} />
        </Paper>
    </Box>
);

// --- VISUAL COMPONENT 2: The "Trash vs Treasure" Filter ---
const InboxScanner = () => (
    <Box sx={{ position: 'relative', width: '320px', height: '400px', mx: 'auto', fontFamily: "'Inter', sans-serif" }}>
        {/* The Frame */}
        <Paper sx={{ 
            width: '100%', height: '100%', bgcolor: '#0F172A', borderRadius: '32px', border: '1px solid #334155',
            overflow: 'hidden', position: 'relative', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)' 
        }}>
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid #1E293B', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#EF4444' }} />
                <Typography sx={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>INBOX INTELLIGENCE</Typography>
            </Box>

            {/* The Messages List */}
            <Stack spacing={2} sx={{ p: 3 }}>
                
                {/* Message 1: TRASH (Faded) */}
                <Box sx={{ display: 'flex', gap: 2, opacity: 0.3, filter: 'grayscale(100%)' }}>
                    <Avatar sx={{ width: 40, height: 40, fontFamily: 'inherit' }}>A</Avatar>
                    <Box sx={{ flex: 1, bgcolor: '#1E293B', p: 1.5, borderRadius: '12px' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: '#FFF', fontFamily: 'inherit' }}>🔥 Fire post bro!</Typography>
                    </Box>
                    <DeleteOutlineIcon sx={{ color: '#EF4444' }} />
                </Box>

                {/* Message 2: TRASH (Faded) */}
                <Box sx={{ display: 'flex', gap: 2, opacity: 0.3, filter: 'grayscale(100%)' }}>
                    <Avatar sx={{ width: 40, height: 40, fontFamily: 'inherit' }}>B</Avatar>
                    <Box sx={{ flex: 1, bgcolor: '#1E293B', p: 1.5, borderRadius: '12px' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: '#FFF', fontFamily: 'inherit' }}>Check DM pls</Typography>
                    </Box>
                    <DeleteOutlineIcon sx={{ color: '#EF4444' }} />
                </Box>

                {/* Message 3: THE LEAD (Highlighted) */}
                <Box sx={{ 
                    display: 'flex', gap: 2, position: 'relative', 
                    transform: 'scale(1.05)', transition: '0.3s' 
                }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: '#22C55E', fontFamily: 'inherit' }}>S</Avatar>
                    <Box sx={{ flex: 1, bgcolor: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22C55E', p: 1.5, borderRadius: '12px' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#FFF', fontWeight: 700, fontFamily: 'inherit' }}>I want to join your fatloss program, pls share pricing.</Typography>
                        <Chip label="HIGH INTENT" size="small" sx={{ height: 20, fontSize: '0.6rem', bgcolor: '#22C55E', color: '#000', fontWeight: 800, mt: 1, fontFamily: 'inherit' }} />
                    </Box>
                    
                    {/* The Scanner Effect Overlay */}
                    <Box sx={{
                        position: 'absolute', left: -10, right: -10, height: '2px', bgcolor: '#22C55E',
                        boxShadow: '0 0 20px #22C55E', zIndex: 10, ...styles.scan
                    }} />
                </Box>
            </Stack>
        </Paper>
    </Box>
);

// --- VISUAL COMPONENT 3: The WhatsApp Receiver ---
const WhatsAppNotification = () => (
    <Box sx={{ position: 'relative', ...styles.pulse, fontFamily: "'Inter', sans-serif" }}>
        <Paper sx={{
            p: 3, borderRadius: '24px', bgcolor: '#22C55E', color: '#000',
            display: 'flex', alignItems: 'center', gap: 2, maxWidth: '350px'
        }}>
            <Box sx={{ bgcolor: '#FFF', p: 1, borderRadius: '50%' }}>
                <WhatsAppIcon sx={{ fontSize: 30, color: '#22C55E' }} />
            </Box>
            <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'inherit' }}>New Lead Found!</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit' }}>@Saini just asked for fatloss pricing.</Typography>
            </Box>
        </Paper>
        {/* Tail */}
        <Box sx={{ 
            position: 'absolute', bottom: -10, left: 30, width: 20, height: 20, 
            bgcolor: '#22C55E', transform: 'rotate(45deg)' 
        }} />
    </Box>
);

// --- VISUAL COMPONENT 4: Bot vs Human Comparison (SAFETY) ---
const BotVsHuman = () => {
    const [humanMsg, setHumanMsg] = useState(0);
    const messages = [
        "Hey! Sent the link to your DMs! 🚀",
        "Check your inbox, I just dropped it there!",
        "Done! Check your requests folder.",
        "Sent! Please Let me know if you got it."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setHumanMsg((prev) => (prev + 1) % messages.length);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <Grid container spacing={4} sx={{fontFamily: "'Inter', sans-serif"}}>
            {/* THE BAD WAY (Bot) */}
            <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 3, borderRadius: '24px', bgcolor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                        <CancelIcon sx={{ color: '#EF4444' }} />
                        <Typography sx={{ color: '#EF4444', fontWeight: 800, fontSize: '0.9rem', fontFamily: 'inherit' }}>THE "BOT" WAY</Typography>
                    </Stack>
                    <Stack spacing={1} sx={{ opacity: 0.7 }}>
                        {[1, 2, 3].map((i) => (
                            <Box key={i} sx={{ bgcolor: '#000', p: 1.5, borderRadius: '12px' }}>
                                <Typography sx={{ color: '#FFF', fontSize: '0.8rem', fontFamily: 'monospace' }}>Check DM</Typography>
                            </Box>
                        ))}
                    </Stack>
                    <Typography sx={{ color: '#EF4444', fontSize: '0.75rem', mt: 2, fontWeight: 700, fontFamily: 'inherit' }}>
                        ⚠️ RESULT: INSTAGRAM ACTION BLOCK
                    </Typography>
                </Paper>
            </Grid>

            {/* THE MYHANDLE WAY (Human) */}
            <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 3, borderRadius: '24px', bgcolor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                        <CheckCircleIcon sx={{ color: '#22C55E' }} />
                        <Typography sx={{ color: '#22C55E', fontWeight: 800, fontSize: '0.9rem', fontFamily: 'inherit' }}>THE HUMAN WAY</Typography>
                    </Stack>
                    
                    <Box sx={{ position: 'relative', height: '110px' }}>
                        <Box sx={{ 
                            bgcolor: '#0F172A', p: 2, borderRadius: '16px 16px 16px 0', 
                            border: '1px solid #22C55E', transition: 'all 0.3s ease'
                        }}>
                            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                                <Avatar sx={{ width: 24, height: 24, bgcolor: '#22C55E', fontFamily: 'inherit' }}>M</Avatar>
                                <Typography sx={{ color: '#94A3B8', fontSize: '0.7rem', fontFamily: 'inherit' }}>Replying...</Typography>
                            </Stack>
                            <Typography sx={{ color: '#FFF', fontSize: '0.9rem', fontWeight: 500, fontFamily: 'inherit' }}>
                                {messages[humanMsg]}
                            </Typography>
                        </Box>
                        
                        <Stack direction="row" spacing={1} mt={2}>
                             <Chip icon={<ShuffleIcon sx={{ fontSize: '14px !important' }} />} label="Smart Variation" size="small" sx={{ bgcolor: '#22C55E', color: '#000', fontWeight: 700, fontSize: '0.65rem', fontFamily: 'inherit' }} />
                             <Chip icon={<AccessTimeIcon sx={{ fontSize: '14px !important' }} />} label="Random Delay" size="small" sx={{ bgcolor: 'rgba(34, 197, 94, 0.2)', color: '#22C55E', fontWeight: 700, fontSize: '0.65rem', fontFamily: 'inherit' }} />
                        </Stack>
                    </Box>
                </Paper>
            </Grid>
        </Grid>
    );
};

// --- COMPONENT: Earnings Calculator ---
const EarningsCalculator = () => {
    const [leads, setLeads] = useState(10);
    const price = 15000; // Avg ticket size
    
    return (
        <Paper sx={{ 
            p: 5, borderRadius: '32px', 
            background: 'linear-gradient(145deg, #1e1b4b 0%, #0F172A 100%)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            fontFamily: "'Inter', sans-serif"
        }}>
            <Grid container spacing={4} alignItems="center">
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography sx={{ color: '#A78BFA', fontWeight: 700, mb: 1, textTransform: 'uppercase', letterSpacing: 1, fontSize: { xs: '0.8rem', md: '0.9rem' }, fontFamily: 'inherit' }}>
                        Lost Revenue Calculator
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 800, mb: 3, fontSize: { xs: '1.5rem', md: '2.125rem' }, fontFamily: 'inherit' }}>
                        How many leads do you <br/> miss per month?
                    </Typography>
                    
                    <Box sx={{ mb: 2 }}>
                        <Typography sx={{ color: '#FFF', mb: 1, fontSize: { xs: '0.9rem', md: '1rem' }, fontFamily: 'inherit' }}>Missed Leads: <span style={{ color: '#A78BFA', fontWeight: 800 }}>{leads}/month</span></Typography>
                        <Slider 
                            value={leads} 
                            onChange={(e, v) => setLeads(v)} 
                            min={5} max={100} 
                            sx={{ color: '#A78BFA' }} 
                        />
                    </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ 
                        p: 4, borderRadius: '24px', bgcolor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        textAlign: 'center'
                    }}>
                        <Typography sx={{ color: '#94A3B8', mb: 1, fontSize: { xs: '0.875rem', md: '1rem' }, fontFamily: 'inherit' }}>Potential Extra Revenue</Typography>
                        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                            <CurrencyRupeeIcon sx={{ color: '#22C55E', fontSize: { xs: 30, md: 40 } }} />
                            <Typography sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' }, fontWeight: 900, color: '#FFF', lineHeight: 1, fontFamily: 'inherit' }}>
                                {(leads * price).toLocaleString('en-IN')}
                            </Typography>
                        </Stack>
                        <Typography sx={{ color: '#22C55E', fontSize: { xs: '0.65rem', md: '0.7rem' }, mt: 1, fontFamily: 'inherit' }}>
                            *Based on avg ₹15k ticket size
                        </Typography>
                    </Box>
                </Grid>
            </Grid>
        </Paper>
    );
};

export default function LeadFinderFeature() {

    const navigate = useNavigate();
    
  return (
    <>

      <Helmet>
        <title>Lead Finder | Powerful Feature</title>
        <meta name="description" content="Get Instagram Leads on your WhatsApp." />
      </Helmet>


    <Navbar />
    <Box sx={{ bgcolor: '#EAEFEF', minHeight: '100vh', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>
        
        {/* --- SECTION 1: THE PROBLEM (Brief) --- */}
        <Container maxWidth="lg" sx={{ py: { xs: 10, md: 14 }, textAlign: 'center' }}>
            <Chip label="THE REALITY CHECK" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', fontWeight: 800, mb: 3, fontFamily: 'inherit' }} />
            <Typography variant="h2" sx={{ fontWeight: 900, color: '#D02752', fontSize: { xs: '2.2rem', md: '4rem' }, mb: 3, fontFamily: 'inherit' }}>
                You have an "Inbox" Problem?
            </Typography>
            <Typography sx={{ color: '#000000', fontSize: { xs: '1rem', md: '1.2rem' }, maxWidth: 700, mx: 'auto', fontFamily: 'inherit' }}>
                Viral reels are great, but digging through 100 "🔥🔥🔥" comments to find the 5 people who want to pay you is <strong>impossible manual labor.</strong>
            </Typography>
        </Container>

        {/* --- SECTION 2: THE MYHANDLE LIFECYCLE (The Core) --- */}
        <Box sx={{ position: 'relative', py: 10, bgcolor: '#0B0F19' }}>
            
            {/* Connecting Line (Desktop Only) */}
            <Box sx={{ 
                display: { xs: 'none', md: 'block' },
                position: 'absolute', top: '50%', left: '10%', right: '10%', height: '4px',
                background: 'linear-gradient(90deg, #3B82F6 0%, #A855F7 50%, #22C55E 100%)',
                zIndex: 0, opacity: 0.3
            }} />

            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
                <Grid container spacing={8} alignItems="flex-start">
                    
                    {/* STEP 1: AUTO DM (The Standard) */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box sx={{ textAlign: 'center', position: 'relative' }}>
                            <Box sx={{ mb: 4 }}>
                                {/* THE NEW ANIMATED COMMENT SIMULATION */}
                                <CommentReplySimulation />
                            </Box>
                            
                            <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 800, mb: 2, fontSize: { xs: '1.25rem', md: '1.5rem' }, fontFamily: 'inherit' }}>1. Auto-Response</Typography>
                            <Typography sx={{ color: '#94A3B8', px: 2, fontSize: { xs: '0.9rem', md: '1rem' }, fontFamily: 'inherit' }}>
                                Like others, we auto reply to comments and send a DM. <br/>
                                <span style={{ color: '#3B82F6', fontSize: '0.9rem', fontWeight: 700 }}>(Standard Feature)</span>
                            </Typography>
                        </Box>
                    </Grid>

                    {/* STEP 2: THE INTELLIGENCE (The USP) */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box sx={{ textAlign: 'center', position: 'relative', mt: { xs: 8, md: 0 } }}>
                            {/* Arrow for mobile */}
                            <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, color: '#555', mx: 'auto', mb: 4 }} />
                            
                            <Box sx={{ mb: 4 }}>
                                <InboxScanner />
                            </Box>
                            
                            <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 800, mb: 2, fontSize: { xs: '1.25rem', md: '1.5rem' }, fontFamily: 'inherit' }}>2. Inbox Intelligence</Typography>
                            <Typography sx={{ color: '#94A3B8', px: 2, fontSize: { xs: '0.9rem', md: '1rem' }, fontFamily: 'inherit' }}>
                                <strong>Here is the magic.</strong> Our AI automatically detects High Intent conversations hidden in your DMs.
                            </Typography>
                        </Box>
                    </Grid>

                    {/* STEP 3: WHATSAPP (The Solution) */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box sx={{ textAlign: 'center', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', mt: { xs: 8, md: 0 } }}>
                             {/* Arrow for mobile */}
                             <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, color: '#555', mx: 'auto', mb: 4 }} />

                            <Box sx={{ height: '200px', display: 'flex', alignItems: 'center' }}>
                                <WhatsAppNotification />
                            </Box>
                            
                            <Box sx={{ mt: 4 }}>
                                <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 800, mb: 2, fontSize: { xs: '1.25rem', md: '1.5rem' }, fontFamily: 'inherit' }}>3. WhatsApp Alert</Typography>
                                <Typography sx={{ color: '#94A3B8', px: 2, fontSize: { xs: '0.9rem', md: '1rem' }, fontFamily: 'inherit' }}>
                                    We don't make you check another app. We send the Lead details directly to your <strong>WhatsApp.</strong>
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>

                </Grid>
            </Container>
        </Box>

        {/* --- SECTION 3: SAFETY & HUMAN TOUCH (With Meta Verified) --- */}
        <Box sx={{ py: 12, bgcolor: '#020617', position: 'relative', overflow: 'hidden' }}>
            {/* Background "Shield" Pattern */}
            <Box sx={{ 
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                width: '800px', height: '800px', opacity: 0.05,
                background: 'radial-gradient(circle, #22C55E 0%, transparent 70%)', zIndex: 0 
            }} />
            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
                <Grid container spacing={8} alignItems="center">
                    {/* TEXT CONTENT */}
                    <Grid size={{ xs: 12, md: 5 }}>
                        
                        <Typography variant="h2" sx={{ fontWeight: 900, color: '#FFF', mb: 3, fontSize: { xs: '2rem', md: '3.75rem' }, fontFamily: 'inherit' }}>
                            100% Safe. <br/>
                            <span style={{ color: '#22C55E' }}>0% Bot Behavior.</span>
                        </Typography>
                        
                        <Typography sx={{ color: '#94A3B8', fontSize: { xs: '1rem', md: '1.1rem' }, lineHeight: 1.6, mb: 4, fontFamily: 'inherit' }}>
                            Instagram bans accounts that act like robots. That's why we built our system to act like <strong>You.</strong>
                        </Typography>

                        <Stack spacing={3}>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Box sx={{ minWidth: 40, height: 40, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShuffleIcon sx={{ color: '#A78BFA' }} />
                                </Box>
                                <Box>
                                    <Typography sx={{ color: '#FFF', fontWeight: 700, fontFamily: 'inherit' }}>Smart Variations</Typography>
                                    <Typography sx={{ color: '#94A3B8', fontSize: { xs: '0.85rem', md: '0.9rem' }, fontFamily: 'inherit' }}>We rotate between 50+ reply variations so you never post the exact same comment twice.</Typography>
                                </Box>
                            </Box>
                             <Box sx={{ display: 'flex', gap: 2 }}>
                                <Box sx={{ minWidth: 40, height: 40, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AccessTimeIcon sx={{ color: '#FBBF24' }} />
                                </Box>
                                <Box>
                                    <Typography sx={{ color: '#FFF', fontWeight: 700, fontFamily: 'inherit' }}>Human Pacing</Typography>
                                    <Typography sx={{ color: '#94A3B8', fontSize: { xs: '0.85rem', md: '0.9rem' }, fontFamily: 'inherit' }}>We add random delays (e.g., 12s, 45s) between replies to mimic natural typing speed.</Typography>
                                </Box>
                            </Box>
                        </Stack>

                        {/* --- NEW META BADGE (Placed BELOW features) --- */}
                        <Box sx={{ 
                            mt: 5, 
                            p: 2, 
                            borderRadius: '16px', 
                            bgcolor: 'rgba(59, 130, 246, 0.08)', 
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 2 
                        }}>
                             {/* You can replace this component with <img src="meta.png" /> if you prefer */}
                             <Box 
                                component="img" 
                                src={MetaLogo} 
                                alt="Meta Verified" 
                                sx={{ width: 32, height: 'auto' }} 
                                />
                             <Box>
                                <Typography sx={{ color: '#FFF', fontWeight: 700, fontSize: { xs: '0.85rem', md: '0.9rem' }, lineHeight: 1.2, fontFamily: 'inherit' }}>
                                    Official Tech Provider
                                </Typography>
                                <Typography sx={{ color: '#94A3B8', fontSize: { xs: '0.7rem', md: '0.75rem' }, fontFamily: 'inherit' }}>
                                    Verified since 2025
                                </Typography>
                             </Box>
                             <VerifiedUserIcon sx={{ color: '#3B82F6', ml: 1 }} />
                        </Box>

                    </Grid>

                    {/* VISUAL CONTENT */}
                    <Grid size={{ xs: 12, md: 7 }}>
                        <Box sx={{ position: 'relative' }}>
                            {/* The Central Shield */}
                            <Box sx={{ 
                                position: 'absolute', top: -30, right: -20, zIndex: 2,
                                bgcolor: '#0F172A', p: 1, borderRadius: '50%', border: '4px solid #020617',
                                ...styles.shieldPulse
                            }}>
                                 <ShieldOutlinedIcon sx={{ fontSize: { xs: 50, md: 60 }, color: '#22C55E' }} />
                            </Box>
                            <BotVsHuman />
                        </Box>
                    </Grid>
                </Grid>
            </Container>
        </Box>

        {/* --- SECTION 4: THE ROI (Money) --- */}
        <Box sx={{ py: { xs: 10, md: 16 } }}>
            <Container maxWidth="lg">
                <EarningsCalculator />
            </Container>
        </Box>

        {/* --- SECTION 5: THE POWER SPECS (25 Lakhs) --- */}
        <Box sx={{ py: 10, bgcolor: '#0F172A', borderTop: '1px solid #1E293B' }}>
            <Container maxWidth="lg">
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={6} alignItems="center">
                    <Box sx={{ flex: 1 }}>
                        <Chip label="Unlimited Scalability" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF', mb: 2, fontFamily: 'inherit' }} />
                        <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 900, mb: 2, fontSize: { xs: '2rem', md: '3rem' }, fontFamily: 'inherit' }}>
                            Go Viral. <br/> <span style={{ color: '#A855F7' }}>We won't break.</span>
                        </Typography>
                        <Typography sx={{ color: '#94A3B8', fontSize: { xs: '1rem', md: '1.1rem' }, lineHeight: 1.6, fontFamily: 'inherit' }}>
                           Other tools cap you or crash when you hit 10k comments. We are engineered for unlimited scale, ensuring your automation runs perfectly whether you get 50 comments or 5 million.
                           </Typography>
                    </Box>
                    
                    <Box sx={{ flex: 1, width: '100%' }}>
                         <Paper sx={{ 
                            p: 4, borderRadius: '24px', 
                            background: 'radial-gradient(circle at 100% 0%, #2e1065 0%, #000 100%)',
                            border: '1px solid #7C3AED', position: 'relative', overflow: 'hidden'
                         }}>
                             {/* Background Texture */}
                             <BoltIcon sx={{ position: 'absolute', right: -20, bottom: -20, fontSize: 180, opacity: 0.1, color: '#FFF' }} />
                             
                             <Typography sx={{ color: '#A78BFA', fontWeight: 700, mb: 1, fontSize: { xs: '0.9rem', md: '1rem' }, fontFamily: 'inherit' }}>MONTHLY DM LIMIT</Typography>
                             <Typography sx={{ fontSize: { xs: '3rem', md: '4.5rem' }, fontWeight: 900, color: '#FFF', lineHeight: 1, mb: 1, fontFamily: 'inherit' }}>
                                25,00,000
                             </Typography>
                             <Stack direction="row" alignItems="center" spacing={1}>
                                <CheckCircleIcon sx={{ color: '#22C55E' }} />
                                <Typography sx={{ color: '#FFF', fontFamily: 'inherit' }}>Zero downtime guaranteed</Typography>
                             </Stack>
                         </Paper>
                    </Box>
                </Stack>
            </Container>
        </Box>

         {/* --- BOTTOM CTA --- */}
         <Box sx={{ py: 10, textAlign: 'center' }}>
            <Container maxWidth="sm">
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#22c55e', mb: 4, fontSize: { xs: '1.35rem', md: '2.125rem' }, fontFamily: 'inherit' }}>
                    Your WhatsApp is waiting for leads.
                </Typography>
                <Button 
                    onClick={() => navigate('/professional/login')}
                    variant="contained" 
                    size="large"
                    startIcon={<WhatsAppIcon />}
                    sx={{ 
                        bgcolor: '#22C55E', color: '#000', px: 5, py: 2, borderRadius: '50px', 
                        fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 700, textTransform: 'none',
                        fontFamily: 'inherit',
                        '&:hover': { bgcolor: '#16a34a' }
                    }}
                >
                    Start with 5 Free Leads
                </Button>
            </Container>
        </Box>
    </Box>

<Footer />
    </>
  );
}