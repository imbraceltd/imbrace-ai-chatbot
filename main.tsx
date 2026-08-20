import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth/context";
import { ImbraceTokenHandler } from "@/components/imbrace-token-handler";
import { Toaster } from "sonner";
import { AppRoutes } from "@/routes";

import "@/globals.css";

// Set font CSS variables to match Next.js font loader output
document.documentElement.style.setProperty("--font-geist", "Geist, sans-serif");
document.documentElement.style.setProperty("--font-geist-mono", "'Geist Mono', monospace");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        <AuthProvider>
          <ImbraceTokenHandler />
          <Toaster position="top-center" />
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
