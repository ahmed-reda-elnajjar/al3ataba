"use client";
import { Suspense } from "react";
import { ResellAdmin } from "@/components/ResellAdmin";

export default function Page() {
  return <Suspense fallback={<div className="skel" />}><ResellAdmin /></Suspense>;
}
