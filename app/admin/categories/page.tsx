"use client";
import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";
import { DEFAULT_CATEGORIES, ICONS } from "@/lib/config";

export default function AdminCategories() {
  const { data, loading, reload } = useAsync(listCategories, []);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [err, setErr] = useState("");
  const add = async () => {
    if (name.trim().length < 2) return setErr("اكتب اسم القسم.");
    setErr("");
    await addDoc(collection(dbI(), "categories"), { name: name.trim(), icon, order: (data?.length ?? 0) + 1 });
    setName(""); reload();
  };
  const seed = async () => {
    const b = writeBatch(dbI());
    DEFAULT_CATEGORIES.forEach((c, i) => b.set(doc(collection(dbI(), "categories")), { ...c, order: i + 1 }));
    await b.commit(); reload();
  };
  const rename = async (id: string, v: string) => { if (v.trim()) await updateDoc(doc(dbI(), "categories", id), { name: v.trim() }); };
  const move = async (i: number, d: number) => {
    const list = data ?? [];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const b = writeBatch(dbI());
    list.forEach((c, k) => {
      const pos = k === i ? j : k === j ? i : k;
      if (pos !== k || c.order !== k + 1) b.update(doc(dbI(), "categories", c.id), { order: pos + 1 });
    });
    await b.commit(); reload();
  };
  const del = async (id: string, n: string) => { if (confirm(`حذف قسم "${n}"؟ المنتجات اللي فيه هتفضل موجودة.`)) { await deleteDoc(doc(dbI(), "categories", id)); reload(); } };
  return (
    <>
      <div className="card col">
        <b>إضافة قسم</b>
        <div className="row wrap">
          <input className="in" style={{ maxWidth: 260 }} placeholder="اسم القسم" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="in" style={{ maxWidth: 200 }} value={icon} onChange={(e) => setIcon(e.target.value)}>{ICONS.map((i) => <option key={i} value={i}>{i.replace("ph-", "")}</option>)}</select>
          <i className={`ph ${icon}`} style={{ color: "var(--pm)" }} />
          <button className="btn" onClick={add}>إضافة</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
      {loading ? <div className="skel" /> : !data?.length ? (
        <div className="card col"><b>مفيش أقسام لسه</b><small>تقدر تضيف الأقسام الأساسية بضغطة واحدة وتعدّلها بعدين.</small><button className="btn" style={{ alignSelf: "flex-start" }} onClick={seed}>إضافة الأقسام الأساسية</button></div>
      ) : (
        <div className="col">
          {data.map((c, i) => (
            <div key={c.id} className="card row">
              <i className={`ph ${c.icon}`} style={{ color: "var(--pm)" }} />
              <input className="in sp" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && rename(c.id, e.target.value)} />
              <button className="btn o sm2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="لفوق"><i className="ph ph-arrow-up" /></button>
              <button className="btn o sm2" disabled={i === data.length - 1} onClick={() => move(i, 1)} aria-label="لتحت"><i className="ph ph-arrow-down" /></button>
              <button className="btn r sm2" onClick={() => del(c.id, c.name)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
