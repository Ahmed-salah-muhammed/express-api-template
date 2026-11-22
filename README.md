# express-api-template

Web API بـ Node.js و Express فيه أدوار، بنفس البنية اللي اشتغلنا بيها في APCO وبنفس عقد تمبلت الـ ‎.NET، من غير أي حاجة تخص مشروع بعينه: **Routes ← Controllers ← Services ← `unitOfWork`/Repositories ← قاعدة البيانات**.

**التقنيات:** Node.js 20+ و Express 5 و JWT و zod و Vitest، وقاعدة البيانات اللي تختارها: **MongoDB** (mongoose، يعني MERN) أو **PostgreSQL / SQL Server / MySQL / SQLite** (knex). ومعاهم رفع ملفات (محلي أو S3-compatible) و nodemailer و Docker و GitHub Actions.

<!-- template-only -->
## ابدأ تطبيق جديد من التمبلت

من جوه فولدر التمبلت، أمر واحد بيعمل مشروع جديد في أي مكان وبقاعدة البيانات اللي تختارها:

```bash
node scripts/create-app.mjs ../my-app --db mongo       # MERN
node scripts/create-app.mjs ../my-app --db postgres    # أو: mssql | mysql | sqlite
cd ../my-app
npm install
npm run dev                                            # http://localhost:5000
```

| `--db` | قاعدة البيانات | بتشتغل إزاي في التطوير |
|---|---|---|
| `mongo` | MongoDB (mongoose) | من غير أي تسطيب: MongoDB مؤقت جوه التطبيق (`DATABASE_URL=memory`)، أو سيرفرك أو Atlas |
| `postgres` | PostgreSQL (knex) | `docker compose up -d db` أو سيرفرك |
| `mssql` | SQL Server (knex) | `docker compose up -d db` أو سيرفرك |
| `mysql` | MySQL (knex) | `docker compose up -d db` أو سيرفرك |
| `sqlite` | SQLite (knex) | من غير أي تسطيب: ملف `./data/dev.sqlite` |

اللي بيحصل وقت الإنشاء:

- **بيفضل provider واحد:** التمبلت شايل الاتنين (`repositories/mongo` و `repositories/sql`)، والمشروع الجديد بياخد اللي اخترته بس ومعاه الباكدجات بتاعته بس. مفيش service ولا controller بيتغير، لأنهم ما يعرفوش قاعدة البيانات أصلاً.
- **الاسم بيتبدّل** في `package.json` والإعدادات والـ Compose والـ README على اسم الفولدر.
- **`.env` بيتولّد جاهز** بمفتاح JWT وكلمة مرور قاعدة بيانات عشوائيين للمشروع ده بس.
- **`docker-compose.yml` بيتكتب** لقاعدة البيانات اللي اخترتها.
- `--install` بيعمل `npm install` في الآخر.

**اللي اتجرّب فعلاً:** الاختبارات كلها اتشغّلت على **SQLite** و **PostgreSQL 18** و **MongoDB 8**. الـ **SQL Server** و **MySQL** ماشيين على نفس الكود بالظبط (knex)، بس ما اتشغّلوش على سيرفر حقيقي لسه، ونفس الكلام على الـ `Dockerfile` وملفات الـ Compose والتخزين على S3. أول ما تبدأ مشروع على واحد منهم شغّل الاختبارات عليه مرة (`TEST_DATABASE_URL`، شوف "الاختبارات").

> التمبلت نفسه بيشتغل من غير ما تعمل منه مشروع: انسخ `.env.example` باسم `.env` وحط `JWT_SECRET`، وغيّر `DB_CLIENT` زي ما تحب. ده اللي بيتجرّب عليه كل الـ providers.
<!-- /template-only -->

## التشغيل

```bash
npm install
npm run dev          # http://localhost:5000 وبيعيد التشغيل مع كل تعديل
```

- **الإعدادات** في `.env` (المثال في `.env.example`). من غير `JWT_SECRET` التطبيق بيرفض يقوم.
- **قاعدة البيانات** بيحددها `DB_CLIENT` و `DATABASE_URL`. الـ migrations (أو الـ indexes في MongoDB) بتتطبق لوحدها أول ما التطبيق يقوم في التطوير.
- **البيانات التجريبية** بتتزرع لوحدها في التطوير.
- **الإيميل:** `SMTP_HOST` فاضي في التطوير، فمفيش إيميلات بتتبعت (طلب إعادة كلمة المرور بيتسجل في اللوج إنه ما اتبعتش).
- **تجربة الـ endpoints:** ملف `api.http` (بيشتغل من VS Code بإضافة REST Client).

الحسابات التجريبية (كلمة المرور `Password123!`):

