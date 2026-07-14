import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { CataloguePage } from './pages/CataloguePage.tsx';
import { DetailPage } from './pages/DetailPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { ApiInfoPage } from './pages/ApiInfoPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<CataloguePage />} />
        <Route path="/scenarios/:id" element={<DetailPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/api" element={<ApiInfoPage />} />
      </Routes>
    </Layout>
  );
}
