import { redirect } from "next/navigation";

/** 旧URL。依頼は設備選択から始める */
export default function RequestIndex() {
  redirect("/search");
}
