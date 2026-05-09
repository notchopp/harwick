import type { ReactNode } from "react";

import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css";

export const metadata = {
  title: "harwick",
  description: "private lead desk for real estate teams.",
  icons: {
    icon: "/harwick-gemini-logo.png",
  },
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{props.children}</TooltipProvider>
      </body>
    </html>
  );
}
