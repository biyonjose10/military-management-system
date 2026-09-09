import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MMS — Military Management System",
  description:
    "Personnel readiness, equipment logistics and chain-of-command access control. Demonstration system with entirely fictional data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `dark` is unconditional: the palette in globals.css has no light variant,
    // and the class is what lets `dark:` variants inside generated shadcn
    // components resolve at all.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
