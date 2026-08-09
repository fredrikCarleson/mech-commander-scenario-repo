import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Helmet } from 'react-helmet-async';
import { getAdminToken } from '../api/admin-client.ts';
import '../styles/wiki.css';

const SIDEBAR_GROUPS = [
  {
    title: 'Player Manual',
    links: [
      { id: 'HOW_TO_PLAY', label: 'How to Play' },
      { id: 'CONTROLS_AND_INTERFACE', label: 'Controls & Interface' },
      { id: 'CAREER_THEATERS', label: 'Career & Theaters' },
    ],
  },
  {
    title: 'Hangar & Armory',
    links: [
      { id: 'MECHS_AND_CHASSIS', label: 'Mechs & Chassis' },
      { id: 'WEAPONS_AND_EQUIPMENT', label: 'Weapons & Equipment' },
      { id: 'PILOTS_AND_SKILLS', label: 'Pilots & Skills' },
    ],
  },
  {
    title: 'Campaign Lore',
    links: [
      { id: 'MERIDIAN_STRIKE_CHRONICLES', label: 'Meridian Strike Chronicles' },
      { id: 'EMBER_REACH_CHRONICLES', label: 'Ember Reach Chronicles' },
    ],
  },
  {
    title: 'Modding & Studio',
    links: [
      { id: 'CAMPAIGN_EDITOR', label: 'Campaign Editor' },
      { id: 'MAP_DESIGN_GUIDE', label: 'Map Design Guide' },
      { id: 'MODDING_AND_CUSTOM_SCENARIOS', label: 'Custom Scenarios' },
      { id: 'SCENARIO_APPROVAL', label: 'Scenario Approval' },
    ],
  },
];

function processAlerts(markdown: string) {
  return markdown.replace(
    /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:> .*\n?)*)/gm,
    (_match, type, content) => {
      const cleanContent = content.replace(/^> /gm, '').trim();
      return `<blockquote class="wiki-alert-${type.toLowerCase()}"><strong>${type}</strong>\n\n${cleanContent}</blockquote>\n\n`;
    },
  );
}

export function WikiPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('Loading...');
  const [isAdmin, setIsAdmin] = useState(false);

  const location = useLocation();
  const currentId = pageId || 'HOW_TO_PLAY';

  const pageTitle = useMemo(() => {
    for (const group of SIDEBAR_GROUPS) {
      const link = group.links.find((l) => l.id === currentId);
      if (link) return link.label;
    }
    return 'Wiki';
  }, [currentId]);

  useEffect(() => {
    fetch('/version-policy.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.version) {
          setVersion(data.version);
        } else {
          setVersion('Unknown');
        }
      })
      .catch(() => setVersion('Unknown'));
  }, []);

  useEffect(() => {
    const checkAuth = () => setIsAdmin(!!getAdminToken());
    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const fileName = currentId;
        const response = await fetch(`/wiki/${fileName}.md`);
        if (!response.ok) {
          throw new Error('Page not found');
        }
        const text = await response.text();
        if (isMounted) {
          setContent(processAlerts(text));
        }
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchContent();
    return () => {
      isMounted = false;
    };
  }, [currentId]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${pageTitle} | Meridian Strike Wiki`,
    articleSection: 'Game Guide',
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Wiki',
        item: 'https://meridian-strike-wiki.netlify.app/wiki',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pageTitle,
      },
    ],
  };

  return (
    <div className="wiki-layout">
      {error ? (
        <Helmet>
          <title>Page Not Found | Meridian Strike</title>
          <meta name="robots" content="noindex" />
        </Helmet>
      ) : (
        <Helmet>
          <title>{pageTitle} | Meridian Strike</title>
          <meta
            name="description"
            content={`Read the ${pageTitle} guide for Meridian Strike, a turn-based hex-grid tactical mech game.`}
          />
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
          <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
        </Helmet>
      )}

      <aside className="wiki-sidebar">
        {version !== 'Unknown' && (
          <div className="wiki-version-indicator">
            <div className="version-label">Client Compatibility</div>
            <div className="version-value">{version}</div>
          </div>
        )}

        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.title} className="wiki-sidebar-group">
            <h3>{group.title}</h3>
            <nav className="wiki-sidebar-nav">
              {group.links
                .filter((link) => isAdmin || link.id !== 'CAMPAIGN_EDITOR')
                .map((link) => (
                  <Link
                    key={link.id}
                    to={`/wiki/${link.id}`}
                    className={location.pathname === `/wiki/${link.id}` ? 'active' : ''}
                  >
                    {link.label}
                  </Link>
                ))}
            </nav>
          </div>
        ))}
      </aside>
      <section className="wiki-content">
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <div className="status error">Failed to load content: {error}</div>
        ) : (
          <div className="wiki-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  );
}
