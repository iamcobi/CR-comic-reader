import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackMate — Make something that matters",
  description:
    "Your little companion for big hackathon ideas. Turn a brief and a team into a plan.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
