import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Announcement, Header, Footer, BottomNav, WhatsApp, Welcome } from "@/components/Shell";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "العتبة أونلاين | من كل أسواق مصر في مكان واحد",
  description: "اشتري جملة من المصنع والتاجر مباشرة. أسعار بالكمية، وطلب عرض سعر من أكتر من تاجر.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
        <meta name="theme-color" content="#0a3427" />
      </head>
      <body>
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
