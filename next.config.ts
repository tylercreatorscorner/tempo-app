import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ship the Inter TTFs into the PDF lambdas.
   *
   * Both PDF renderers register fonts with
   *   path.join(process.cwd(), 'node_modules', '@expo-google-fonts', ...)
   * which is assembled at RUNTIME from variables, so Next's file tracing cannot
   * see it statically and never copies the .ttf files into the function bundle.
   * Verified on the build output before this config existed: zero .ttf files
   * anywhere under .next, and no trace entry referencing @expo-google-fonts.
   *
   * Locally it works, because process.cwd() really does have node_modules next
   * to it. In the serverless bundle those files are absent, @react-pdf cannot
   * measure text without a font, and layout collapses into a garbage
   * coordinate. The symptom is not "font missing" — it is
   *   Error: unsupported number: -8.264141345021879e+21
   * thrown from /api/invoices/[id]/pdf, which is what made this look like a
   * data problem rather than a packaging one.
   *
   * Four routes depend on these files, and only one of them is a button a
   * person clicks:
   *   /api/invoices/[id]/pdf          admin download
   *   /api/invoices/share/[token]/pdf public share download (client-facing)
   *   /api/invoices/[id]/email        the EMAILED invoice attachment
   *   /api/brand-client-pdf           brand client report
   *
   * Route keys are globs so a new PDF route under these trees inherits the
   * fonts instead of shipping broken.
   *
   * The file pattern is the broad recursive glob, which traces all 18 Inter
   * weights (~7.9 MB) where the renderers register only four. That is verified
   * working — 18 files traced into each of the four routes. Narrowing it to the
   * four weights is plausible but UNVERIFIED here: the obvious check is easy to
   * get wrong, because these trace entries are Windows paths with escaped
   * backslashes, and a grep character class like [^\"] silently reports zero
   * matches against them. If you narrow this, confirm by counting
   * "expo-google-fonts" occurrences in the .nft.json files directly, and
   * remember the failure mode is invisible until production.
   */
  outputFileTracingIncludes: {
    "/api/invoices/**": ["./node_modules/@expo-google-fonts/inter/**/*.ttf"],
    "/api/brand-client-pdf/**": ["./node_modules/@expo-google-fonts/inter/**/*.ttf"],
    "/api/report-pdf/**": ["./node_modules/@expo-google-fonts/inter/**/*.ttf"],
  },
};

export default nextConfig;
