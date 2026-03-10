import { redirect } from 'next/navigation';

/** Signup now redirects to the unified onboarding flow */
export default function SignupPage() {
  redirect('/onboarding');
}
