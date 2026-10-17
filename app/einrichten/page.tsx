import LoginForm from "@/components/login-form";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function Page() { return <LoginForm setup />; }
