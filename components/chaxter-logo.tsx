import Image from "next/image";
import chaxterLogo from "@/public/chaxter-logo.png";

export default function ChaxterLogo() {
  return <span className="chaxter-logo">
    <Image src={chaxterLogo} alt="Chaxter" sizes="160px" className="chaxter-logo-image" />
  </span>;
}