| الدور | الحساب | اسم المستخدم |
|---|---|---|
| `Admin` | `admin@example.com` | `admin` |
| `Member` | `member@example.com` | `member` |
| `Member` | `sara@example.com` | `sara` |
| `Member` (موقوف) | `omar@example.com` | `omar` |

## الأوامر

| الأمر | بيعمل إيه |
|---|---|
| `npm run dev` / `npm start` | يشغّل الـ API على `5000` |
| `npm test` | كل الاختبارات على قاعدة بيانات حقيقية من غير تسطيب. شوف "الاختبارات" تحت |
| `npm run lint` | ESLint |
| `npm run new:feature -- Product` | يولّد feature كاملة ويسجلها في كل الأماكن |
| `npm run migrate` | (SQL) يطبّق الـ migrations بإيدك |
| `npm run migrate:make -- add_orders` | (SQL) migration جديدة في `src/repositories/sql/migrations` |
| `npm run migrate:rollback` | (SQL) يرجّع آخر دفعة |
| `docker compose up --build` | قاعدة البيانات + الـ API في containers على `5000` |

## مع تمبلت الـ React

ده الـ API اللي `react-app-template` مستنيه: نفس الـ endpoints والـ envelope والحسابات التجريبية. عشان تربطهم:

1. شغّل الـ API (`npm run dev`). البورت `5000` هو نفس `VITE_DEV_PROXY_TARGET` في الفرونت.
2. في الفرونت خلّي `VITE_USE_MOCK_API=false` وشغّل `npm run dev`.

الفرونت بيترجم أي خطأ من `code` بتاعه (`errors:<code>`). الأكواد اللي الـ API بيطلّعها ومش موجودة لسه في `errors.json` بتاع الفرونت (لحد ما تضيفها هتظهر برسالة السيرفر الإنجليزي). ضيفها جوه نفس الأقسام:

```json
{
    "http": {
        "not_found": "العنصر المطلوب غير موجود",
        "too_many_requests": "محاولات كثيرة، حاول بعد دقيقة",
        "payload_too_large": "حجم الطلب أكبر من المسموح"
    },
    "auth": {
        "invalid_credentials": "بيانات الدخول غير صحيحة",
        "account_locked": "الحساب مقفول مؤقتاً بعد محاولات كثيرة، حاول بعد قليل",
        "account_disabled": "الحساب موقوف",
        "reset_token_invalid": "رابط إعادة التعيين غير صالح أو انتهت صلاحيته"
    },
    "validation": { "malformed": "البيانات المرسلة غير مكتملة أو غير صالحة" },
    "user": {
        "username_taken": "اسم المستخدم مستخدم من قبل",
        "role_unknown": "الدور {{role}} غير موجود",
        "current_password_wrong": "كلمة المرور الحالية غير صحيحة",
        "password_rejected": "كلمة المرور لا تطابق الشروط: 8 أحرف على الأقل وفيها رقم ورمز"
    },
    "file": {
        "empty": "الملف فارغ",
        "type_not_allowed": "نوع الملف غير مسموح",
        "content_mismatch": "محتوى الملف لا يطابق نوعه",
        "too_large": "حجم الملف أكبر من {{limitMb}} ميجابايت"
    },
    "storage": { "unavailable": "تعذّر حفظ الملف، حاول مرة أخرى" }
}
```

```json
{
    "http": {
        "not_found": "The requested item was not found",
        "too_many_requests": "Too many attempts, try again in a minute",
        "payload_too_large": "The request is larger than allowed"
    },
    "auth": {
        "invalid_credentials": "Invalid email or password",
        "account_locked": "The account is locked after too many attempts, try again shortly",
        "account_disabled": "The account is suspended",
        "reset_token_invalid": "The reset link is invalid or has expired"
    },
    "validation": { "malformed": "The request is incomplete or malformed" },
    "user": {
        "username_taken": "The username is already taken",
        "role_unknown": "The role {{role}} does not exist",
        "current_password_wrong": "The current password is incorrect",
        "password_rejected": "The password must be at least 8 characters with a digit and a symbol"
    },
    "file": {
        "empty": "The file is empty",
        "type_not_allowed": "This file type is not allowed",
        "content_mismatch": "The file's content does not match its type",
        "too_large": "The file is larger than {{limitMb}} MB"
    },
    "storage": { "unavailable": "The file could not be saved, try again" }
}
```

## أول ما تبدأ تطبيق جديد

1. غيّر الأدوار في `src/enums/index.js`، والحسابات التجريبية في `src/data/seeder.js`.
2. ولّد الـ features بتاعتك بـ `npm run new:feature`، وشكّل الـ entity والـ schemas على الحقول الحقيقية.
3. امسح مثال الـ Items لما تخلص منه: الـ routes والـ controller والـ service والـ dto والـ repository بتاعته (والـ model أو جدوله في الـ migration)، واختباراته، وأكواد `item.*`، وصفوفه في الـ seeder، وعدّل `dashboardService`.
4. (SQL) لما الموديل يثبت وقبل أول نشر: ادمج الـ migrations في واحدة نضيفة.

