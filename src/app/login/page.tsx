import { LoginForm } from '@/components/auth/login-form';

/**
 * The ground is `bg-background`, NOT a hardcoded light hex.
 *
 * /login sits outside the admin shell, so there is no ThemeProvider above it —
 * which means every token inside LoginForm (--foreground, bg-background,
 * border-input, --primary) falls through to the prefers-color-scheme media
 * query in globals.css. Pinning the page to a light hex while its contents
 * followed the OS produced, for anyone in dark mode: a near-black input box on
 * a white card, pale-on-pale headings, and the desaturated dark-theme gradient
 * on the submit button. Either both follow the theme or neither does, and this
 * is the first page anyone sees.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-background">
      <LoginForm />
    </main>
  );
}
