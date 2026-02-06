import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SatelliteHandoverPage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SatelliteHandoverPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
