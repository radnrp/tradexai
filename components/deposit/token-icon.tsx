import Image from "next/image";
import type { DepositToken } from "./options";

export function TokenIcon({ token, size }: { token: Pick<DepositToken, "icon">; size: number }) {
  return <Image src={token.icon} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full" />;
}
