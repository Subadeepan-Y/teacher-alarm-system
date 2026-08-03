import type { Metadata } from "next";
import "./globals.css";
import { TimetableProvider } from "@/hooks/useTimetable";

export const metadata: Metadata = {
  title: "Teacher Schedule System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TimetableProvider>{children}</TimetableProvider>
      </body>
    </html>
  );
}
