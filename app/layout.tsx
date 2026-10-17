import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Announcement, Header, Footer, BottomNav, WhatsApp, Welcome } from "@/components/Shell";
import { Providers } from "@/lib/providers";
import { Splash } from "@/components/Splash";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://al3ataba.vercel.app").replace(/\/+$/, "");
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "العتبة أونلاين | أسعار الجملة من كل أسواق مصر في مكان واحد", template: "%s" },
  description: "اشتري بالجملة من تجار ومصانع العتبة والموسكي مباشرة: إكسسوارات موبايل، هدوم، وأكتر. أسعار بالكمية، وتوصيل لكل محافظات مصر.",
  keywords: ["جملة", "العتبة", "العتبة أونلاين", "أسعار الجملة", "تجار جملة", "إكسسوارات موبايل جملة", "هدوم جملة", "الموسكي", "سوق الجملة مصر"],
  applicationName: "العتبة أونلاين",
  alternates: { canonical: SITE },
  openGraph: { type: "website", locale: "ar_EG", siteName: "العتبة أونلاين", url: SITE, title: "العتبة أونلاين | أسعار الجملة من كل أسواق مصر", description: "اشتري بالجملة من تجار ومصانع العتبة مباشرة، مع توصيل لكل مصر." },
  robots: { index: true, follow: true },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
        <meta name="theme-color" content="#0a3427" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "العتبة أونلاين", alternateName: "ATABA ONLINE", url: SITE, description: "منصة جملة مصرية: من كل أسواق مصر في مكان واحد" }) }} />
        {/* skip the intro instantly (before first paint) if it was already shown in this visit */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('al3ataba-splash'))document.documentElement.classList.add('no-splash')}catch(e){}" }} />
      </head>
      <body>
        <Splash />
        <Providers>
          <div className="frame">
            <Announcement />
            <Header />
            <main style={{ flex: 1 }}>{children}</main>
            <WhatsApp />
            <Footer />
            <BottomNav />
            <Welcome />
          </div>
        </Providers>
      </body>
    </html>
  );
}
