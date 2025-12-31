import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Analytics",
  description: "Social Analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0b1220] text-foreground`}
      >
        <div className="min-h-dvh w-full flex flex-col">
          <main className="w-full py-8 px-4 sm:px-6">
            <div className="w-full max-w-none mx-auto">{children}</div>
          </main>

          <footer className="mt-auto border-t border-white/10 bg-[#0b1220]/70 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-start">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-white">Social Analytics</div>
                  <p className="text-sm text-slate-300 max-w-2xl">
                    本工具提供推論與示範輸出，不保證正確；官方數據需使用者明確授權後才會讀取並顯示；本工具不隸屬 IG/Threads/Meta。
                  </p>
                  <p className="text-xs text-slate-400 max-w-2xl">
                    建議你依實際使用情境自行確認合規要求，必要時可諮詢專業法律意見。
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                  <a
                    href="/terms"
                    className="hover:text-white underline underline-offset-4 decoration-white/20"
                  >
                    Terms
                  </a>
                  <a
                    href="/privacy"
                    className="hover:text-white underline underline-offset-4 decoration-white/20"
                  >
                    Privacy
                  </a>
                  <a
                    href="/contact"
                    className="hover:text-white underline underline-offset-4 decoration-white/20"
                  >
                    Contact
                  </a>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
                <div>© {new Date().getFullYear()} Social Analytics</div>
                <div className="text-slate-400">Inferred signals. Official metrics only after authorization.</div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
