"use client";
import { useParams } from "next/navigation";
import { ProductForm } from "@/components/ProductForm";

export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  return <ProductForm id={id === "new" ? undefined : id} back="/admin/products" />;
}
