const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');

console.log("-----------------------------------------");
console.log("🚀 جاري بدء تشغيل البوت المطور V3 (نسخة النجوم)...");

// 1. Firebase Initialization
const serviceAccount = require("./serviceAccountKey.json");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// 2. Bot Initialization
const bot = new Telegraf('8419083555:AAHaMuIdIS5VvQ5U_uKtdeAsiH8NQT931yI');
const ADMIN_ID = '7228104866'; 

// --- Stars Purchase Request Watcher ---
db.collection('celebrities').where('notify', '==', true).onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;

        const celeb = change.doc.data();
        const celebId = change.doc.id;
        console.log(`📺 محتوى جديد: ${celeb.name} - جاري إشعار المشتركين...`);

        try {
            // جلب جميع المستخدمين المسجلين
            const usersSnap = await db.collection('users').get();
            const starPrice = Math.round((celeb.price_usd || 0) * 50);
            const caption = `✨ محتوى جديد وحصري!

👤 المشهور: *${celeb.name}*
💰 السعر: *${celeb.price_usd} $* (${starPrice} ⭐)

👾 بادر بالشراء قبل النفاد!`;

            let sent = 0, failed = 0;
            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;
                try {
                    await bot.telegram.sendPhoto(userId, celeb.image_url, {
                        caption: caption,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏪 فتح المتجر واشتري', web_app: { url: 'https://fanspic1.web.app/' } }
                            ]]
                        }
                    });
                    sent++;
                } catch (e) {
                    failed++; // المستخدم قد حظر البوت
                }
                // تأخير بسيط لتجنب حظر تلجرام للإرسال المتتابع
                await new Promise(r => setTimeout(r, 50));
            }

            console.log(`✅ إشعار ${celeb.name}: أرسل لـ ${sent} مستخدم`);

            // إتمام: تحديث العلامة لكي لا ينبه مرة أخرى
            await db.collection('celebrities').doc(celebId).update({ notify: false });

            // إشعار المدير
            bot.telegram.sendMessage(ADMIN_ID, `📣 تم بث إشعار محتوى "${celeb.name}"\n✅ أرسل لـ: ${sent} مشترك`);
        } catch (err) {
            console.error('❌ خطأ في البث:', err.message);
        }
    });
});

// --- Stars Purchase Request Watcher ---
db.collection('stars_purchase').where('status', '==', 'pending').onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
            const req = change.doc.data();
            const docId = change.doc.id;
            
            console.log(`📦 معالجة شراء: ${req.celebrity_name} بقيمة ${req.amount} نجمة`);

            try {
                // تبسيط البيانات (Payload) لأقصى درجة لتجنب خطأ تلجرام
                const shortPayload = `PURCHASE|${docId}|${req.amount}|${req.celebrity_id}`;

                await bot.telegram.sendInvoice(req.user_id, {
                    title: `اسم المنتج: ${req.celebrity_name}`,
                    description: `شراء المحتوى الحصري لـ ${req.celebrity_name}`,
                    payload: shortPayload, // بيانات مختصرة جداً
                    provider_token: "", 
                    currency: "XTR",
                    prices: [{ label: "Stars", amount: parseInt(req.amount) }]
                });

                console.log(`✅ أرسلت الفاتورة للمستخدم ${req.user_id}`);
                await db.collection('stars_purchase').doc(docId).update({ status: 'sent' });

            } catch (err) {
                console.error("❌ خطأ تلجرام:", err.message);
                await db.collection('stars_purchase').doc(docId).update({ status: 'failed', error: err.message });
            }
        }
    });
});

// --- Stars Recharge Request Watcher ---
db.collection('stars_recharge').where('status', '==', 'pending').onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
            const req = change.doc.data();
            const docId = change.doc.id;
            
            try {
                const shortPayload = `RECHARGE|${docId}|${req.amount}`;
                await bot.telegram.sendInvoice(req.user_id, {
                    title: `شحن رصيد: ${req.amount} نجمة`,
                    description: `إضافة نجوم لحسابك في YARD Exclusive`,
                    payload: shortPayload,
                    provider_token: "",
                    currency: "XTR",
                    prices: [{ label: "Stars", amount: parseInt(req.amount) }]
                });
                await db.collection('stars_recharge').doc(docId).update({ status: 'sent' });
            } catch (err) { console.error("❌ خطأ الشحن:", err.message); }
        }
    });
});

// --- Checkout Handlers ---
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    const payloadStr = ctx.message.successful_payment.invoice_payload;
    const parts = payloadStr.split('|'); // تفكيك البيانات المختصرة
    const type = parts[0]; 
    const amount = parseInt(parts[2]);

    console.log(`💰 تم استلام دفع بنجاح: ${type} لعام ${amount} نجمة`);

    if (type === 'RECHARGE') {
        const userId = ctx.from.id.toString();
        await db.collection('users').doc(userId).set({
            balance: admin.firestore.FieldValue.increment(amount)
        }, { merge: true });
        ctx.reply(`🎉 تم شحن رصيدك بـ ${amount} نجمة بنجاح!`);
    } 
    else if (type === 'PURCHASE') {
        const celebId = parts[3];
        const celebDoc = await db.collection('celebrities').doc(celebId).get();
        const celebName = celebDoc.exists ? celebDoc.data().name : "محتوى حصري";

        await db.collection('orders').add({
            user_id: ctx.from.id.toString(),
            user_name: ctx.from.first_name,
            celebrity_name: celebName,
            price: amount / 50,
            status: 'approved',
            payment_method: 'Telegram Stars',
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        ctx.reply(`✅ مبروك! تم شراء محتوى ${celebName} بنجاح.`);
        bot.telegram.sendMessage(ADMIN_ID, `💰 بيع ناجح بالنجوم!\n👤 ${ctx.from.first_name}\n💎 ${amount} نجمة`);
    }
});

bot.launch().then(() => {
    console.log("🚀 البوت V3 يعمل الآن! (جاهز لاستقبال النجوم بدون أخطاء)");
}).catch(err => {
    if (err.message.includes("409")) {
        console.error("❌ خطأ: هناك نسخة أخرى تعمل من البوت. يرجى إغلاقها والانتظار 10 ثوانٍ.");
    } else {
        console.error("❌ خطأ في البدء:", err.message);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));