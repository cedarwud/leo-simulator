import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage, SatelliteHandoverPage, BeamHoppingPage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/satellite-handover" element={<SatelliteHandoverPage />} />
        <Route path="/beam-hopping" element={<BeamHoppingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
