"use client";
import { touchCatalog } from "@/lib/catalogClient";
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
import { childrenOf, topCats } from "@/lib/cats";

export default function AdminCategories() {
  const { data, loading, reload } = useAsync(listCategories, []);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [newParent, setNewParent] = useState("");
  const [pick, setPick] = useState<string[]>([]);   // categories ticked for "move inside"
  const [moveTo, setMoveTo] = useState("");
  const [msg, setMsg] = useState("");
  const all = data ?? [];
  const mains = topCats(all);
  const nameOf = (id?: string | null) => all.find((c) => c.id === id)?.name || "";
  /** Put categories inside a main category (or back to the top level with ""). One level only. */
  const setParent = async (ids: string[], parentId: string) => {
    const b = writeBatch(dbI());
    let n = 0;
    for (const id of ids) {
      if (id === parentId) continue;
      if (parentId && childrenOf(all, id).length) continue; // a main category that has subs can't go inside another
      b.update(doc(dbI(), "categories", id), { parentId: parentId || null }); n++;
    }
    await b.commit(); reload(); touchCatalog();
    return n;
  };
  const moveSelected = async () => {
    setErr(""); setMsg("");
    if (!pick.length) return setErr("علّم على الأقسام اللي عايز تنقلها الأول.");
    let target = moveTo;
    if (target === "__new") {
      const n = prompt("اسم القسم الرئيسي الجديد (مثال: اكسسوارات تلفونات):")?.trim();
      if (!n) return;
      const ref = await addDoc(collection(dbI(), "categories"), { name: n, icon: ICONS[0], order: 0, parentId: null });
      target = ref.id; setMoveTo(ref.id);
    }
    const done = await setParent(pick, target);
    setMsg(target ? `اتنقل ${done} قسم جوه "${nameOf(target) || "القسم الجديد"}" ✓` : `${done} قسم بقوا أقسام رئيسية ✓`);
    setPick([]);
  };
  const [err, setErr] = useState("");
  const { user } = useApp();
  const [up, setUp] = useState("");
  const setImg = async (id: string, file?: File) => {
    if (!file || !user) return;
    setUp(id); setErr("");
    try { await updateDoc(doc(dbI(), "categories", id), { image: await uploadImage(file, user.uid, "products") }); reload(); touchCatalog(); }
    catch { setErr("تعذّر رفع الصورة."); }
    setUp("");
  };
  const clearImg = async (id: string) => { await updateDoc(doc(dbI(), "categories", id), { image: "" }); reload(); touchCatalog(); };
  const add = async () => {
    if (name.trim().length < 2) return setErr("اكتب اسم القسم.");
    setErr("");
    await addDoc(collection(dbI(), "categories"), { name: name.trim(), icon, order: (data?.length ?? 0) + 1, parentId: newParent || null });
    setName(""); reload(); touchCatalog();
  };
  const seed = async () => {
    const b = writeBatch(dbI());
    DEFAULT_CATEGORIES.forEach((c, i) => b.set(doc(collection(dbI(), "categories")), { ...c, order: i + 1 }));
    await b.commit(); reload(); touchCatalog();
  };
  const rename = async (id: string, v: string) => { if (v.trim()) { await updateDoc(doc(dbI(), "categories", id), { name: v.trim() }); touchCatalog(); } };
  const move = async (i: number, d: number) => {
    const list = data ?? [];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const b = writeBatch(dbI());
    list.forEach((c, k) => {
      const pos = k === i ? j : k === j ? i : k;
      if (pos !== k || c.order !== k + 1) b.update(doc(dbI(), "categories", c.id), { order: pos + 1 });
    });
    await b.commit(); reload(); touchCatalog();
  };
  const saveOrder = async (next: Category[]) => {
    const b = writeBatch(dbI());
    next.forEach((c, k) => { if (c.order !== k + 1) b.update(doc(dbI(), "categories", c.id), { order: k + 1 }); });
    try { await b.commit(); } catch { setErr("تعذّر حفظ الترتيب."); }
    reload(); touchCatalog();
  };
  const dnd = useDragSort<Category>(data ?? [], (c) => c.id, saveOrder);
  const del = async (id: string, n: string) => { if (confirm(`حذف قسم "${n}"؟ المنتجات اللي فيه هتفضل موجودة.`)) { await deleteDoc(doc(dbI(), "categories", id)); reload(); touchCatalog(); } };
  return (
    <>
      <div className="card col">
        <b>إضافة قسم</b><small>بعد الإضافة اضغط على مربع الكاميرا جنب القسم عشان تحط له صورة (بتظهر في الرئيسية وصفحة الأقسام).</small>
        <div className="row wrap">
          <input className="in" style={{ maxWidth: 260 }} placeholder="اسم القسم" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="in" style={{ maxWidth: 200 }} value={icon} onChange={(e) => setIcon(e.target.value)}>{ICONS.map((i) => <option key={i} value={i}>{i.replace("ph-", "")}</option>)}</select>
          <i className={`ph ${icon}`} style={{ color: "var(--pm)" }} />
          <select className="in" style={{ maxWidth: 220 }} value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-label="داخل قسم رئيسي">
            <option value="">قسم رئيسي</option>
            {mains.map((m) => <option key={m.id} value={m.id}>جوه: {m.name}</option>)}
          </select>
          <button className="btn" onClick={add}>إضافة</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
      {all.length > 0 && (
        <div className="card col" style={{ gap: 10 }}>
          <b>تجميع الأقسام في قسم رئيسي <small>(مثال: كل أقسام الموبايل جوه "اكسسوارات تلفونات")</small></b>
          <small>علّم على الأقسام من المربعات اللي في القائمة تحت، واختار القسم الرئيسي، ودوس "نقل". القسم الرئيسي بيعرض منتجات كل الأقسام اللي جواه، وفي الرئيسية بيظهر هو بس.</small>
          <div className="row wrap">
            <span className="sp"><b>{pick.length}</b> متعلّم</span>
            <select className="in" style={{ maxWidth: 260 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">طلّعهم أقسام رئيسية</option>
              {mains.filter((m) => !pick.includes(m.id)).map((m) => <option key={m.id} value={m.id}>جوه: {m.name}</option>)}
              <option value="__new">+ قسم رئيسي جديد…</option>
            </select>
            <button className="btn" onClick={moveSelected} disabled={!pick.length}>نقل</button>
            {pick.length > 0 && <button className="btn o sm2" onClick={() => setPick([])}>شيل العلامات</button>}
          </div>
          {msg && <span className="ok">{msg}</span>}
        </div>
      )}
      {loading ? <div className="skel" /> : !data?.length ? (
        <div className="card col"><b>مفيش أقسام لسه</b><small>تقدر تضيف الأقسام الأساسية بضغطة واحدة وتعدّلها بعدين.</small><button className="btn" style={{ alignSelf: "flex-start" }} onClick={seed}>إضافة الأقسام الأساسية</button></div>
      ) : (
        <div className="col">
          <small>اسحب القسم من علامة <i className="ph ph-dots-six-vertical" style={{ fontSize: 16 }} /> وحطه في المكان اللي عايزه (بيشتغل بالماوس وبالصباع على الموبايل). الترتيب بيتحفظ تلقائي.</small>
          {dnd.list.map((c, i) => (
            <div key={c.id} className="card row sortable" {...dnd.item(c.id)}>
              <button type="button" className="grip" aria-label="اسحب لترتيب القسم" {...dnd.handle(c.id)}><i className="ph ph-dots-six-vertical" /></button>
              <input type="checkbox" checked={pick.includes(c.id)} onChange={(e) => setPick(e.target.checked ? [...pick, c.id] : pick.filter((x) => x !== c.id))} style={{ width: 20, height: 20, accentColor: "var(--pa)", flex: "none" }} aria-label="اختيار القسم" />
              <label title="صورة القسم" style={{ cursor: "pointer", position: "relative", flex: "none" }}>
                {c.image ? <img src={sized(c.image, 120)} alt="" className="ph-thumb" /> : <span className="ph-thumb" style={{ display: "grid", placeItems: "center", color: "var(--gold)" }}>{up === c.id ? "…" : <i className="ph ph-camera-plus" />}</span>}
                <input type="file" accept="image/*" hidden onChange={(e) => { setImg(c.id, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div className="sp col" style={{ gap: 4 }}>
                <input className="in" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && rename(c.id, e.target.value)} />
                <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                  {childrenOf(all, c.id).length > 0
                    ? <span className="bd" style={{ background: "var(--pa)", color: "#fff" }}>قسم رئيسي · جواه {childrenOf(all, c.id).length}</span>
                    : (
                      <select className="in" style={{ minHeight: 30, fontSize: 12.5, maxWidth: 220, padding: "0 8px" }} value={c.parentId && all.some((x) => x.id === c.parentId) ? c.parentId : ""} onChange={(e) => setParent([c.id], e.target.value)} aria-label="القسم الرئيسي">
                        <option value="">قسم رئيسي</option>
                        {mains.filter((m) => m.id !== c.id).map((m) => <option key={m.id} value={m.id}>جوه: {m.name}</option>)}
                      </select>
                    )}
                </div>
              </div>
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