## البنية

```
src/
├── server.js                   نقطة البداية: يتصل، يطبّق الـ migrations، يزرع، يسمع
├── app.js                      الـ pipeline كله من غير بورت (الاختبارات بتشغّله جوه الـ process)
├── config/env.js               كل الإعدادات بتتقرا هنا مرة واحدة
├── routes/index.js             كل الـ routes: مين ينادي (authenticate/authorize) + إيه المسموح (validate) + الـ controller
├── controllers/                كل action سطر: ينادي service ويحوّل ردها لـ HTTP بـ respond
├── services/<feature>/         كل البيزنس هنا، وكل function بترجع الـ envelope
│   ├── auth/ · users/          الدخول، التوكن، إدارة الحسابات
│   ├── items/ · dashboard/     المثال (يتمسح)
│   ├── storage/                محلي (uploads/) أو S3-compatible
│   ├── email/                  SMTP بـ nodemailer
│   └── common/fileSniffer.js   نوع الملف من البايتات مش من الاسم
├── repositories/
│   ├── index.js                الباب الوحيد: unitOfWork
│   ├── shared.js               اللي الـ providers متفقين عليه
│   └── mongo/ أو sql/          الـ provider: genericRepository + repositories مخصوصة + entities + (migrations أو models)
├── models/
│   ├── common/                 apiResponse (الـ envelope)، errorCodes، pagination
│   └── dtos/                   شكل كل طلب (zod) وشكل كل رد
├── middlewares/                authenticate/authorize، validate، errorHandler، upload، rateLimit
├── data/                       seeder (بيانات تجريبية) و seedAccountGuard (حماية الـ production)
├── enums/ · utils/ · templates/ (قوالب الإيميل)
tests/                          اختبارات على التطبيق الحقيقي: helpers/api.js
scripts/new-feature.mjs         مولّد الـ features
```

## القواعد اللي البنية ماشية عليها

**الطريق واحد دايماً.** Route ← Controller ← Service ← `unitOfWork` ← قاعدة البيانات. الـ service ما تعرفش HTTP، والـ controller ما فيهوش بيزنس، ومفيش حاجة فوق `repositories/` تعرف إحنا على أنهي قاعدة بيانات.

**كل رد هو الـ envelope:** `{ success, message, data, code, args }`.

- **الفشل المتوقع مش exception:** الـ service بترجع `fail(ErrorCodes.X, "...")`. الـ exceptions للحاجات اللي محدش توقعها بس، والـ `errorHandler` بيحولها لـ 500 من غير ما يسرّب الرسالة.
- **`ErrorCodes` هو العقد مع الفرونت.** الكود ثابت والـ `message` إنجليزي للّوج والاختبارات. خطأ جديد = ثابت هنا + سطرين ترجمة في الفرونت.
- **الـ status code من مكان واحد:** `httpStatus()` في `errorCodes.js`. أي كود آخره `.not_found` بياخد 404 لوحده، والباقي 400 إلا اللي متسجل.
- **أخطاء الـ validation بنفس الشكل:** `validation.fields` ومعاه أسماء الحقول في `args.fields`. والحقول اللي الـ schema ما سمّتهاش بتترمى، فالعميل ما يقدرش يكتب حقل مش مسموح له.

**الصلاحيات على مستويين.**

- `authorize(...)` في الـ route بيقول **مين يقدر ينادي**.
- **مين يشوف أنهي صفوف** بيتحدد جوه الـ service من `(callerId, callerRole)`. شوف `itemService.visibleTo`.
- **مفيش تسجيل ذاتي:** الحسابات بيعملها الأدمن من `POST users` بس.
- **المستخدم له دور واحد.**

**البيانات.**

- **الـ generic repository هو الأصل:** `unitOfWork.repository("name")` لأي entity متسجل في `entities.js`. repository مخصوص بس لما تحتاج استعلامات الـ generic ما يعبّرش عنها.
- **مفيش DELETE حقيقي:** `remove` بيعمل soft delete، وكل القراءات بتستبعد الممسوح.
- **`unitOfWork.transaction(fn)`** لأي كتابتين لازم ينجحوا أو يفشلوا مع بعض. الـ repositories بتدخل فيها لوحدها.
- **الـ id نص UUID** في كل قواعد البيانات (حتى MongoDB)، فالـ API شكله واحد.
- **الـ enums بأساميها** في الـ JSON وفي قاعدة البيانات.
- **التواريخ `Date` بتوقيت UTC** والـ booleans حقيقية، أياً كانت قاعدة البيانات بترجّعهم إزاي.
- **القوايم اللي بتكبر بتتقسّم صفحات:** `paginationQuery` + `repository.page()`. الـ features اللي السكريبت بيولّدها ماشية كده من الأول.

