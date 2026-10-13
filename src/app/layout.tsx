import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { NotebookDirtyProvider } from "@/context/NotebookDirtyContext";
import ClientLayout from "@/components/ClientLayout";

// Geist is the interface face (everything you click, read in a list, or
// type into). Newsreader - a serif drawn for long-form reading - is the
// display face for marketing and documentation headlines only, giving the
// public pages an editorial, notebook-like voice without touching the app.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Rune", template: "%s · Rune" },
  description:
    "Rune is a free, self-hostable workspace for people juggling too many things: tasks, projects, a calendar, a LaTeX lab notebook and experiment tracking in one place.",
  applicationName: "Rune",
  openGraph: {
    title: "Rune · You, with a few extra hands.",
    description: "Tasks, projects, a calendar, a LaTeX notebook and experiment tracking in one free, self-hostable app.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Before first paint the inline script below applies the visitor's stored
  // theme, or - on a first visit, with nothing stored - their OS preference.
  // A signed-in user's saved choice (`User.theme`) then wins once the
  // session loads (ClientLayout). This is the pattern from Next's
  // "preventing flash before hydration" guide; `suppressHydrationWarning` is
  // needed because the script changes the attribute before React hydrates.
  return (
    // Font variables live on <html>, not <body>: the theme's --font-sans is
    // resolved at :root, so variables declared lower down never reached it
    // and every page silently fell back to the system font.
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} h-full bg-background`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("rune_theme_v2");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="font-sans min-h-full flex flex-col antialiased"
      >
        <SessionProvider>
          <NotificationProvider>
            <ConfirmProvider>
              <NotebookDirtyProvider>
                <ClientLayout>{children}</ClientLayout>
              </NotebookDirtyProvider>
            </ConfirmProvider>
          </NotificationProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
