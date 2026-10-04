# العتبة (al3ataba) — سوق الجملة المصري

Next.js 15 + Firebase (Auth / Firestore / Storage). واجهة عربية RTL بخلفية بيضاء وألوان خضراء.

## التشغيل لأول مرة

1. `npm install`
2. `npm run dev` ثم افتح http://localhost:3000
3. للإنتاج: `npm run build` ثم `npm start` (أو انشره على Vercel).

## إعداد Firebase (مرة واحدة من الكونسول)

مشروع Firebase: `al3ataba-c6a08`.

1. **Authentication → Sign-in method**: فعّل Google و Email/Password و Phone (اختياري) و **Anonymous** (مطلوب للسلة).
2. **Authentication → Settings → Authorized domains**: ضيف دومين موقعك بعد النشر.
3. **Firestore Database**: أنشئ قاعدة بيانات (Production mode).
4. **Storage**: فعّله. لو طلب خطة Blaze فعّلها؛ ولو ما فعّلتهاش الموقع هيخزّن الصور مصغّرة داخل قاعدة البيانات (يشتغل لكن مش مثالي).
5. انشر القواعد:
   ```
   npm i -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes,storage --project al3ataba-c6a08
   ```

## دخول الأدمن

- إيميل الأدمن: `a7mdelnagar297@gmail.com` (معرّف في `lib/config.ts` وفي `firestore.rules`).
- سجّل دخول بـ **Google** بنفس الإيميل (لازم يكون Verified)، هيظهر لك زر "الإدارة" في الهيدر، أو افتح `/admin`.
- لتغيير الأدمن أو إضافة أدمن تاني عدّل القائمة في الملفين ثم أعد نشر القواعد.

## أول يوم تشغيل

1. `/admin/categories` ← اضغط "إضافة الأقسام الأساسية".
2. `/admin/settings` ← حط واتساب الدعم وتعليمات التحويل ومصاريف الشحن.
3. `/admin/products/new` ← أضف منتجاتك برفع الصور (منتجات الأدمن بتظهر باسم "العتبة").
4. التجار يسجّلوا من `/sell`، وإنت توافق عليهم من `/admin/merchants`، وبعدها يضيفوا منتجاتهم من `/merchant`.

## الصفحات

- المشتري: `/` `/search` `/product/[id]` `/cart` `/checkout` `/rfq` `/account` `/suppliers` `/store/[id]` `/help` `/legal/[terms|privacy|returns]`
- التاجر: `/merchant` (منتجات، طلبات، تقديم عروض أسعار، بيانات المتجر)
- الأدمن: `/admin` (منتجات، أقسام، تجار، طلبات، RFQ، إعدادات)

## حدود معروفة قبل الإطلاق الفعلي

- لا يوجد بوابة دفع إلكتروني ولا ضمان أموال (escrow): الدفع عند الاستلام أو تحويل يدوي تتابعه إنت.
- لا يوجد شات داخلي (المرحلة التالية) — التواصل عبر واتساب.
- النصوص القانونية (الشروط والخصوصية والمرتجعات) نماذج أولية ولازم يراجعها محامٍ.
- لم يتم تشغيل `next build` في بيئة التطوير (npm محجوب هناك)؛ شغّله عندك وأرسل أي خطأ يظهر.