**الملفات.** استخدم `storage` من `services/storage` لأي ملف، و `STORAGE_PROVIDER` هو اللي بيختار محلي ولا object store (للـ S3: `npm install @aws-sdk/client-s3`). الصور الشخصية بس متثبتة على المحلي.

**الأمان.**

- **الأسرار مش في git:** `.env` متجاهَل. من غير `JWT_SECRET` (32 حرف على الأقل) التطبيق بيرفض يقوم.
- **كلمات المرور بـ scrypt** من Node نفسه.
- **التوكن بيتلغي فوراً:** إيقاف حساب أو مسحه أو تغيير دوره أو كلمة مروره بيوقف التوكنات القديمة من أول طلب.
- **القفل بعد 10 محاولات دخول غلط** لمدة 5 دقايق.
- **الحسابات التجريبية بتتقفل في الـ production،** وأول تشغيل محتاج `BOOTSTRAP_ADMIN_PASSWORD` عشان يعمل أول أدمن. `KEEP_DEMO_LOGINS=true` للـ stacks التجريبية بس.

## feature جديدة

```bash
npm run new:feature -- Product
npm test
```

- **بيعمل** الـ schemas والـ service والـ controller والـ router وملف اختبارات، بـ CRUD كامل وقايمة مقسّمة صفحات، ومعاهم الـ entity نفسه: migration (SQL) أو model (MongoDB).
- **بيسجل** الـ route والـ entity وكود `product.not_found` عند علامات `[new-feature:...]`. سيب العلامات دي مكانها.
- **الجمع بيتخمّن** (`Category` ← `Categories`)، ولو غلط: `--plural`.
- **بيرفض** يشتغل مرتين لنفس الاسم، وما بيغيّرش حاجة لو علامة ناقصة.

دور جديد: عضو في `UserRole` (`src/enums/index.js`)، وحساب تجريبي في الـ seeder لو عاوز.

## الاختبارات

`npm test` بيشغّل التطبيق الحقيقي جوه الـ process على قاعدة بيانات حقيقية، من غير أي تسطيب:

- **SQL:** SQLite في الذاكرة.
- **MongoDB:** `mongodb-memory-server` (بينزّل `mongod` مرة واحدة ويحتفظ بيه).

عشان تشغّلها على نفس المحرك اللي الـ production عليه، وجّهها لسيرفر. اسم القاعدة لازم ينتهي بـ `_test`، وإلا الاختبارات بترفض تشتغل:

```bash
TEST_DB_CLIENT=pg TEST_DATABASE_URL=postgres://app:password@localhost:54329/app_test npm test
```

- `npx vitest run tests/items.test.js` لملف واحد.
- الاختبار اللي بيغيّر حساب (إيقاف، قفل، مسح) بيعمل حسابه بـ `createTestUser()`، مش على الحسابات المزروعة.
- `tests/data.test.js` بيختبر الـ repositories نفسها، وهو اللي بيثبت إن أي قاعدة بيانات بتلتزم باللي الـ services معتمدة عليه.

## Docker والنشر

```bash
docker compose up --build     # قاعدة البيانات + الـ API على http://localhost:5000
```

الـ compose للتطوير والتجربة بس (الحسابات التجريبية مفتوحة فيه). في النشر الحقيقي الإعدادات كلها environment variables:

| المتغير | |
|---|---|
| `DB_CLIENT` / `DATABASE_URL` | قاعدة البيانات |
| `JWT_SECRET` / `JWT_ISSUER` / `JWT_AUDIENCE` | المفتاح 32 حرف على الأقل |
| `FRONTEND_URL` | بيتبني منه رابط إعادة كلمة المرور |
| `BEHIND_REVERSE_PROXY=true` | لما يكون ورا nginx (زي `nginx.conf` بتاع تمبلت الـ React) |
| `RUN_MIGRATIONS_ON_STARTUP=true` | لو عاوز الـ container يطبّق الـ migrations وهو قايم |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | أول تشغيل بس، وبعدين يتشالوا |
| `STORAGE_PROVIDER` و `S3_*` / `SMTP_*` | التخزين والإيميل |

والـ container محتاج **volume على `/app/uploads`** (الملفات المرفوعة)، و `/app/data` لو قاعدة البيانات SQLite.

`.github/workflows/ci.yml` بيعمل lint ويشغّل الاختبارات على كل push، وبيرفع الـ image على GHCR من `main`.
