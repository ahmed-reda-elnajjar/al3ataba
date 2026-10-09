"use client";
import { sized } from "@/lib/media";
import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";
import { DEFAULT_CATEGORIES, ICONS } from "@/lib/config";
import { uploadImage } from "@/lib/img";
import { useApp } from "@/lib/providers";
import { useDragSort } from "@/lib/dnd";
import type { Category } from "@/lib/types";

export default function AdminCategories() {
  const { data, loading, reload } = useAsync(listCategories, []);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [err, setErr] = useState("");
  const { user } = useApp();
  const [up, setUp] = useState("");
  const setImg = async (id: string, file?: File) => {
    if (!file || !user) return;
    setUp(id); setErr("");
    try { await updateDoc(doc(dbI(), "categories", id), { image: await uploadImage(file, user.uid, "products") }); reload(); }
    catch { setErr("تعذّر رفع الصورة."); }
    setUp("");
  };
  const clearImg = async (id: string) => { await updateDoc(doc(dbI(), "categories", id), { image: "" }); reload(); };
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
  const saveOrder = async (next: Category[]) => {
    const b = writeBatch(dbI());
    next.forEach((c, k) => { if (c.order !== k + 1) b.update(doc(dbI(), "categories", c.id), { order: k + 1 }); });
    try { await b.commit(); } catch { setErr("تعذّر حفظ الترتيب."); }
    reload();
  };
  const dnd = useDragSort<Category>(data ?? [], (c) => c.id, saveOrder);
  const del = async (id: string, n: string) => { if (confirm(`حذف قسم "${n}"؟ المنتجات اللي فيه هتفضل موجودة.`)) { await deleteDoc(doc(dbI(), "categories", id)); reload(); } };
  return (
    <>
      <div className="card col">
        <b>إضافة قسم</b><small>بعد الإضافة اضغط على مربع الكاميرا جنب القسم عشان تحط له صورة (بتظهر في الرئيسية وصفحة الأقسام).</small>
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
          <small>اسحب القسم من علامة <i className="ph ph-dots-six-vertical" style={{ fontSize: 16 }} /> وحطه في المكان اللي عايزه (بيشتغل بالماوس وبالصباع على الموبايل). الترتيب بيتحفظ تلقائي.</small>
          {dnd.list.map((c, i) => (
            <div key={c.id} className="card row sortable" {...dnd.item(c.id)}>
              <button type="button" className="grip" aria-label="اسحب لترتيب القسم" {...dnd.handle(c.id)}><i className="ph ph-dots-six-vertical" /></button>
              <label title="صورة القسم" style={{ cursor: "pointer", position: "relative", flex: "none" }}>
                {c.image ? <img src={sized(c.image, 120)} alt="" className="ph-thumb" /> : <span className="ph-thumb" style={{ display: "grid", placeItems: "center", color: "var(--gold)" }}>{up === c.id ? "…" : <i className="ph ph-camera-plus" />}</span>}
                <input type="file" accept="image/*" hidden onChange={(e) => { setImg(c.id, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <input className="in sp" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && rename(c.id, e.target.value)} />
              <button className="btn o sm2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="لفوق"><i className="ph ph-arrow-up" /></button>
              <button className="btn o sm2" disabled={i === dnd.list.length - 1} onClick={() => move(i, 1)} aria-label="لتحت"><i className="ph ph-arrow-down" /></button>
              {c.image && <button className="btn o sm2" onClick={() => clearImg(c.id)} title="شيل الصورة"><i className="ph ph-image-broken" /></button>}
              <button className="btn r sm2" onClick={() => del(c.id, c.name)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
