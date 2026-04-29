import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Realty Ops",
  description: "AI lead operating system for real estate teams.",
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
