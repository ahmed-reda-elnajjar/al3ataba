import { redirect } from "next/navigation";

/* "طلب منتج / عرض سعر" was removed — old links go to the products. */
export default function Page() { redirect("/search"); }
