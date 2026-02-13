import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SatelliteHandoverPage } from './pages';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SatelliteHandoverPage />} />
      </Routes>
    </BrowserRouter>
  );
}

