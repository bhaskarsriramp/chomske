import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import ConnectDB from './pages/ConnectDB';
import Confirmation from './pages/Confirmation';
import SituationFeed from './pages/SituationFeed';
import Ask from './pages/Ask';
import LandingPage from './components/LandingPage/LandingPage';
import ProblemPage from './pages/ProblemPage';
import HowItWorksPage from './pages/HowItWorksPage';
import EnginesPage from './pages/EnginesPage';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6C63FF' },
    background: { default: '#0d0d0f', paper: '#16161a' },
  },
  shape: { borderRadius: 10 },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/connection" element={<ConnectDB />} />
          <Route path="/confirm" element={<Confirmation />} />
          <Route path="/feed" element={<SituationFeed />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/problem" element={<ProblemPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/engines" element={<EnginesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
