import type { Metadata, Viewport } from 'next';
import { Itim } from 'next/font/google';
import './globals.css';

import { Toaster } from 'react-hot-toast';
import DeviceHeartbeat from '@/components/DeviceHeartbeat';

const itim = Itim({
  variable: '--font-itim',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sesijepret Photo Booth',
  description: 'Capture Your Moments — Professional Photo Booth Experience',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${itim.variable} h-full`} suppressHydrationWarning>
      <body className="h-full antialiased" suppressHydrationWarning>
        <DeviceHeartbeat />
        {children}
        <Toaster position="top-center" reverseOrder={false} />
      </body>
    </html>
  );
}
