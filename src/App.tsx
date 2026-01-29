import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage, SatelliteHandoverPage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/satellite-handover" element={<SatelliteHandoverPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
