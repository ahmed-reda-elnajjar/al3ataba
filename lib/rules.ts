"use client";
import { doc, setDoc } from "firebase/firestore";
import { dbI } from "./firebase";
import type { PriceRule } from "./pricing";

/** Saves the markup rules as the site default (admin only) so they're pre-filled next time. */
export const saveRules = (rules: PriceRule[]) => setDoc(doc(dbI(), "settings", "site"), { markupRules: rules }, { merge: true });
