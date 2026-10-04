import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Announcement, Header, Footer, BottomNav, WhatsApp } from "@/components/Shell";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "العتبة | سوق الجملة في مصر",
  description: "اشتري جملة من المصنع والتاجر مباشرة. أسعار بالكمية، وطلب عرض سعر من أكتر من تاجر.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
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
          </div>
        </Providers>
      </body>
    </html>
  );
}
