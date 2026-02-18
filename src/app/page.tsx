import { redirect } from 'next/navigation';

/** Root — redirect to admin dashboard */
export default function Home() {
  redirect('/dashboard');
}
