import { Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from './components/Layout.tsx';
import { CataloguePage } from './pages/CataloguePage.tsx';
import { DetailPage } from './pages/DetailPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { ApiInfoPage } from './pages/ApiInfoPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { WikiPage } from './pages/WikiPage.tsx';
import { CampaignCataloguePage } from './pages/CampaignCataloguePage.tsx';
import { CampaignDetailPage } from './pages/CampaignDetailPage.tsx';
import { SupportPage } from './pages/SupportPage.tsx';

function NotFoundPage() {
  return (
    <section className="panel">
      <Helmet>
        <title>Page Not Found | Meridian Strike</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <h2>404 - Page Not Found</h2>
      <p>The page you are looking for does not exist.</p>
    </section>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/wiki/HOW_TO_PLAY" replace />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/campaigns" element={<CampaignCataloguePage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/scenarios/:id" element={<DetailPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/api" element={<ApiInfoPage />} />
        <Route path="/wiki" element={<Navigate to="/wiki/HOW_TO_PLAY" replace />} />
        <Route path="/wiki/:pageId" element={<WikiPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
