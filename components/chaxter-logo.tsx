import Image from "next/image";

export default function ChaxterLogo() {
  return <span className="chaxter-logo">
    <Image src="/chaxter-logo.png" alt="Chaxter" width={2360} height={1640} sizes="160px" loading="eager" className="chaxter-logo-image" />
  </span>;
}
