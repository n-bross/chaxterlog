import Image from "next/image";
import wordmark from "@/public/chaxter-wordmark.png";

export default function ChaxterLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={`chaxter-logo ${className}`}>
      <Image src={wordmark} alt="Chaxter" sizes="(max-width: 640px) 180px, 240px" priority={priority} />
    </span>
  );
}
